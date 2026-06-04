export type NavItem = {
  label: string;
  path: string;
  staffOnly?: boolean;
};

export const navigationItems: NavItem[] = [
  { label: "Prenota", path: "/bookings" },
  { label: "Le mie prenotazioni", path: "/my-bookings" },
  { label: "Soci", path: "/members", staffOnly: true },
  { label: "Tariffe", path: "/pricing", staffOnly: true },
  { label: "Presenze", path: "/attendance", staffOnly: true },
  { label: "Addebiti", path: "/charges", staffOnly: true }
];
