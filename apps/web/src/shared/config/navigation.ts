export type NavItem = {
  label: string;
  /** Etichetta breve per la barra inferiore su mobile. */
  shortLabel?: string;
  path: string;
  icon: string;
  staffOnly?: boolean;
};

export const navigationItems: NavItem[] = [
  { label: "Prenota", path: "/bookings", icon: "🏐" },
  { label: "Le mie prenotazioni", shortLabel: "Le mie", path: "/my-bookings", icon: "📅" },
  { label: "Il mio conto", shortLabel: "Conto", path: "/account", icon: "👛" },
  { label: "Riepilogo", path: "/dashboard", icon: "📊", staffOnly: true },
  { label: "Cassa", path: "/cassa", icon: "💰", staffOnly: true },
  { label: "Bar", path: "/bar", icon: "🍹", staffOnly: true },
  { label: "Presenze", path: "/attendance", icon: "✅", staffOnly: true },
  { label: "Soci", path: "/members", icon: "👥", staffOnly: true },
  { label: "Orari", path: "/schedule", icon: "🕒", staffOnly: true },
  { label: "Tariffe", path: "/pricing", icon: "💶", staffOnly: true }
];
