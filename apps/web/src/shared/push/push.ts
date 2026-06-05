import { supabase } from "@/shared/api/supabase";

// Chiave pubblica VAPID (impostata in build come VITE_VAPID_PUBLIC_KEY).
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = "unsupported" | "unconfigured" | "denied" | "on" | "off";

const supported = (): boolean =>
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  typeof window !== "undefined" &&
  "PushManager" in window &&
  "Notification" in window;

/** Converte la chiave VAPID base64url nel formato richiesto da subscribe(). */
const urlBase64ToUint8Array = (base64: string): BufferSource => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
};

/** Stato corrente delle notifiche push su questo dispositivo. */
export const getPushState = async (): Promise<PushState> => {
  if (!supported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
};

/** Attiva le notifiche push e registra l'iscrizione sul backend. */
export const enablePush = async (): Promise<void> => {
  if (!supported()) throw new Error("Notifiche non supportate su questo dispositivo.");
  if (!VAPID_PUBLIC_KEY) throw new Error("Notifiche push non ancora configurate.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permesso per le notifiche negato.");
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    }));

  const json = sub.toJSON();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sessione scaduta, accedi di nuovo.");

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      member_id: auth.user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      user_agent: navigator.userAgent,
      last_seen_at: new Date().toISOString()
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
};

/** Disattiva le notifiche push su questo dispositivo. */
export const disablePush = async (): Promise<void> => {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
};
