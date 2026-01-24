export type MembershipStatus = "VALID" | "EXPIRED" | "SUSPENDED";
export type BookingStatus = "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";
export type PaymentMethod = "CASH" | "SATISPAY" | "WALLET";

export type Role =
  | "ADMIN"
  | "MANAGER"
  | "FRONT_DESK"
  | "BAR_STAFF"
  | "COACH";

export const roles: Role[] = [
  "ADMIN",
  "MANAGER",
  "FRONT_DESK",
  "BAR_STAFF",
  "COACH"
];

export interface BookingPolicy {
  cancellationHours: number;
  maxAdvanceDays: number;
  slotDurationMinutes: number;
}

export interface NotificationPolicy {
  emailEnabled: boolean;
  smsEnabled: boolean;
}

export type WalletMovementType = "TOP_UP" | "PURCHASE" | "REFUND" | "ADJUSTMENT";

export interface MemberProfile {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  membershipStatus: MembershipStatus;
  membershipStartDate?: string;
  membershipEndDate?: string;
  aicsNumber?: string;
}
