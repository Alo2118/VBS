import type React from "react";
import { cn } from "./cn";

export const Card = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-xl border border-slate-800 bg-card/80 p-4 shadow-sm sm:p-5",
      className
    )}
    {...props}
  />
);
