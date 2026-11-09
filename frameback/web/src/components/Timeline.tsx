import {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent,
} from "react";
import type { Waveform } from "@core/api";
import type { Comment, EntityRef, Review, Timeline as TimelineData, TimelineItem } from "@core/schema";
import { useTime, type TimeStore } from "../hooks/useVideo";
import { isResolved, spanOf } from "../lib/comments";
import { clamp, formatClock, formatSpan } from "../lib/time";
import {
  indexTrack, itemEnd, mergeRuns, packRows, tickStep, visibleItems, visibleWindow, type IndexedTrack,
} from "../lib/virtual";

export const GUTTER = 128;
const RULER_H = 26;
const MAX_PPS = 800;
const WORDS_LABEL_MIN_PPS = 70;
const MARKER_LABEL_MIN_PPS = 40;
const DRAG_THRESHOLD_PX = 4;
const DENSE_MIN_ITEMS = 300;
const DENSE_PX_PER_ITEM = 6;

export interface TimelineProps {
  timeline: TimelineData | null;
  timelineInfo: Review["timeline"];
  fps: number;
  duration: number;
  comments: Comment[];
  time: TimeStore;
  /** range (or in-only point) about to be commented on */
  selection: { start: number; end: number | null } | null;
  entity: EntityRef | null;
  focusId: string | null;
  waveform: Waveform | null;
  height: number;
  onHeight: (h: number) => void;
  onSeek: (t: number) => void;
  onPickEntity: (trackId: string, item: TimelineItem) => void;
  onRange: (start: number, end: number) => void;
  onFocusComment: (id: string) => void;
}

interface View { left: number; width: number }

