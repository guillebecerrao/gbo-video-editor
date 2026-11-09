/** Video element controller: playback, frame stepping and a high-frequency playhead store. */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { clamp, stepFrames } from "../lib/time";

/** Playhead position as an external store: only the few components that draw it re-render on every frame. */
export class TimeStore {
  private value = 0;
  private listeners = new Set<() => void>();
  get = () => this.value;
  set(t: number) {
    if (t === this.value) return;
    this.value = t;
    this.listeners.forEach((l) => l());
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };
}

export const useTime = (store: TimeStore): number => useSyncExternalStore(store.subscribe, store.get);

export const SPEEDS = [0.5, 1, 1.5, 2] as const;

export interface VideoController {
  attach: (el: HTMLVideoElement | null) => void;
  element: HTMLVideoElement | null;
  time: TimeStore;
  playing: boolean;
  rate: number;
  muted: boolean;
  duration: number;
  size: { w: number; h: number };
  seek: (t: number) => void;
  /** Resolves once the frame at `t` is displayed (used before taking a snapshot). */
  seekAndWait: (t: number) => Promise<void>;
  step: (frames: number) => void;
  nudge: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** "L" semantics: play, and speed up one notch each further press while already playing. */
  forward: () => void;
  setRate: (r: number) => void;
  toggleMute: () => void;
}

export function useVideo(fps: number, knownDuration: number | null): VideoController {
  const [element, setElement] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const time = useMemo(() => new TimeStore(), []);
  const fpsRef = useRef(fps);
  fpsRef.current = fps;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  useEffect(() => {
    const el = element;
    if (!el) return;
    const sync = () => {
      setPlaying(!el.paused && !el.ended);
      setRateState(el.playbackRate);
      setMuted(el.muted);
    };
    const onMeta = () => {
      if (Number.isFinite(el.duration)) setDuration(el.duration);
      setSize({ w: el.videoWidth, h: el.videoHeight });
    };
    const onTime = () => time.set(el.currentTime);
    const withFrames = typeof el.requestVideoFrameCallback === "function";
    let handle = 0;
    const onFrame: VideoFrameRequestCallback = (_now, meta) => {
      time.set(meta.mediaTime);
      handle = el.requestVideoFrameCallback(onFrame);
    };
    if (withFrames) handle = el.requestVideoFrameCallback(onFrame);

    const events = ["play", "pause", "ended", "ratechange", "volumechange"] as const;
    events.forEach((e) => el.addEventListener(e, sync));
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("seeked", onTime);
    if (!withFrames) el.addEventListener("timeupdate", onTime);
    onMeta();
    sync();
    return () => {
      events.forEach((e) => el.removeEventListener(e, sync));
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("seeked", onTime);
      el.removeEventListener("timeupdate", onTime);
      if (withFrames) el.cancelVideoFrameCallback(handle);
    };
  }, [element, time]);

  const seek = useCallback((t: number) => {
    if (!element) return;
    const target = clamp(t, 0, durationRef.current || t);
    element.currentTime = target;
    time.set(target);
  }, [element, time]);

  const seekAndWait = useCallback((t: number) => new Promise<void>((resolve) => {
    if (!element) return resolve();
    if (Math.abs(element.currentTime - t) < 0.5 / fpsRef.current && !element.seeking) return resolve();
    const done = () => {
      element.removeEventListener("seeked", done);
      resolve();
    };
    element.addEventListener("seeked", done);
    element.currentTime = t;
    time.set(t);
  }), [element, time]);

  const pause = useCallback(() => element?.pause(), [element]);
  const play = useCallback(() => {
    if (!element) return;
    if (element.ended) element.currentTime = 0;
    void element.play().catch(() => {});
  }, [element]);
  const toggle = useCallback(() => (element?.paused ? play() : pause()), [element, play, pause]);

  const step = useCallback((frames: number) => {
    if (!element) return;
    element.pause();
    seek(stepFrames(time.get(), frames, fpsRef.current, durationRef.current));
  }, [element, seek, time]);

  const nudge = useCallback((seconds: number) => seek(time.get() + seconds), [seek, time]);

  const setRate = useCallback((r: number) => {
    if (element) element.playbackRate = r;
  }, [element]);

  const forward = useCallback(() => {
    if (!element) return;
    if (element.paused) {
      element.playbackRate = 1;
      play();
      return;
    }
    const next = SPEEDS.find((s) => s > element.playbackRate) ?? SPEEDS[SPEEDS.length - 1];
    element.playbackRate = next;
  }, [element, play]);

  const toggleMute = useCallback(() => {
    if (element) element.muted = !element.muted;
  }, [element]);

  return {
    attach: setElement, element, time, playing, rate, muted, duration, size,
    seek, seekAndWait, step, nudge, play, pause, toggle, forward, setRate, toggleMute,
  };
}
