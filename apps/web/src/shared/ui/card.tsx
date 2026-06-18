import type React from "react";
import { cn } from "./cn";

export const Card = ({
  className,
  /** Aggiunge un leggero sollevamento al passaggio del mouse (per card cliccabili). */
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) => (
  <div
    className={cn(
      "rounded-2.5xl border border-line/80 bg-card/95 p-3.5 shadow-card backdrop-blur-sm sm:p-5",
      interactive &&
        "cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-sea/40 hover:shadow-lift",
      className
    )}
    {...props}
  />
);
