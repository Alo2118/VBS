import type React from "react";
import { cn } from "./cn";

export const Card = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-2xl border border-slate-800 bg-card/80 p-6 shadow-lg",
      className
    )}
    {...props}
  />
);
