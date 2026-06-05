import { useCallback, useEffect, useMemo, useState } from "react";
import type { Booking, BookingPolicy } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { StatusPill } from "@/shared/ui/status-pill";
import { useToast } from "@/shared/ui/toast";
import { cancelBooking, fetchBookingPolicy, fetchMyBookings } from "@/shared/api/bookings";
import type { MyBooking } from "@/shared/api/bookings";
import { RosterModal } from "@/shared/booking/roster-modal";
import { addDays, formatDay, formatTime, isSameDay } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";
import { perPlayerShare } from "@/shared/utils/pricing";

const statusLabel: Record<
  Booking["status"],
  { label: string; tone: "success" | "warning" | "danger" | "info" }
> = {
  CONFIRMED: { label: "Confermata", tone: "success" },
  CANCELLED: { label: "Annullata", tone: "info" },
  NO_SHOW: { label: "Mancata presentazione", tone: "danger" },
  COMPLETED: { label: "Completata", tone: "info" }
};

/** Colore del campo (pallino), coerente coi nomi Giallo/Bianco/Verde. */
const courtColor = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes("giall")) return "#facc15";
  if (n.includes("verde")) return "#22c55e";
  if (n.includes("bianc")) return "#cbd5e1";
  return "#38bdf8";
};

/** Data amichevole: Oggi / Domani / "mer 11 giugno". */
const friendlyDay = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return "Oggi";
  if (isSameDay(d, addDays(now, 1))) return "Domani";
  return formatDay(d);
};

/** Quante prenotazioni passate mostrare per volta (la lista cresce nel tempo). */
const PAST_PAGE = 8;

