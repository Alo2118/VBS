import type { ReactNode } from "react";
import { cn } from "./cn";

export type SegmentedOption<T extends string> = { value: T; label: ReactNode };

/**
 * Gruppo di scelta a pulsanti (toggle/radio) accessibile e coerente: usato per
 * metodo di pagamento, tipo addebito, listino/importo libero, ecc.
 * Target tattile ≥44px e focus-visible, con stato attivo a gradiente.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div>
      {label && <span className="mb-1.5 block text-base font-medium text-ink">{label}</span>}
      <div role="radiogroup" aria-label={label} className={cn("flex gap-2", className)}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-base font-medium transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border-transparent bg-brand-gradient-strong text-white shadow-hero"
                  : "border-line bg-white/60 hover:-translate-y-px hover:border-sea/40 hover:bg-sand/40"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
