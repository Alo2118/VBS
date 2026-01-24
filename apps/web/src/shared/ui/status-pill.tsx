import { cn } from "./cn";

type StatusTone = "success" | "warning" | "danger" | "info";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-emerald-500/20 text-emerald-300",
  warning: "bg-amber-500/20 text-amber-300",
  danger: "bg-red-500/20 text-red-300",
  info: "bg-sky-500/20 text-sky-300"
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
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
      toneClasses[tone]
    )}
  >
    {label}
  </span>
);
