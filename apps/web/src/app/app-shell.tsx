import type React from "react";
import { NavLink } from "react-router-dom";
import { navigationItems } from "@/shared/config/navigation";
import { cn } from "@/shared/ui/cn";

export const AppShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-slate-950">
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-6 py-8">
      <aside className="w-64 shrink-0">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h1 className="text-xl font-semibold">VBS Manager</h1>
          <p className="mt-2 text-sm text-muted">Gestione impianti sportivi</p>
          <nav className="mt-6 flex flex-col gap-2">
            {navigationItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-accent text-slate-900"
                      : "text-slate-100 hover:bg-slate-800"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  </div>
);
