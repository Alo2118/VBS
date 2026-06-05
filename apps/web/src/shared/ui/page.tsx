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
  <section className={cn("space-y-4", className)}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-0.5">
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
        {description && <p className="text-sm text-muted sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
    {children}
  </section>
);
