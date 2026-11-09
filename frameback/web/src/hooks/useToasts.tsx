import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface Toast { id: number; kind: "info" | "error"; text: string }

interface ToastApi {
  info: (text: string) => void;
  error: (err: unknown) => void;
}

const ToastContext = createContext<ToastApi>({ info: () => {}, error: () => {} });
export const useToasts = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3000);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    info: (text) => push("info", text),
    error: (err) => push("error", err instanceof Error ? err.message : String(err)),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
