import { cn } from "./cn";

export type StatusTone = "success" | "warning" | "danger" | "info";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  danger: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20"
};

const dotClasses: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500"
};

export const StatusPill = ({
  label,
  tone = "info"
}: {
  label: string;
  tone?: StatusTone;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
      toneClasses[tone]
    )}
  >
    <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} />
    {label}
  </span>
);
