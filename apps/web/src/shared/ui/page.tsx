import type React from "react";
import { cn } from "./cn";

export const Page = ({
  title,
  actions,
  children,
  className
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <section className={cn("space-y-6", className)}>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="text-sm text-muted">
          Pianifica attività, monitora prenotazioni e gestisci i clienti.
        </p>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
    {children}
  </section>
);
