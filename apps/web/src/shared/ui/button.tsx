import type React from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-gradient-to-br from-sea to-sea-deep text-white shadow-soft hover:brightness-105",
  secondary: "border border-line bg-white text-ink hover:bg-sand/40",
  ghost: "bg-transparent text-ink hover:bg-sand/40",
  danger: "bg-red-500 text-white hover:bg-red-400"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base"
};

const baseClasses = "rounded-xl font-semibold transition";

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
      baseClasses,
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      variantClasses[variant],
      sizeClasses[size],
      className
    )}
    {...props}
  />
);
