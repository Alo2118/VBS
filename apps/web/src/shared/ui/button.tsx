import type React from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-gradient-strong text-white shadow-hero hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0",
  secondary:
    "border border-line bg-white/90 text-ink shadow-soft hover:-translate-y-0.5 hover:border-sea/40 hover:bg-white",
  ghost: "bg-transparent text-ink hover:bg-sand/50",
  danger: "bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-soft hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base"
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 ease-out disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra uno spinner inline e disabilita il bottone durante l'operazione. */
  loading?: boolean;
};

export const Button = ({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) => (
  <button
    className={cn(
      baseClasses,
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      variantClasses[variant],
      sizeClasses[size],
      className
    )}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...props}
  >
    {loading && (
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current"
        aria-hidden
      />
    )}
    {children}
  </button>
);
