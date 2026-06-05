import { cn } from "./cn";

type StatusTone = "success" | "warning" | "danger" | "info";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-700"
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
