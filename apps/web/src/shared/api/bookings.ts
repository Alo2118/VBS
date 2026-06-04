import type { Booking, BookingPolicy, Court } from "@vbs/shared";
import { supabase, toBusinessError } from "./supabase";

/** Mappa una riga snake_case del DB nel tipo Booking camelCase condiviso. */
const mapBooking = (row: Record<string, unknown>): Booking => ({
  id: row.id as string,
  courtId: row.court_id as string,
  memberId: row.member_id as string,
  startAt: row.start_at as string,
  endAt: row.end_at as string,
  status: row.status as Booking["status"],
  price: Number(row.price),
  freeCancellationDeadline: row.free_cancellation_deadline as string,
  createdBy: (row.created_by as string) ?? undefined,
  createdAt: row.created_at as string,
  cancelledAt: (row.cancelled_at as string) ?? undefined,
  cancelledBy: (row.cancelled_by as string) ?? undefined
});

export const fetchCourts = async (): Promise<Court[]> => {
  const { data, error } = await supabase
    .from("courts")
    .select("id, name, active")
    .eq("active", true)
    .order("name");
  const err = toBusinessError(error);
  if (err) throw err;
  return (data ?? []) as Court[];
};

export const fetchBookingPolicy = async (): Promise<BookingPolicy> => {
  const { data, error } = await supabase
    .from("booking_policy")
    .select(
      "cancellation_model, cancellation_hours, max_advance_days, slot_duration_minutes, max_active_bookings_per_member, timezone"
    )
    .eq("id", 1)
    .single();
  const err = toBusinessError(error);
  if (err) throw err;
  return {
    cancellationModel: data!.cancellation_model,
    cancellationHours: data!.cancellation_hours,
    maxAdvanceDays: data!.max_advance_days,
    slotDurationMinutes: data!.slot_duration_minutes,
    maxActiveBookingsPerMember: data!.max_active_bookings_per_member,
    timezone: data!.timezone
  };
};

export const fetchMyBookings = async (): Promise<Booking[]> => {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("start_at", { ascending: false });
  const err = toBusinessError(error);
  if (err) throw err;
  return (data ?? []).map(mapBooking);
};

/** Crea una prenotazione (atomica lato DB; lancia BusinessError su conflitto/tessera). */
export const createBooking = async (
  courtId: string,
  startAt: string
): Promise<Booking> => {
  const { data, error } = await supabase.rpc("create_booking", {
    p_court_id: courtId,
    p_start_at: startAt
  });
  const err = toBusinessError(error);
  if (err) throw err;
  return mapBooking(data as Record<string, unknown>);
};

/** Disdice una prenotazione; il DB genera l'eventuale addebito se tardiva. */
export const cancelBooking = async (bookingId: string): Promise<Booking> => {
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId
  });
  const err = toBusinessError(error);
  if (err) throw err;
  return mapBooking(data as Record<string, unknown>);
};
