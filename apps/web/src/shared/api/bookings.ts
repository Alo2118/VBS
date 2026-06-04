import type {
  Booking,
  BookingPlayer,
  BookingPolicy,
  Court,
  MemberLite
} from "@vbs/shared";
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
  perHeadPrice: Number(row.per_head_price ?? 0),
  seriesId: (row.series_id as string) ?? undefined,
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
      "cancellation_model, cancellation_hours, max_advance_days, slot_duration_minutes, max_active_bookings_per_member, timezone, min_players, per_head_threshold, cancellation_grace_minutes"
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
    timezone: data!.timezone,
    minPlayers: data!.min_players,
    perHeadThreshold: data!.per_head_threshold,
    cancellationGraceMinutes: data!.cancellation_grace_minutes
  };
};

export type MyBooking = Booking & { players: number };

/**
 * Conteggio dei giocatori per prenotazione. Best-effort: se la tabella della
 * rosa non è disponibile (es. migrazione non ancora applicata) NON deve mai
 * impedire di vedere e disdire le prenotazioni — torna semplicemente vuoto.
 */
const fetchPlayerCounts = async (
  bookingIds: string[]
): Promise<Record<string, number>> => {
  if (bookingIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("booking_players")
      .select("booking_id")
      .in("booking_id", bookingIds);
    if (error) return {};
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const id = (row as { booking_id: string }).booking_id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
};

export const fetchMyBookings = async (): Promise<MyBooking[]> => {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("start_at", { ascending: false });
  const err = toBusinessError(error);
  if (err) throw err;
  const bookings = (data ?? []).map(mapBooking);

  const counts = await fetchPlayerCounts(bookings.map((b) => b.id));
  return bookings.map((b) => ({ ...b, players: counts[b.id] ?? 0 }));
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

// --- Rosa giocatori ---------------------------------------------------------
/** Giocatori in rosa per una prenotazione (capogruppo incluso). */
export const fetchPlayers = async (bookingId: string): Promise<BookingPlayer[]> => {
  const { data, error } = await supabase
    .from("booking_players")
    .select("member_id, members:member_id(full_name, nickname), bookings:booking_id(member_id)")
    .eq("booking_id", bookingId);
  const err = toBusinessError(error);
  if (err) throw err;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const booker = (r.bookings as { member_id?: string } | null)?.member_id;
    const member = r.members as { full_name?: string; nickname?: string } | null;
    return {
      memberId: r.member_id as string,
      fullName: member?.full_name ?? "—",
      nickname: member?.nickname ?? undefined,
      isBooker: r.member_id === booker
    };
  });
};

export const addPlayer = async (bookingId: string, memberId: string): Promise<void> => {
  const { error } = await supabase.rpc("add_player", {
    p_booking_id: bookingId,
    p_member_id: memberId
  });
  const err = toBusinessError(error);
  if (err) throw err;
};

export const removePlayer = async (bookingId: string, memberId: string): Promise<void> => {
  const { error } = await supabase.rpc("remove_player", {
    p_booking_id: bookingId,
    p_member_id: memberId
  });
  const err = toBusinessError(error);
  if (err) throw err;
};

/** Cerca soci con tessera valida (per comporre la rosa) — solo id + nome. */
export const searchValidMembers = async (query: string): Promise<MemberLite[]> => {
  const { data, error } = await supabase.rpc("search_valid_members", { p_query: query });
  const err = toBusinessError(error);
  if (err) throw err;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    fullName: r.full_name as string,
    nickname: (r.nickname as string) ?? undefined
  }));
};

// --- Prenotazioni fisse (ricorrenti) ----------------------------------------
export type RecurringResult = { created: number; skipped: string[]; seriesId: string };

/** Genera le occorrenze settimanali fino alla data (solo staff). */
export const createRecurringBooking = async (
  courtId: string,
  firstStart: string,
  until: string,
  memberId?: string
): Promise<RecurringResult> => {
  const { data, error } = await supabase.rpc("create_recurring_booking", {
    p_court_id: courtId,
    p_first_start: firstStart,
    p_until: until,
    p_member_id: memberId ?? null
  });
  const err = toBusinessError(error);
  if (err) throw err;
  const row = data as Record<string, unknown>;
  return {
    created: Number(row?.created ?? 0),
    skipped: (row?.skipped as string[]) ?? [],
    seriesId: (row?.series_id as string) ?? ""
  };
};
