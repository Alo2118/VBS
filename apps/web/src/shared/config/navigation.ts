export type NavItem = {
  label: string;
  path: string;
  staffOnly?: boolean;
};

export const navigationItems: NavItem[] = [
  { label: "Prenota", path: "/bookings" },
  { label: "Le mie prenotazioni", path: "/my-bookings" },
  { label: "Soci", path: "/members", staffOnly: true }
];
