export type MembershipStatus = "VALID" | "EXPIRED" | "SUSPENDED";
export type BookingStatus = "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "COMPLETED";
export type PaymentMethod = "CASH" | "SATISPAY" | "WALLET";

export type Role =
  | "ADMIN"
  | "MANAGER"
  | "FRONT_DESK"
  | "BAR_STAFF"
  | "COACH";

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
