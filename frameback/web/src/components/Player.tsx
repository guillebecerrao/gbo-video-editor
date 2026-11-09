import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Comment, Region } from "@core/schema";
import { SPEEDS, useTime, type VideoController } from "../hooks/useVideo";
import { coversTime } from "../lib/comments";
import {
  containedRect, dragRect, isClick, rectFromPoints, regionStyle, toNormalized, type Box, type Handle, type RectRegion,
} from "../lib/region";
import { formatTimecode, frameIndex } from "../lib/time";
import type { Marks } from "../lib/anchor";
import {
  BackIcon, CommentIcon, ForwardIcon, FrameNextIcon, FramePrevIcon, MuteIcon, PauseIcon, PlayIcon, RegionIcon, VolumeIcon,
} from "./icons";

interface PlayerProps {
  video: VideoController;
  videoUrl: string;
  fps: number;
  comments: Comment[];
  focusId: string | null;
  region: Region | null;
  regionTool: boolean;
  /** false while the review is not in the `reviewing` state */
  canAnnotate: boolean;
  marks: Marks;
  onRegion: (r: Region | null) => void;
  onToggleRegionTool: () => void;
  onComment: () => void;
}

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function Player(p: PlayerProps) {
  const { video, fps } = p;
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = containedRect(stage.w, stage.h, video.size.w, video.size.h);

  return (
    <section className="player" aria-label="Video player">
      <div className="stage" ref={stageRef}>
        <video
          ref={video.attach}
          src={p.videoUrl}
          className="video"
          preload="auto"
          playsInline
          onClick={() => !p.regionTool && video.toggle()}
          onDoubleClick={(e) => e.preventDefault()}
        />
        <FrameLayer {...p} frame={frame} />
        <MarksReadout marks={p.marks} fps={fps} />
        {!video.playing && <div className="stage-hint">{p.regionTool ? "Drag to outline a region · click for a point" : ""}</div>}
      </div>
      <Controls {...p} />
    </section>
  );
}

// ------------------------------------------------------------------ frame layer ----

function FrameLayer(p: PlayerProps & { frame: Box }) {
  const { frame, region, regionTool, canAnnotate } = p;
  const layerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<RectRegion | null>(null);
  const gesture = useRef<{ origin: { x: number; y: number } } | null>(null);

  const normalized = (e: { clientX: number; clientY: number }) => {
    const r = layerRef.current!.getBoundingClientRect();
    return toNormalized(e.clientX - r.left, e.clientY - r.top, { x: 0, y: 0, w: r.width, h: r.height });
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!regionTool || !canAnnotate || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { origin: normalized(e) };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const now = normalized(e);
    setDrawing(isClick(g.origin, now, { x: 0, y: 0, w: frame.w, h: frame.h }) ? null : rectFromPoints(g.origin, now));
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    const now = normalized(e);
    setDrawing(null);
    const box = { x: 0, y: 0, w: frame.w, h: frame.h };
    p.onRegion(isClick(g.origin, now, box) ? { shape: "point", x: now.x, y: now.y } : rectFromPoints(g.origin, now));
  };

  return (
    <div
      ref={layerRef}
      className={`frame-layer${regionTool && canAnnotate ? " drawing" : ""}`}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { gesture.current = null; setDrawing(null); }}
    >
      <ExistingRegions video={p.video} comments={p.comments} focusId={p.focusId} />
      {drawing && <div className="region-rect live" style={regionStyle(drawing)} />}
      {region && !drawing && <EditableRegion region={region} layerRef={layerRef} onChange={p.onRegion} locked={!canAnnotate} />}
    </div>
  );
}

function ExistingRegions({ video, comments, focusId }: { video: VideoController; comments: Comment[]; focusId: string | null }) {
  const t = useTime(video.time);
  const shown = comments.filter((c) => c.anchor.region && (c.id === focusId || coversTime(c, t)));
  return (
    <>
      {shown.map((c) => {
        const r = c.anchor.region!;
        const cls = `ghost${c.id === focusId ? " focus" : ""}`;
        return r.shape === "rect" ? (
          <div key={c.id} className={`region-rect ${cls}`} style={regionStyle(r)}><span className="ghost-tag">{c.id.slice(2)}</span></div>
        ) : (
          <div key={c.id} className={`region-point ${cls}`} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}><span className="ghost-tag">{c.id.slice(2)}</span></div>
        );
      })}
    </>
  );
}

