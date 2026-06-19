import type { AppNotification } from "@vbs/shared";
import { supabase, toBusinessError } from "./supabase";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  booking_id: string | null;
  created_at: string;
  read_at: string | null;
}

const mapRow = (r: NotificationRow): AppNotification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  data: r.data ?? {},
  bookingId: r.booking_id ?? undefined,
  createdAt: r.created_at,
  readAt: r.read_at ?? undefined
});

/** Avvisi del socio corrente, più recenti prima. */
export const fetchNotifications = async (limit = 30): Promise<AppNotification[]> => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, data, booking_id, created_at, read_at")
    .eq("member_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  const err = toBusinessError(error);
  if (err) throw err;
  return (data as NotificationRow[]).map(mapRow);
};

/** Marca come letti gli avvisi indicati (solo quelli ancora non letti). */
export const markNotificationsRead = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
  const err = toBusinessError(error);
  if (err) throw err;
};
