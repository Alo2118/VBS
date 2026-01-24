import type React from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent text-slate-900 hover:bg-sky-300",
  secondary: "bg-slate-700 text-slate-100 hover:bg-slate-600",
  ghost: "bg-transparent text-slate-100 hover:bg-slate-800",
  danger: "bg-red-500 text-white hover:bg-red-400"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base"
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = ({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) => (
  <button
    className={cn(
      "rounded-lg font-semibold transition",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      variantClasses[variant],
      sizeClasses[size],
      className
    )}
    {...props}
  />
);
