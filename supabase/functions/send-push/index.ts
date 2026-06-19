// VBS — Edge Function: invia le notifiche Web Push in coda.
//
// Può essere invocata in due modi:
//  1) Database Webhook su INSERT in `notifications` (consigliato, invio
//     istantaneo): Supabase invia { type, table, record, ... } e inviamo la
//     push relativa a `record` (ricaricata dal DB per id, vedi sotto).
//  2) Senza body (o { "drain": true }) da pg_cron / chiamata manuale: drena
//     tutte le notifiche non ancora inviate (sent_at IS NULL).
//
// Sicurezza: la funzione usa la SERVICE ROLE KEY (bypassa RLS), quindi è
// protetta da un secret condiviso. Ogni chiamata DEVE includere l'header
//   x-webhook-secret: <PUSH_WEBHOOK_SECRET>
// Senza secret valido la richiesta è rifiutata (401). Configurare il Database
// Webhook aggiungendo quell'header e impostare il secret con:
//   supabase secrets set PUSH_WEBHOOK_SECRET=<valore-casuale-lungo>
//
// Segreti richiesti (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUSH_WEBHOOK_SECRET,
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (es. mailto:club@dominio.it)
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
//   (--no-verify-jwt è intenzionale: l'autorizzazione passa dal secret sopra,
//    non da un JWT utente, perché il chiamante è il webhook/cron, non un socio.)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
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

const NOTIFICATION_COLUMNS = "id, member_id, title, body, data";

/**
 * Invia la notifica a tutti i dispositivi del socio.
 * Esegue prima un "claim" atomico (marca sent_at solo se ancora NULL) per
 * evitare invii duplicati quando webhook e drain girano in concorrenza.
 * Se nessun invio va a buon fine, ripristina sent_at=NULL per poter ritentare.
 */
async function sendOne(n: NotificationRow): Promise<void> {
  // Claim atomico: solo un worker procede; gli altri trovano 0 righe.
  const { data: claimed } = await admin
    .from("notifications")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", n.id)
    .is("sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return; // già inviata o presa in carico da un altro worker

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("member_id", n.member_id);

  const targets = subs ?? [];
  if (targets.length === 0) return; // nessun dispositivo: nulla da inviare

  const payload = JSON.stringify({
    title: n.title,
    body: n.body,
    tag: n.id,
    url: (n.data?.url as string | undefined) ?? undefined,
    data: n.data
  });

  let delivered = 0;
  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        delivered += 1;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Iscrizione scaduta/rimossa: la cancelliamo.
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          console.error(`send-push: invio fallito (notifica ${n.id}, code ${code ?? "?"})`, err);
        }
      }
    })
  );

  // Se c'erano dispositivi ma nessun invio è riuscito, riapri per il retry.
  if (delivered === 0) {
    await admin.from("notifications").update({ sent_at: null }).eq("id", n.id);
  }
}

Deno.serve(async (req) => {
  // Autorizzazione: secret condiviso obbligatorio (fail-closed).
  if (!webhookSecret || req.headers.get("x-webhook-secret") !== webhookSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    if (body && typeof body === "object" && "record" in body && body.record) {
      // Non ci fidiamo del payload del webhook: ricarichiamo la notifica dal DB
      // usando solo l'id, così non si possono iniettare notifiche arbitrarie.
      const recordId = (body.record as { id?: unknown }).id;
      if (typeof recordId === "string") {
        const { data: row } = await admin
          .from("notifications")
          .select(NOTIFICATION_COLUMNS)
          .eq("id", recordId)
          .is("sent_at", null)
          .maybeSingle();
        if (row) await sendOne(row as NotificationRow);
      }
    } else {
      const { data } = await admin
        .from("notifications")
        .select(NOTIFICATION_COLUMNS)
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
    console.error("send-push: errore non gestito", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
