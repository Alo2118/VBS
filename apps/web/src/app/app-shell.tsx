import type React from "react";
import { NavLink } from "react-router-dom";
import { navigationItems } from "@/shared/config/navigation";
import { cn } from "@/shared/ui/cn";
import { Button } from "@/shared/ui/button";
import { BrandFooter, BrandMark } from "@/shared/ui/brand";
import { StatusPill } from "@/shared/ui/status-pill";
import { NotificationBell } from "@/shared/ui/notification-bell";
import { signOut } from "@/shared/api/auth";
import { useAuth } from "@/shared/auth/auth-context";

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { profile, isStaff } = useAuth();
  const items = navigationItems.filter((item) => !item.staffOnly || isStaff);
  const valid = profile?.membershipStatus === "VALID";

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Barra superiore (solo mobile): identità app, stato tessera, uscita */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-4 py-2.5 backdrop-blur md:hidden">
        <BrandMark size="md" className="min-w-0" />
        <div className="flex shrink-0 items-center gap-2">
          {profile && <NotificationBell />}
          {profile && (
            <StatusPill
              label={valid ? "Tessera valida" : "Tessera non valida"}
              tone={valid ? "success" : "warning"}
            />
          )}
          {profile && (
            <Button variant="secondary" size="sm" onClick={() => void signOut()}>
              Esci
            </Button>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:px-6 md:py-8">
        {/* Sidebar (solo desktop) */}
        <aside className="hidden shrink-0 md:block md:w-64">
          <div className="sticky top-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between gap-2">
              <BrandMark size="md" />
              {profile && <NotificationBell />}
            </div>

            <nav className="mt-5 flex flex-col gap-2">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-4 py-2.5 text-base font-medium transition",
                      isActive
                        ? "bg-accent text-slate-900"
                        : "text-slate-100 hover:bg-slate-800"
                    )
                  }
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {profile && (
              <div className="mt-6 border-t border-slate-800 pt-4">
                <p className="text-sm font-medium text-slate-100">
                  {profile.fullName || profile.email}
                </p>
                <div className="mt-2">
                  <StatusPill
                    label={valid ? "Tessera valida" : "Tessera non valida"}
                    tone={valid ? "success" : "warning"}
                  />
                </div>
                <Button variant="ghost" className="mt-3 w-full" onClick={() => void signOut()}>
                  Esci
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* Contenuto: padding inferiore per non finire sotto la barra mobile */}
        <main className="flex-1 pb-24 md:pb-0">
          {children}
          <BrandFooter className="mt-8" />
        </main>
      </div>

      {/* Barra di navigazione inferiore (solo mobile): target ampi, scrollabile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-slate-800 bg-slate-900/95 px-2 py-1.5 backdrop-blur md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-medium transition",
                isActive ? "bg-accent text-slate-900" : "text-slate-300 hover:bg-slate-800"
              )
            }
          >
            <span className="text-xl leading-none" aria-hidden>
              {item.icon}
            </span>
            <span className="whitespace-nowrap">{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
