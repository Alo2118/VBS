// VBS — Edge Function: invia le notifiche Web Push in coda.
//
// Può essere invocata in due modi:
//  1) Database Webhook su INSERT in `notifications` (consigliato, invio
//     istantaneo): Supabase invia { type, table, record, ... } e inviamo la
//     push relativa a `record`.
//  2) Senza body (o { "drain": true }) da pg_cron / chiamata manuale: drena
//     tutte le notifiche non ancora inviate (sent_at IS NULL).
//
// Segreti richiesti (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (es. mailto:club@dominio.it)
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@vicenzabeachsummer.it";

webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

interface NotificationRow {
  id: string;
  member_id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/** Invia la notifica a tutti i dispositivi del socio e la marca come inviata. */
async function sendOne(n: NotificationRow): Promise<void> {
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("member_id", n.member_id);

  const payload = JSON.stringify({ title: n.title, body: n.body, tag: n.id, data: n.data });

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Iscrizione scaduta/rimossa: la cancelliamo.
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    })
  );

  await admin.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", n.id);
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    if (body && typeof body === "object" && "record" in body && body.record) {
      await sendOne(body.record as NotificationRow);
    } else {
      const { data } = await admin
        .from("notifications")
        .select("id, member_id, title, body, data")
        .is("sent_at", null)
        .limit(100);
      for (const n of (data ?? []) as NotificationRow[]) {
        await sendOne(n);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
