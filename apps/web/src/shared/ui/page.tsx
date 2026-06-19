import type React from "react";
import { cn } from "./cn";

export const Page = ({
  title,
  description,
  actions,
  children,
  className
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={cn("animate-fade-up space-y-2.5 md:space-y-3", className)}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="mt-0.5 h-6 w-1 shrink-0 rounded-full bg-brand-gradient-strong sm:h-7"
        />
        <div className="space-y-0.5">
          <h2 className="text-base font-bold sm:text-xl">{title}</h2>
          {description && <p className="text-xs text-muted sm:text-sm">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
    {children}
  </section>
);
