import type React from "react";
import { NavLink } from "react-router-dom";
import { navigationItems } from "@/shared/config/navigation";
import { cn } from "@/shared/ui/cn";
import { Button } from "@/shared/ui/button";
import { StatusPill } from "@/shared/ui/status-pill";
import { signOut } from "@/shared/api/auth";
import { useAuth } from "@/shared/auth/auth-context";

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { profile, isStaff } = useAuth();
  const items = navigationItems.filter((item) => !item.staffOnly || isStaff);

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row md:px-6 md:py-8">
        <aside className="shrink-0 md:w-64">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h1 className="text-xl font-semibold">VBS Beach Volley</h1>
            <p className="mt-1 text-sm text-muted">Prenotazione campi</p>

            <nav className="mt-5 flex flex-row flex-wrap gap-2 md:flex-col">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "rounded-lg px-4 py-2.5 text-base font-medium transition",
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

            {profile && (
              <div className="mt-6 border-t border-slate-800 pt-4">
                <p className="text-sm font-medium text-slate-100">{profile.fullName || profile.email}</p>
                <div className="mt-2">
                  <StatusPill
                    label={profile.membershipStatus === "VALID" ? "Tessera valida" : "Tessera non valida"}
                    tone={profile.membershipStatus === "VALID" ? "success" : "warning"}
                  />
                </div>
                <Button variant="ghost" className="mt-3 w-full" onClick={() => void signOut()}>
                  Esci
                </Button>
              </div>
            )}
          </div>
        </aside>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
};