export const MyBookingsPage = () => {
  const notify = useToast();
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<MyBooking | null>(null);
  const [roster, setRoster] = useState<MyBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [pastLimit, setPastLimit] = useState(PAST_PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBookings(await fetchMyBookings());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchBookingPolicy().then(setPolicy).catch(() => undefined);
  }, []);

  // Disdetta tardiva (penale): gratuita entro il termine OPPURE entro la
  // finestra di tolleranza dalla prenotazione, in linea con la regola DB.
  const isLate = (b: Booking) => {
    if (new Date() <= new Date(b.freeCancellationDeadline)) return false;
    const grace = policy?.cancellationGraceMinutes ?? 0;
    const graceEnd = new Date(b.createdAt).getTime() + grace * 60_000;
    return Date.now() > graceEnd;
  };

  const onCancel = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await cancelBooking(target.id);
      const wasLate = isLate(target);
      notify(
        wasLate
          ? "Prenotazione disdetta. È dovuto il pagamento del campo."
          : "Prenotazione disdetta gratuitamente.",
        wasLate ? "info" : "success"
      );
      setTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Disdetta non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const lateCancellation = useMemo(() => (target ? isLate(target) : false), [target, policy]);

  const isUpcoming = (b: Booking) =>
    b.status === "CONFIRMED" && new Date(b.startAt) > new Date();

  // Prossime in ordine cronologico (la più vicina in alto); il resto sotto.
  const { upcoming, past } = useMemo(() => {
    const up = bookings.filter(isUpcoming).sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
    const pa = bookings.filter((b) => !isUpcoming(b));
    return { upcoming: up, past: pa };
  }, [bookings]);

  const renderUpcoming = (b: MyBooking) => {
    const minPlayers = policy?.minPlayers ?? 4;
    const missing = Math.max(0, minPlayers - b.players);
    const complete = b.players >= minPlayers;
    const share =
      policy && b.players > 0
        ? perPlayerShare({
            players: b.players,
            courtPrice: b.price,
            perHeadPrice: b.perHeadPrice,
            threshold: policy.perHeadThreshold
          })
        : null;

    return (
      <Card key={b.id} className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xl font-bold">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ background: courtColor(b.courtName) }}
                aria-hidden
              />
              <span className="truncate">Campo {b.courtName}</span>
            </p>
            <p className="mt-1 text-base">
              <span className="font-semibold capitalize text-ink">{friendlyDay(b.startAt)}</span>{" "}
              <span className="text-muted">
                · {formatTime(b.startAt)}–{formatTime(b.endAt)}
                {b.seriesId ? " · fissa" : ""}
              </span>
            </p>
          </div>
          <StatusPill {...statusLabel[b.status]} />
        </div>

        {/* Stato della squadra: chiaro a colpo d'occhio */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-base font-medium">
            👥 {b.players} {b.players === 1 ? "giocatore" : "giocatori"}
          </span>
          {complete ? (
            <StatusPill label="Squadra al completo" tone="success" />
          ) : (
            <StatusPill
              label={missing === 1 ? "Manca 1 giocatore" : `Mancano ${missing} giocatori`}
              tone="warning"
            />
          )}
          {share !== null && (
            <span className="text-base text-muted">· {formatEur(share)} a testa</span>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setRoster(b)}>
            Gestisci giocatori
          </Button>
          <Button variant="danger" size="lg" className="flex-1" onClick={() => setTarget(b)}>
            Disdici
          </Button>
        </div>
      </Card>
    );
  };

  const renderPast = (b: MyBooking) => (
    <Card key={b.id} className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ background: courtColor(b.courtName) }}
              aria-hidden
            />
            <span className="truncate">Campo {b.courtName}</span>
          </p>
          <p className="mt-0.5 text-base text-muted">
            <span className="capitalize">{friendlyDay(b.startAt)}</span> · {formatTime(b.startAt)}–
            {formatTime(b.endAt)}
          </p>
        </div>
        <StatusPill {...statusLabel[b.status]} />
      </div>
      {b.status === "CANCELLED" && b.cancellationReason && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Motivo: {b.cancellationReason}
        </p>
      )}
    </Card>
  );

  return (
    <Page title="Le mie prenotazioni">
      {loading ? (
        <Spinner />
      ) : bookings.length === 0 ? (
        <Card>
          <p className="text-center text-base text-muted">
            Non hai ancora prenotazioni. Vai su «Prenota» per riservare un campo.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Prossime ({upcoming.length})
            </h3>
            {upcoming.length === 0 ? (
              <Card>
                <p className="text-center text-base text-muted">
                  Nessuna prenotazione in programma.
                </p>
              </Card>
            ) : (
              upcoming.map(renderUpcoming)
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Passate e annullate ({past.length})
              </h3>
              {past.slice(0, pastLimit).map(renderPast)}
              {past.length > pastLimit && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setPastLimit((n) => n + PAST_PAGE)}
                >
                  Mostra altre ({past.length - pastLimit})
                </Button>
              )}
            </section>
          )}
        </div>
      )}

      <Modal
        open={Boolean(target)}
        title="Disdire la prenotazione?"
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setTarget(null)}>
              Mantieni
            </Button>
            <Button variant="danger" size="lg" onClick={onCancel} disabled={busy}>
              {busy ? "Disdico…" : "Disdici"}
            </Button>
          </>
        }
      >
        {target && (
          <div className="space-y-3">
            <p className="font-medium">
              Campo {target.courtName} ·{" "}
              <span className="capitalize">{friendlyDay(target.startAt)}</span> {formatTime(target.startAt)}
            </p>
            {lateCancellation ? (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-base text-red-800">
                Sei oltre il termine di disdetta gratuita: sarà dovuto il pagamento del campo
                ({formatEur(target.price)}).
              </p>
            ) : (
              <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-base text-emerald-800">
                {new Date() > new Date(target.freeCancellationDeadline)
                  ? "La disdetta è gratuita perché hai prenotato da poco."
                  : "La disdetta è gratuita: sei entro i termini."}
              </p>
            )}
          </div>
        )}
      </Modal>

      {roster && policy && (
        <RosterModal
          bookingId={roster.id}
          courtPrice={roster.price}
          perHeadPrice={roster.perHeadPrice}
          policy={policy}
          onClose={() => setRoster(null)}
          onChanged={load}
        />
      )}
    </Page>
  );
};