export function Timeline(p: TimelineProps) {
  const { duration, time } = p;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ left: 0, width: 800 });
  const [userPps, setUserPps] = useState<number | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const pendingScroll = useRef<number | null>(null);
  const interacting = useRef(false);

  const fit = Math.max(0.5, (view.width - GUTTER - 24) / Math.max(duration, 1));
  const pps = clamp(userPps ?? fit, fit, MAX_PPS);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const viewRef = useRef(view);
  viewRef.current = view;
  const contentW = GUTTER + Math.max(duration, 1) * pps;

  const indexed = useMemo<IndexedTrack[]>(() => (p.timeline?.tracks ?? []).map(indexTrack), [p.timeline]);

  // ---- viewport tracking
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      setView((v) => (v.left === sc.scrollLeft && v.width === sc.clientWidth ? v : { left: sc.scrollLeft, width: sc.clientWidth }));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    sc.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(sc);
    return () => {
      sc.removeEventListener("scroll", schedule);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // ---- zoom
  const zoomAt = useCallback((next: number, clientX: number) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const x = clientX - sc.getBoundingClientRect().left;
    const tAt = (sc.scrollLeft + x - GUTTER) / ppsRef.current;
    const target = clamp(next, 0.0001, MAX_PPS);
    pendingScroll.current = tAt * Math.max(target, 0) + GUTTER - x;
    setUserPps(target);
  }, []);

  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (sc && pendingScroll.current != null) {
      sc.scrollLeft = Math.max(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  }, [pps]);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    // Wheel notches arrive faster than a render: fold them into one zoom per animation frame.
    const acc = { factor: 1, x: 0, raf: 0 };
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      acc.factor *= Math.exp(-e.deltaY * 0.002);
      acc.x = e.clientX;
      if (acc.raf) return;
      acc.raf = requestAnimationFrame(() => {
        acc.raf = 0;
        const f = acc.factor;
        acc.factor = 1;
        zoomAt(ppsRef.current * f, acc.x);
      });
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => { sc.removeEventListener("wheel", onWheel); cancelAnimationFrame(acc.raf); };
  }, [zoomAt]);

  // ---- keep the playhead in view
  useEffect(() => time.subscribe(() => {
    const sc = scrollRef.current;
    if (!sc || interacting.current) return;
    const x = GUTTER + time.get() * ppsRef.current;
    const { left, width } = viewRef.current;
    if (x < left + GUTTER + 8 || x > left + width - 24) sc.scrollLeft = Math.max(0, x - GUTTER - (width - GUTTER) * 0.3);
  }), [time]);

  const timeAt = (clientX: number) => {
    const rect = contentRef.current!.getBoundingClientRect();
    return clamp((clientX - rect.left - GUTTER) / ppsRef.current, 0, duration);
  };

  const { t0, t1 } = visibleWindow(view.left, view.width, pps, GUTTER);
  const sliderValue = fit >= MAX_PPS ? 0 : Math.log(pps / fit) / Math.log(MAX_PPS / fit);
  const warnings = p.timelineInfo?.warnings ?? [];

  return (
    <section className="timeline" style={{ height: p.height }} aria-label="Timeline">
      <ResizeGrip height={p.height} onHeight={p.onHeight} />
      <div className="tl-toolbar">
        <span className="tl-title">Timeline</span>
        {p.timelineInfo?.approximate && <span className="chip warn" title="Cut positions are derived from EDL durations, so they may drift from the rendered video.">approximate (from EDL)</span>}
        {warnings.length > 0 && (
          <div className="popover-anchor">
            <button className="chip warn" onClick={() => setWarningsOpen((o) => !o)} aria-expanded={warningsOpen}>
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </button>
            {warningsOpen && <ul className="popover" onMouseLeave={() => setWarningsOpen(false)}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </div>
        )}
        {!p.timeline && <span className="tl-note">No edit structure for this video. Add a <code>.timeline.json</code> sidecar or an <code>edl.json</code> to see cuts and words here.</span>}
        <div className="spacer" />
        <label className="zoom">
          Zoom
          <input
            type="range" min={0} max={1} step={0.005} value={sliderValue} aria-label="Timeline zoom"
            onChange={(e) => {
              const v = Number(e.target.value);
              const sc = scrollRef.current;
              const rect = sc?.getBoundingClientRect();
              // Zoom around the playhead when it is on screen, otherwise around the middle of the view.
              let anchorX = rect ? rect.left + GUTTER + (rect.width - GUTTER) / 2 : 0;
              if (sc && rect) {
                const headX = GUTTER + time.get() * ppsRef.current - sc.scrollLeft;
                if (headX >= GUTTER && headX <= rect.width) anchorX = rect.left + headX;
              }
              zoomAt(v === 0 ? fit : fit * Math.pow(MAX_PPS / fit, v), anchorX);
            }}
          />
        </label>
        <button className="btn small" onClick={() => setUserPps(null)}>Fit</button>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" ref={contentRef} style={{ width: contentW }}>
          <Ruler
            duration={duration} pps={pps} t0={t0} t1={t1}
            timeAt={timeAt} onSeek={p.onSeek} onRange={p.onRange} interacting={interacting}
          />
          <CommentsLane comments={p.comments} pps={pps} focusId={p.focusId} onFocus={p.onFocusComment} t0={t0} t1={t1} />
          {p.waveform && <WaveformLane wave={p.waveform} duration={duration} pps={pps} view={view} timeAt={timeAt} onSeek={p.onSeek} />}
          {indexed.map((idx) => (
            <TrackLane
              key={idx.track.id} idx={idx} pps={pps} t0={t0} t1={t1} fps={p.fps} entity={p.entity}
              timeAt={timeAt} onSeek={p.onSeek} onPick={p.onPickEntity}
            />
          ))}
          {p.selection && <SelectionOverlay start={p.selection.start} end={p.selection.end} pps={pps} />}
          <Playhead time={time} pps={pps} />
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------ pieces ----

function ResizeGrip({ height, onHeight }: { height: number; onHeight: (h: number) => void }) {
  const start = useRef<{ y: number; h: number } | null>(null);
  return (
    <div
      className="tl-grip" role="separator" aria-orientation="horizontal" aria-label="Resize timeline" tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { y: e.clientY, h: height }; }}
      onPointerMove={(e) => {
        if (start.current) onHeight(clamp(start.current.h + (start.current.y - e.clientY), 120, window.innerHeight * 0.7));
      }}
      onPointerUp={() => { start.current = null; }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") onHeight(clamp(height + 24, 120, window.innerHeight * 0.7));
        if (e.key === "ArrowDown") onHeight(clamp(height - 24, 120, window.innerHeight * 0.7));
      }}
    />
  );
}

function Playhead({ time, pps }: { time: TimeStore; pps: number }) {
  const t = useTime(time);
  return <div className="playhead" style={{ left: GUTTER + t * pps }}><span className="playhead-cap" /></div>;
}

function SelectionOverlay({ start, end, pps }: { start: number; end: number | null; pps: number }) {
  const isRange = end != null && end > start;
  return (
    <div
      className={`tl-selection${isRange ? "" : " point"}`}
      style={{ left: GUTTER + start * pps, width: isRange ? (end - start) * pps : 0 }}
    />
  );
}

