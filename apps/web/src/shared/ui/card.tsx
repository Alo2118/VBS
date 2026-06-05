import type React from "react";
import { cn } from "./cn";

export const Card = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-line bg-card p-4 shadow-soft sm:p-5",
      className
    )}
    {...props}
  />
);
