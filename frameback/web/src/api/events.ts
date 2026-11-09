/** Server-sent events with explicit resume (`since`) and exponential backoff. */
import type { Event } from "@core/schema";

export interface EventStreamHandlers {
  onEvent: (e: Event) => void;
  onConnection: (live: boolean) => void;
}

const MIN_DELAY = 500;
const MAX_DELAY = 8000;

/** Opens the stream and keeps it open; returns a function that closes it. */
export function openEventStream(rid: string, since: number, handlers: EventStreamHandlers): () => void {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSeq = since;
  let delay = MIN_DELAY;
  let closed = false;

  const connect = () => {
    source = new EventSource(`/api/reviews/${encodeURIComponent(rid)}/events?since=${lastSeq}`);
    source.onopen = () => {
      delay = MIN_DELAY;
      handlers.onConnection(true);
    };
    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as Event;
        if (event.seq <= lastSeq) return;
        lastSeq = event.seq;
        handlers.onEvent(event);
      } catch { /* ignore malformed messages */ }
    };
    source.onerror = () => {
      // EventSource would retry on its own but without our `since`; take over.
      source?.close();
      handlers.onConnection(false);
      if (closed) return;
      timer = setTimeout(connect, delay);
      delay = Math.min(MAX_DELAY, delay * 2);
    };
  };
  connect();

  return () => {
    closed = true;
    clearTimeout(timer);
    source?.close();
  };
}
