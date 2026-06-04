import type React from "react";
import { useId } from "react";
import { cn } from "./cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

/** Input con label sempre visibile (accessibilità over 50, PRD §10). */
export const Input = ({ label, className, id, ...props }: InputProps) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-base font-medium text-slate-100">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100",
          "placeholder:text-slate-500",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          className
        )}
        {...props}
      />
    </div>
  );
};
