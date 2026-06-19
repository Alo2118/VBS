import type React from "react";
import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: ToastTone };

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(
  () => undefined
);

/** Sistema unico di notifiche (DEV_BEST_PRACTICE §4.4). */
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              "flex animate-scale-in items-start gap-3 rounded-2xl border px-4 py-3 text-base font-medium shadow-lift backdrop-blur-sm",
              t.tone === "success" && "border-emerald-300 bg-emerald-50/95 text-emerald-800",
              t.tone === "error" && "border-red-300 bg-red-50/95 text-red-800",
              t.tone === "info" && "border-sky-300 bg-sky-50/95 text-sky-800"
            )}
          >
            <span aria-hidden className="mt-0.5 shrink-0 text-lg leading-none">
              {t.tone === "success" ? "✅" : t.tone === "error" ? "⚠️" : "ℹ️"}
            </span>
            <span className="min-w-0">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
