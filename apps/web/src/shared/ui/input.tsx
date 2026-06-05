import type React from "react";
import { useId } from "react";
import { cn } from "./cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Messaggio di errore inline: evidenzia il campo e lo annuncia agli screen reader. */
  error?: string;
};

/** Input con label sempre visibile (accessibilità over 50, PRD §10). */
export const Input = ({ label, className, id, error, ...props }: InputProps) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-base font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "w-full rounded-xl border bg-white px-4 py-3 text-base text-ink",
          "placeholder:text-muted/70 focus-visible:outline-none focus-visible:ring-2",
          error ? "border-red-400 focus-visible:ring-red-400" : "border-line focus-visible:ring-accent",
          className
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
