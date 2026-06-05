export type NavGroup = "Gioco" | "Cassa" | "Gestione";

export type NavItem = {
  label: string;
  /** Etichetta breve per la barra inferiore su mobile. */
  shortLabel?: string;
  path: string;
  icon: string;
  /** Visibile solo alla gestione (ADMIN/MANAGER/FRONT_DESK). */
  staffOnly?: boolean;
  /** Visibile a chi gestisce gli incassi (gestione + personale bar). */
  cashier?: boolean;
  /** Sezione nel menù (desktop). */
  group: NavGroup;
};

export const navigationItems: NavItem[] = [
  { label: "Prenota", path: "/bookings", icon: "🏐", group: "Gioco" },
  { label: "Le mie prenotazioni", shortLabel: "Le mie", path: "/my-bookings", icon: "📅", group: "Gioco" },
  { label: "Il mio conto", shortLabel: "Conto", path: "/account", icon: "👛", group: "Gioco" },
  { label: "Cassa", path: "/cassa", icon: "💰", cashier: true, group: "Cassa" },
  { label: "Bar", path: "/bar", icon: "🍹", cashier: true, group: "Cassa" },
  { label: "Riepilogo", path: "/dashboard", icon: "📊", staffOnly: true, group: "Gestione" },
  { label: "Presenze", path: "/attendance", icon: "✅", staffOnly: true, group: "Gestione" },
  { label: "Soci", path: "/members", icon: "👥", staffOnly: true, group: "Gestione" },
  { label: "Orari", path: "/schedule", icon: "🕒", staffOnly: true, group: "Gestione" },
  { label: "Tariffe", path: "/pricing", icon: "💶", staffOnly: true, group: "Gestione" }
];

export const navGroupOrder: NavGroup[] = ["Gioco", "Cassa", "Gestione"];
