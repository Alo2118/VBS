// Tipi/DTO condivisi tra API (Supabase) e Web. Allineati allo schema Postgres
// (vedi supabase/migrations). Unica fonte di verità dei contratti di dominio.

export type MembershipStatus = "PENDING" | "VALID" | "EXPIRED" | "SUSPENDED";
export type BookingStatus = "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";
export type ChargeType = "LATE_CANCELLATION" | "NO_SHOW";
export type ChargeStatus = "DUE" | "PAID" | "WAIVED";
export type PaymentMethod = "CASH" | "SATISPAY" | "WALLET";
export type CancellationModel = "CALENDAR_DAY_BEFORE" | "ROLLING_HOURS";

export type Role =
  | "ADMIN"
  | "MANAGER"
  | "FRONT_DESK"
  | "BAR_STAFF"
  | "COACH"
  | "MEMBER";

/** Tutti i ruoli previsti. */
export const ROLES: Role[] = [
  "ADMIN",
  "MANAGER",
  "FRONT_DESK",
  "BAR_STAFF",
  "COACH",
  "MEMBER"
];

/** Ruoli che possono operare per conto dei soci (gestione, validazione, incassi). */
export const STAFF_ROLES: Role[] = ["ADMIN", "MANAGER", "FRONT_DESK"];

/** Codici errore di business restituiti dalle funzioni Supabase. */
export type BusinessErrorCode =
  | "MEMBERSHIP_NOT_VALID"
  | "SLOT_TAKEN"
  | "OUTSIDE_BOOKING_WINDOW"
  | "CANCELLATION_LATE"
  | "BOOKING_NOT_FOUND"
  | "NOT_AUTHORIZED";

export interface MemberProfile {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: Role;
  membershipStatus: MembershipStatus;
  membershipStartDate?: string;
  membershipEndDate?: string;
  aicsNumber?: string;
  validatedBy?: string;
  validatedAt?: string;
}

export interface Court {
  id: string;
  name: string;
  active: boolean;
}

export interface OpeningRule {
  id: string;
  courtId?: string;
  /** 0 = domenica … 6 = sabato (Postgres EXTRACT(DOW)). */
  weekday: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  active: boolean;
}

export interface PriceRule {
  id: string;
  courtId?: string;
  weekday?: number;
  startTime: string;
  endTime: string;
  price: number;
  /** Quota fissa a testa quando si supera la soglia di giocatori. */
  perHeadPrice: number;
}

export interface Closure {
  id: string;
  courtId?: string;
  startAt: string;
  endAt: string;
  reason?: string;
}

export interface Booking {
  id: string;
  courtId: string;
  memberId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  /** Prezzo del campo per lo slot (penale del capogruppo). */
  price: number;
  /** Quota a testa applicata oltre la soglia (snapshot). */
  perHeadPrice: number;
  /** Identifica le occorrenze di una prenotazione fissa. */
  seriesId?: string;
  freeCancellationDeadline: string;
  createdBy?: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

/** Un giocatore nella rosa di uno slot. */
export interface BookingPlayer {
  memberId: string;
  fullName: string;
  isBooker: boolean;
}

/** Socio (minimo) restituito dalla ricerca per comporre la rosa. */
export interface MemberLite {
  id: string;
  fullName: string;
}

export interface Charge {
  id: string;
  bookingId: string;
  memberId: string;
  type: ChargeType;
  amount: number;
  status: ChargeStatus;
  reason?: string;
  createdAt: string;
  settledAt?: string;
  settledBy?: string;
}

export interface BookingPolicy {
  cancellationModel: CancellationModel;
  cancellationHours: number;
  maxAdvanceDays: number;
  slotDurationMinutes: number;
  maxActiveBookingsPerMember: number;
  timezone: string;
  /** Minimo di soci validi richiesti per giocare uno slot. */
  minPlayers: number;
  /** Oltre questo numero di giocatori si passa alla quota fissa a testa. */
  perHeadThreshold: number;
}

export type SlotStatus = "FREE" | "TAKEN" | "UNAVAILABLE";

/** Slot calcolato per la griglia di disponibilità (giorno × campo × orario). */
export interface AvailabilitySlot {
  courtId: string;
  courtName: string;
  startAt: string;
  endAt: string;
  price: number;
  status: SlotStatus;
}

/** Slot della vista settimanale: come AvailabilitySlot ma con il giorno (YYYY-MM-DD). */
export interface WeekSlot extends AvailabilitySlot {
  day: string;
}

/** Numeri chiave per il riepilogo dello staff (dashboard). */
export interface AdminSummary {
  bookingsToday: number;
  bookingsUpcoming: number;
  pendingMembers: number;
  chargesDueCount: number;
  chargesDueAmount: number;
  expiringSoon: number;
  /** Slot in arrivo sotto il minimo di giocatori. */
  underfilled: number;
}
