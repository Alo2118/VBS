import type React from "react";
import { useId } from "react";
import { cn } from "./cn";

export type SelectOption = { value: string; label: string };

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: SelectOption[];
};

/** Select con label sempre visibile (accessibilità over 50, PRD §10). */
export const Select = ({ label, options, className, id, ...props }: SelectProps) => {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="block text-base font-medium text-ink">
        {label}
      </label>
      <select
        id={selectId}
        className={cn(
          "w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};
