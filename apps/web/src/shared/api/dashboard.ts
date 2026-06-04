import type { AdminSummary } from "@vbs/shared";
import { supabase, toBusinessError } from "./supabase";

/** Riepilogo per lo staff (numeri chiave). Solo staff: il DB applica il controllo. */
export const fetchAdminSummary = async (): Promise<AdminSummary> => {
  const { data, error } = await supabase.rpc("get_admin_summary");
  const err = toBusinessError(error);
  if (err) throw err;
  // get_admin_summary() restituisce una tabella con una sola riga.
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return {
    bookingsToday: Number(row?.bookings_today ?? 0),
    bookingsUpcoming: Number(row?.bookings_upcoming ?? 0),
    pendingMembers: Number(row?.pending_members ?? 0),
    chargesDueCount: Number(row?.charges_due_count ?? 0),
    chargesDueAmount: Number(row?.charges_due_amount ?? 0),
    expiringSoon: Number(row?.expiring_soon ?? 0)
  };
};
