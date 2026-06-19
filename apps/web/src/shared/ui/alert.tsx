import type { ReactNode } from "react";
import { cn } from "./cn";

export type AlertTone = "success" | "warning" | "danger" | "info";

const toneClasses: Record<AlertTone, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  danger: "border-red-300 bg-red-50 text-red-800",
  info: "border-sky-300 bg-sky-50 text-sky-800"
};

/** Riquadro informativo/di avviso colorato per tono, riusato in tutta l'app. */
export const Alert = ({
  tone = "info",
  className,
  children
}: {
  tone?: AlertTone;
  className?: string;
  children: ReactNode;
}) => (
  <div
    role="alert"
    className={cn("rounded-xl border px-4 py-3 text-base", toneClasses[tone], className)}
  >
    {children}
  </div>
);