interface RulerProps {
  duration: number; pps: number; t0: number; t1: number;
  timeAt: (clientX: number) => number;
  onSeek: (t: number) => void;
  onRange: (start: number, end: number) => void;
  interacting: React.MutableRefObject<boolean>;
}

function Ruler({ duration, pps, t0, t1, timeAt, onSeek, onRange, interacting }: RulerProps) {
  const step = tickStep(pps);
  const decimals = step >= 1 ? 0 : Math.abs(step * 10 - Math.round(step * 10)) < 1e-6 ? 1 : 2;
  const ticks: number[] = [];
  const minorStep = step / 5;
  const showMinor = minorStep * pps >= 8;
  const first = Math.floor(t0 / (showMinor ? minorStep : step)) * (showMinor ? minorStep : step);
  for (let t = first; t <= Math.min(t1, duration) + 1e-9; t += showMinor ? minorStep : step) ticks.push(Math.round(t * 1000) / 1000);

  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const gesture = useRef<{ x: number; a: number; moved: boolean } | null>(null);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    interacting.current = true;
    gesture.current = { x: e.clientX, a: timeAt(e.clientX), moved: false };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.moved && Math.abs(e.clientX - g.x) < DRAG_THRESHOLD_PX) return;
    g.moved = true;
    setDrag({ a: g.a, b: timeAt(e.clientX) });
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    interacting.current = false;
    setDrag(null);
    if (!g) return;
    const b = timeAt(e.clientX);
    if (g.moved && Math.abs(b - g.a) > 1e-3) onRange(Math.min(g.a, b), Math.max(g.a, b));
    else onSeek(b);
  };

  return (
    <div className="tl-ruler" style={{ height: RULER_H }}>
      <div className="tl-corner">Time</div>
      <div
        className="ruler-track" style={{ left: GUTTER, width: Math.max(duration, 1) * pps }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up}
        title="Click to seek · drag to select a range"
      >
        {ticks.map((t) => {
          const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
          return (
            <span key={t} className={`tick${major ? " major" : ""}`} style={{ left: t * pps }}>
              {major && <span className="tick-label">{formatClock(t, decimals)}</span>}
            </span>
          );
        })}
        {drag && <div className="ruler-drag" style={{ left: Math.min(drag.a, drag.b) * pps, width: Math.abs(drag.b - drag.a) * pps }} />}
      </div>
    </div>
  );
}

const CommentsLane = memo(function CommentsLane(p: {
  comments: Comment[]; pps: number; focusId: string | null; onFocus: (id: string) => void; t0: number; t1: number;
}) {
  const MIN_W_PX = 10;
  const spans = p.comments.map((c) => {
    const { start, end } = spanOf(c);
    return { start, end: Math.max(end, start + MIN_W_PX / p.pps) };
  });
  const { rows, count } = packRows(spans);
  const height = Math.min(count, 4) * 16 + 8;
  return (
    <div className="lane lane-comments" style={{ height }}>
      <div className="lane-label">Comments</div>
      <div className="lane-track" style={{ left: GUTTER }}>
        {p.comments.map((c, i) => {
          const { start, end } = spanOf(c);
          if (end < p.t0 || start > p.t1) return null;
          const isRange = end > start;
          return (
            <button
              key={c.id}
              className={`cm st-${c.agent.status}${isResolved(c) ? " resolved" : ""}${isRange ? " range" : " point"}${c.id === p.focusId ? " focus" : ""}`}
              style={{ left: start * p.pps, width: isRange ? (end - start) * p.pps : undefined, top: 4 + Math.min(rows[i], 3) * 16 }}
              onClick={(e) => { e.stopPropagation(); p.onFocus(c.id); }}
              title={`${isResolved(c) ? "Resolved · " : ""}${c.id} · ${c.category} · ${c.body.slice(0, 80)}`}
              aria-label={`Comment ${c.id}`}
            />
          );
        })}
      </div>
    </div>
  );
});