function EditableRegion({ region, layerRef, onChange, locked }: {
  region: Region;
  layerRef: React.RefObject<HTMLDivElement>;
  onChange: (r: Region) => void;
  locked: boolean;
}) {
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; orig: Region } | null>(null);

  const norm = (e: { clientX: number; clientY: number }) => {
    const r = layerRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const down = (handle: Handle) => (e: ReactPointerEvent<HTMLElement>) => {
    if (locked || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, start: norm(e), orig: region };
  };
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const now = norm(e);
    const dx = now.x - d.start.x, dy = now.y - d.start.y;
    if (d.orig.shape === "rect") onChange(dragRect(d.orig, d.handle, dx, dy));
    else onChange({ shape: "point", x: Math.min(1, Math.max(0, d.orig.x + dx)), y: Math.min(1, Math.max(0, d.orig.y + dy)) });
  };
  const up = () => { drag.current = null; };

  if (region.shape === "point") {
    return (
      <div
        className="region-point draft"
        style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%` }}
        onPointerDown={down("move")} onPointerMove={move} onPointerUp={up}
      />
    );
  }
  return (
    <div className="region-rect draft" style={regionStyle(region)} onPointerDown={down("move")} onPointerMove={move} onPointerUp={up}>
      {!locked && HANDLES.map((h) => (
        <span key={h} className={`handle handle-${h}`} onPointerDown={down(h)} onPointerMove={move} onPointerUp={up} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------- controls ----

function Timecode({ video, fps }: { video: VideoController; fps: number }) {
  const t = useTime(video.time);
  return (
    <div className="timecode" aria-label="Current time">
      <span className="tc-main">{formatTimecode(t, fps)}</span>
      <span className="tc-sub">f{frameIndex(t, fps)}{video.duration ? ` · ${formatTimecode(video.duration, fps)}` : ""}</span>
    </div>
  );
}

function Controls(p: PlayerProps) {
  const { video, fps } = p;
  return (
    <div className="controls">
      <div className="ctl-group">
        <button className="icon-btn" onClick={() => video.nudge(-1)} title="Back 1 s (Shift+←)" aria-label="Back 1 second"><BackIcon /></button>
        <button className="icon-btn" onClick={() => video.step(-1)} title="Previous frame (←)" aria-label="Previous frame"><FramePrevIcon /></button>
        <button className="icon-btn play" onClick={video.toggle} title="Play / pause (Space, K)" aria-label={video.playing ? "Pause" : "Play"}>
          {video.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button className="icon-btn" onClick={() => video.step(1)} title="Next frame (→)" aria-label="Next frame"><FrameNextIcon /></button>
        <button className="icon-btn" onClick={() => video.nudge(1)} title="Forward 1 s (Shift+→)" aria-label="Forward 1 second"><ForwardIcon /></button>
      </div>

      <Timecode video={video} fps={fps} />

      <div className="seg" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button key={s} className={video.rate === s ? "on" : ""} onClick={() => video.setRate(s)} aria-pressed={video.rate === s}>{s}×</button>
        ))}
      </div>
      <button className="icon-btn" onClick={video.toggleMute} title="Mute (M)" aria-label={video.muted ? "Unmute" : "Mute"}>
        {video.muted ? <MuteIcon /> : <VolumeIcon />}
      </button>

      <div className="spacer" />

      <button
        className={`btn${p.regionTool ? " on" : ""}`}
        onClick={p.onToggleRegionTool}
        disabled={!p.canAnnotate}
        aria-pressed={p.regionTool}
        title="Draw a region on the frame (R)"
      >
        <RegionIcon /> Region <kbd>R</kbd>
      </button>
      <button className="btn primary" onClick={p.onComment} disabled={!p.canAnnotate} title="Comment at the playhead (C)">
        <CommentIcon /> Comment <kbd>C</kbd>
      </button>
    </div>
  );
}

function MarksReadout({ marks, fps }: { marks: Marks; fps: number }) {
  if (marks.in == null && marks.out == null) return null;
  return (
    <div className="marks" title="In / out (I, O · X clears)" role="status">
      <span>In {marks.in != null ? formatTimecode(marks.in, fps) : "—"}</span>
      <span>Out {marks.out != null ? formatTimecode(marks.out, fps) : "—"}</span>
    </div>
  );
}
