import type React from "react";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { navGroupOrder, navigationItems } from "@/shared/config/navigation";
import { cn } from "@/shared/ui/cn";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { BrandFooter, BrandMark } from "@/shared/ui/brand";
import { StatusPill } from "@/shared/ui/status-pill";
import { NotificationBell } from "@/shared/ui/notification-bell";
import { signOut } from "@/shared/api/auth";
import { useAuth } from "@/shared/auth/auth-context";

/** Quante voci mostrare direttamente nella barra mobile prima di raggrupparle in «Altro». */
const MOBILE_INLINE_MAX = 5;
const MOBILE_PRIMARY = 4;

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

  // Barra mobile: se le voci sono troppe, ne mostro alcune e raccolgo le altre in «Altro».
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const overflow = items.length > MOBILE_INLINE_MAX;
  const primaryItems = overflow ? items.slice(0, MOBILE_PRIMARY) : items;
  const extraItems = overflow ? items.slice(MOBILE_PRIMARY) : [];
  const extraActive = extraItems.some((i) => i.path === location.pathname);

  const navItemClass = (isActive: boolean) =>
    cn(
      "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-medium transition",
      isActive ? "bg-brand-gradient text-white shadow-soft" : "text-muted hover:bg-sand/40"
    );

  return (
    <div className="min-h-screen bg-surface">
      {/* Testata (solo mobile): gradiente mare→sole, identità, stato, uscita */}
      <header className="sticky top-0 z-20 bg-brand-gradient px-4 py-2 shadow-hero md:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandMark size="md" tone="light" showSubtitle={false} className="min-w-0" />
          <div className="flex shrink-0 items-center gap-2">
            {profile && <NotificationBell onDark />}
            {profile && (
              <Button variant="secondary" size="sm" onClick={() => void signOut()}>
                Esci
              </Button>
            )}
          </div>
        </div>
        {/* La pill compare solo quando serve (tessera non valida); da valida è una riga in meno. */}
        {profile && !valid && (
          <div className="mt-1.5">
            <MembershipPill valid={valid} />
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 md:flex-row md:gap-6 md:px-6 md:py-6">
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
          <BrandFooter className="mt-6 hidden md:block" />
        </main>
      </div>

      {/* Barra di navigazione inferiore (solo mobile): voci dirette + «Altro» se troppe */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-line bg-card/95 px-2 py-1.5 backdrop-blur md:hidden">
        {primaryItems.map((item) => (
          <NavLink key={item.path} to={item.path} className={({ isActive }) => navItemClass(isActive)}>
            <span className="text-xl leading-none" aria-hidden>
              {item.icon}
            </span>
            <span className="truncate">{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}
        {overflow && (
          <button type="button" onClick={() => setMoreOpen(true)} className={navItemClass(extraActive)}>
            <span className="text-xl leading-none" aria-hidden>
              ⋯
            </span>
            <span>Altro</span>
          </button>
        )}
      </nav>

      {/* Menù «Altro»: le restanti sezioni in una griglia comoda da toccare */}
      <Modal open={moreOpen} title="Altro" onClose={() => setMoreOpen(false)}>
        <div className="grid grid-cols-3 gap-2">
          {extraItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center text-sm font-medium transition",
                  isActive ? "border-accent bg-sand/40 text-ink" : "border-line text-ink hover:bg-sand/40"
                )
              }
            >
              <span className="text-2xl leading-none" aria-hidden>
                {item.icon}
              </span>
              <span className="leading-tight">{item.shortLabel ?? item.label}</span>
            </NavLink>
          ))}
        </div>
      </Modal>
    </div>
  );
};
