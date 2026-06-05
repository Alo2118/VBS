import type React from "react";
import { NavLink } from "react-router-dom";
import { navGroupOrder, navigationItems } from "@/shared/config/navigation";
import { cn } from "@/shared/ui/cn";
import { Button } from "@/shared/ui/button";
import { BrandFooter, BrandMark } from "@/shared/ui/brand";
import { StatusPill } from "@/shared/ui/status-pill";
import { NotificationBell } from "@/shared/ui/notification-bell";
import { signOut } from "@/shared/api/auth";
import { useAuth } from "@/shared/auth/auth-context";

const MembershipPill = ({ valid }: { valid: boolean }) => (
  <StatusPill
    label={valid ? "Tessera valida" : "Tessera non valida"}
    tone={valid ? "success" : "warning"}
  />
);

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { profile, isStaff, isCashier } = useAuth();
  const canSee = (item: (typeof navigationItems)[number]) =>
    (!item.staffOnly && !item.cashier) ||
    (item.staffOnly && isStaff) ||
    (item.cashier && isCashier);
  const items = navigationItems.filter(canSee);
  const valid = profile?.membershipStatus === "VALID";

  return (
    <div className="min-h-screen bg-surface">
      {/* Testata (solo mobile): gradiente mare→sole, identità, stato, uscita */}
      <header className="sticky top-0 z-20 bg-brand-gradient px-4 py-2.5 shadow-hero md:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandMark size="md" tone="light" className="min-w-0" />
          <div className="flex shrink-0 items-center gap-2">
            {profile && <NotificationBell onDark />}
            {profile && (
              <Button variant="secondary" size="sm" onClick={() => void signOut()}>
                Esci
              </Button>
            )}
          </div>
        </div>
        {profile && (
          <div className="mt-2">
            <MembershipPill valid={valid} />
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 md:flex-row md:gap-6 md:px-6 md:py-6">
        {/* Sidebar (solo desktop) */}
        <aside className="hidden shrink-0 md:block md:w-64">
          <div className="sticky top-6 rounded-2xl border border-line bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-2">
              <BrandMark size="md" />
              {profile && <NotificationBell />}
            </div>

            <nav className="mt-5 flex flex-col gap-4">
              {navGroupOrder.map((group) => {
                const groupItems = items.filter((i) => i.group === group);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group} className="flex flex-col gap-1.5">
                    <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {group}
                    </p>
                    {groupItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-xl px-4 py-2.5 text-base font-medium transition",
                            isActive
                              ? "bg-brand-gradient text-white shadow-soft"
                              : "text-ink hover:bg-sand/40"
                          )
                        }
                      >
                        <span aria-hidden>{item.icon}</span>
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                );
              })}
            </nav>

            {profile && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-sm font-medium text-ink">
                  {profile.fullName || profile.email}
                </p>
                <div className="mt-2">
                  <MembershipPill valid={valid} />
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
      <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-line bg-card/95 px-2 py-1.5 backdrop-blur md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium transition",
                isActive ? "bg-brand-gradient text-white shadow-soft" : "text-muted hover:bg-sand/40"
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
