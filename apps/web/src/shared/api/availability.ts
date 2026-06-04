import type { AvailabilitySlot } from "@vbs/shared";
import { supabase, toBusinessError } from "./supabase";

/** Disponibilità di un giorno (tutti i campi), calcolata e protetta lato DB. */
export const fetchAvailability = async (
  isoDate: string
): Promise<AvailabilitySlot[]> => {
  const { data, error } = await supabase.rpc("get_availability", {
    p_date: isoDate
  });
  const err = toBusinessError(error);
  if (err) throw err;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    courtId: row.court_id as string,
    courtName: row.court_name as string,
    startAt: row.start_at as string,
    endAt: row.end_at as string,
    price: Number(row.price),
    status: row.status as AvailabilitySlot["status"]
  }));
};