function WaveformLane({ wave, duration, pps, view, timeAt, onSeek }: {
  wave: Waveform; duration: number; pps: number; view: View;
  timeAt: (clientX: number) => number; onSeek: (t: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = 40;
  const width = Math.max(0, Math.min(view.width - GUTTER, Math.max(duration, 1) * pps - view.left));

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--wave").trim() || "#5b8cff";
    const perPx = (wave.buckets / Math.max(wave.duration, 1e-6)) / pps; // buckets per pixel
    for (let x = 0; x < width; x++) {
      const b0 = Math.floor(((view.left + x) / pps) * (wave.buckets / Math.max(wave.duration, 1e-6)));
      const b1 = Math.max(b0 + 1, Math.ceil(b0 + perPx));
      let peak = 0;
      for (let b = b0; b < b1 && b < wave.peaks.length; b++) peak = Math.max(peak, wave.peaks[b] ?? 0);
      const h = Math.max(1, peak * (height - 6));
      ctx.fillRect(x, (height - h) / 2, 1, h);
    }
  }, [wave, pps, view.left, width]);

  return (
    <div className="lane lane-wave" style={{ height }}>
      <div className="lane-label">Audio</div>
      <div className="lane-track" style={{ left: GUTTER }} onClick={(e) => onSeek(timeAt(e.clientX))}>
        <canvas ref={ref} style={{ left: view.left, width, height }} />
      </div>
    </div>
  );
}

const hueOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

interface TrackLaneProps {
  idx: IndexedTrack; pps: number; t0: number; t1: number; fps: number; entity: EntityRef | null;
  timeAt: (clientX: number) => number;
  onSeek: (t: number) => void;
  onPick: (trackId: string, item: TimelineItem) => void;
}

const TrackLane = memo(function TrackLane({ idx, pps, t0, t1, fps, entity, timeAt, onSeek, onPick }: TrackLaneProps) {
  const { track } = idx;
  const items = visibleItems(idx, t0, t1);
  const isWords = track.id === "words";
  // Level of detail: when items are a few pixels apart, draw merged density blocks instead of thousands of buttons.
  const dense = track.kind !== "markers" && items.length > DENSE_MIN_ITEMS && ((t1 - t0) * pps) / items.length < DENSE_PX_PER_ITEM;
  if (dense) {
    const runs = mergeRuns(items, 3 / pps);
    return (
      <div className={`lane lane-${track.id}`} style={{ height: isWords ? 22 : 28 }}>
        <div className="lane-label" title={track.label}>{track.label}<span className="lane-count">{track.items.length}</span></div>
        <div className="lane-track" style={{ left: GUTTER }} onClick={(e) => onSeek(timeAt(e.clientX))} title="Zoom in to pick individual items">
          {runs.map((r, i) => (
            <span key={i} className="block dense" style={{ left: r.start * pps, width: Math.max(2, (r.end - r.start) * pps) }} />
          ))}
        </div>
      </div>
    );
  }
  const height = isWords ? 22 : 28;
  const showWordText = pps >= WORDS_LABEL_MIN_PPS;
  return (
    <div className={`lane lane-${track.id}`} style={{ height }}>
      <div className="lane-label" title={track.label}>{track.label}<span className="lane-count">{track.items.length}</span></div>
      <div className="lane-track" style={{ left: GUTTER }} onClick={(e) => onSeek(timeAt(e.clientX))}>
        {items.map((it) => {
          const selected = entity?.track === track.id && entity.id === it.id;
          const tip = `${it.label ?? it.id} · ${formatSpan(it.start, itemEnd(it), fps)}`;
          if (track.kind === "markers") {
            const speakerChange = it.meta?.speakerChange === true;
            return (
              <button
                key={it.id}
                className={`marker type-${it.type}${speakerChange ? " speaker-change" : ""}${selected ? " selected" : ""}`}
                style={{ left: it.start * pps }}
                title={tip}
                onClick={(e) => { e.stopPropagation(); onPick(track.id, it); }}
              >
                {pps >= MARKER_LABEL_MIN_PPS && !isWords && <span className="marker-label">{it.label ?? ""}</span>}
              </button>
            );
          }
          const w = Math.max(2, (itemEnd(it) - it.start) * pps);
          const speaker = it.type === "speaker" ? { "--hue": hueOf(String(it.meta?.speaker ?? it.label ?? it.id)) } : {};
          return (
            <button
              key={it.id}
              className={`block type-${it.type}${selected ? " selected" : ""}`}
              style={{ left: it.start * pps, width: w, ...speaker } as React.CSSProperties}
              title={tip}
              onClick={(e) => { e.stopPropagation(); onPick(track.id, it); }}
            >
              {(!isWords || showWordText) && w > 14 && <span className="block-label">{it.label ?? ""}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
});
