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
  price: number;
  freeCancellationDeadline: string;
  createdBy?: string;
  createdAt: string;
  cancelledAt?: string;
  cancelledBy?: string;
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
}

/** Slot calcolato per la griglia di disponibilità (giorno × campo × orario). */
export interface AvailabilitySlot {
  courtId: string;
  startAt: string;
  endAt: string;
  price: number;
  status: "FREE" | "TAKEN" | "UNAVAILABLE";
}
