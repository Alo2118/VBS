import type { MemberProfile, PriceRule } from "@vbs/shared";
import { supabase, toBusinessError } from "./supabase";

const unwrap = <T>(data: T | null, error: Parameters<typeof toBusinessError>[0]): T => {
  const err = toBusinessError(error);
  if (err) throw err;
  return data as T;
};

// --- Soci -------------------------------------------------------------------
export const fetchMembers = async (): Promise<MemberProfile[]> => {
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, full_name, nickname, email, phone, role, membership_status, membership_start_date, membership_end_date, aics_number"
    )
    .order("membership_status")
    .order("full_name");
  const rows = unwrap(data, error) ?? [];
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    fullName: r.full_name as string,
    nickname: (r.nickname as string) ?? undefined,
    email: (r.email as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    role: r.role as MemberProfile["role"],
    membershipStatus: r.membership_status as MemberProfile["membershipStatus"],
    membershipStartDate: (r.membership_start_date as string) ?? undefined,
    membershipEndDate: (r.membership_end_date as string) ?? undefined,
    aicsNumber: (r.aics_number as string) ?? undefined
  }));
};

export const validateMember = async (params: {
  memberId: string;
  aicsNumber: string;
  startDate: string;
  endDate: string;
}): Promise<void> => {
  const { error } = await supabase.rpc("validate_member", {
    p_member_id: params.memberId,
    p_aics: params.aicsNumber,
    p_start: params.startDate,
    p_end: params.endDate
  });
  const err = toBusinessError(error);
  if (err) throw err;
};

// --- Tariffe (edizione multipla, RF-CFG-7) ----------------------------------
export const fetchPriceRules = async (): Promise<PriceRule[]> => {
  const { data, error } = await supabase
    .from("price_rules")
    .select("id, court_id, weekday, start_time, end_time, price, per_head_price")
    .order("start_time");
  const rows = unwrap(data, error) ?? [];
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    courtId: (r.court_id as string) ?? undefined,
    weekday: (r.weekday as number) ?? undefined,
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    price: Number(r.price),
    perHeadPrice: Number(r.per_head_price ?? 0)
  }));
};

/** Aggiorna in blocco il prezzo di più fasce in un'unica operazione. */
export const bulkUpdatePrice = async (ids: string[], price: number): Promise<number> => {
  const { data, error } = await supabase.rpc("bulk_update_price", {
    p_ids: ids,
    p_price: price
  });
  return unwrap(data, error) as number;
};

/** Aggiorna in blocco la quota a testa (oltre la soglia) di più fasce. */
export const bulkUpdatePerHead = async (ids: string[], price: number): Promise<number> => {
  const { data, error } = await supabase.rpc("bulk_update_per_head", {
    p_ids: ids,
    p_price: price
  });
  return unwrap(data, error) as number;
};

// --- Regole giocatori (policy) ----------------------------------------------
/** Aggiorna le regole modificabili dallo staff (solo ADMIN via RLS). */
export const updatePlayerPolicy = async (params: {
  minPlayers: number;
  perHeadThreshold: number;
  cancellationGraceMinutes: number;
}): Promise<void> => {
  const { error } = await supabase
    .from("booking_policy")
    .update({
      min_players: params.minPlayers,
      per_head_threshold: params.perHeadThreshold,
      cancellation_grace_minutes: params.cancellationGraceMinutes
    })
    .eq("id", 1);
  const err = toBusinessError(error);
  if (err) throw err;
};

// --- No-show ----------------------------------------------------------------
export type DayBooking = {
  id: string;
  courtName: string;
  memberName: string;
  memberNickname?: string;
  startAt: string;
  endAt: string;
  status: string;
  price: number;
  players: number;
};

const BOOKING_SELECT =
  "id, start_at, end_at, status, price, members:member_id(full_name, nickname), courts:court_id(name), booking_players(count)";

const mapDayBooking = (r: Record<string, unknown>): DayBooking => {
  const playersRel = r.booking_players as { count?: number }[] | null;
  const member = r.members as { full_name?: string; nickname?: string } | null;
  return {
    id: r.id as string,
    startAt: r.start_at as string,
    endAt: r.end_at as string,
    status: r.status as string,
    price: Number(r.price ?? 0),
    players: playersRel?.[0]?.count ?? 0,
    memberName: member?.full_name ?? "—",
    memberNickname: member?.nickname ?? undefined,
    courtName: ((r.courts as { name?: string } | null)?.name) ?? "—"
  };
};

export const fetchDayBookings = async (isoDate: string): Promise<DayBooking[]> => {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .gte("start_at", `${isoDate}T00:00:00`)
    .lte("start_at", `${isoDate}T23:59:59`)
    .order("start_at");
  return (unwrap(data, error) ?? []).map(mapDayBooking);
};

/** Prossime prenotazioni confermate (per il dettaglio rapido in dashboard). */
export const fetchUpcomingBookings = async (limit = 20): Promise<DayBooking[]> => {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("status", "CONFIRMED")
    .gt("start_at", new Date().toISOString())
    .order("start_at")
    .limit(limit);
  return (unwrap(data, error) ?? []).map(mapDayBooking);
};

export const markNoShow = async (bookingId: string): Promise<void> => {
  const { error } = await supabase.rpc("mark_no_show", { p_booking_id: bookingId });
  const err = toBusinessError(error);
  if (err) throw err;
};

/** Annulla una mancata presentazione segnata per errore (rimuove l'addebito). */
export const undoNoShow = async (bookingId: string): Promise<void> => {
  const { error } = await supabase.rpc("undo_no_show", { p_booking_id: bookingId });
  const err = toBusinessError(error);
  if (err) throw err;
};

/** Libera un campo (disdetta gestita dallo staff), con o senza penale. */
export const staffCancelBooking = async (
  bookingId: string,
  charge: boolean,
  reason?: string
): Promise<void> => {
  const { error } = await supabase.rpc("staff_cancel_booking", {
    p_booking_id: bookingId,
    p_charge: charge,
    p_reason: reason ?? null
  });
  const err = toBusinessError(error);
  if (err) throw err;
};

/**
 * Annulla in blocco le prenotazioni che ricadono in una chiusura (pioggia,
 * maltempo…) e avvisa i giocatori. Restituisce il numero di campi liberati.
 */
export const cancelBookingsForClosure = async (closureId: string): Promise<number> => {
  const { data, error } = await supabase.rpc("cancel_bookings_for_closure", {
    p_closure_id: closureId
  });
  const err = toBusinessError(error);
  if (err) throw err;
  return (data as number) ?? 0;
};
