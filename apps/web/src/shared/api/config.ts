import type { Closure, OpeningRule } from "@vbs/shared";
import { supabase, toBusinessError } from "./supabase";

const guard = (error: Parameters<typeof toBusinessError>[0]) => {
  const err = toBusinessError(error);
  if (err) throw err;
};

// --- Orari di apertura ------------------------------------------------------
export const fetchOpeningRules = async (): Promise<OpeningRule[]> => {
  const { data, error } = await supabase
    .from("opening_rules")
    .select("id, court_id, weekday, open_time, close_time, slot_duration_minutes, active")
    .order("weekday")
    .order("open_time");
  guard(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    courtId: (r.court_id as string) ?? undefined,
    weekday: r.weekday as number,
    openTime: r.open_time as string,
    closeTime: r.close_time as string,
    slotDurationMinutes: r.slot_duration_minutes as number,
    active: r.active as boolean
  }));
};

export const createOpeningRule = async (input: {
  courtId?: string;
  weekday: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
}): Promise<void> => {
  const { error } = await supabase.from("opening_rules").insert({
    court_id: input.courtId ?? null,
    weekday: input.weekday,
    open_time: input.openTime,
    close_time: input.closeTime,
    slot_duration_minutes: input.slotDurationMinutes
  });
  guard(error);
};

export const deleteOpeningRule = async (id: string): Promise<void> => {
  const { error } = await supabase.from("opening_rules").delete().eq("id", id);
  guard(error);
};

// --- Chiusure / eccezioni ---------------------------------------------------
export const fetchClosures = async (): Promise<Closure[]> => {
  const { data, error } = await supabase
    .from("closures")
    .select("id, court_id, start_at, end_at, reason")
    .order("start_at");
  guard(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    courtId: (r.court_id as string) ?? undefined,
    startAt: r.start_at as string,
    endAt: r.end_at as string,
    reason: (r.reason as string) ?? undefined
  }));
};

export const createClosure = async (input: {
  courtId?: string;
  startAt: string;
  endAt: string;
  reason?: string;
}): Promise<void> => {
  const { error } = await supabase.from("closures").insert({
    court_id: input.courtId ?? null,
    start_at: input.startAt,
    end_at: input.endAt,
    reason: input.reason ?? null
  });
  guard(error);
};

export const deleteClosure = async (id: string): Promise<void> => {
  const { error } = await supabase.from("closures").delete().eq("id", id);
  guard(error);
};
