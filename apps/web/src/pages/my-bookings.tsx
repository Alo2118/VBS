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
import { formatDateTime, formatTime } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";
import { perPlayerShare } from "@/shared/utils/pricing";

const statusLabel: Record<Booking["status"], { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  CONFIRMED: { label: "Confermata", tone: "success" },
  CANCELLED: { label: "Disdetta", tone: "info" },
  NO_SHOW: { label: "Mancata presentazione", tone: "danger" },
  COMPLETED: { label: "Completata", tone: "info" }
};

export const MyBookingsPage = () => {
  const notify = useToast();
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Booking | null>(null);
  const [roster, setRoster] = useState<MyBooking | null>(null);
  const [busy, setBusy] = useState(false);

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

  const lateCancellation = useMemo(() => (target ? isLate(target) : false), [target]);

  const canManage = (b: Booking) =>
    b.status === "CONFIRMED" && new Date(b.startAt) > new Date();

  return (
    <Page title="Le mie prenotazioni">
      {loading ? (
        <Spinner />
      ) : bookings.length === 0 ? (
        <Card>
          <p className="text-center text-base text-muted">Non hai ancora prenotazioni.</p>
        </Card>
      ) : (
        bookings.map((b) => {
          const upcoming = canManage(b);
          const share =
            policy && b.players > 0
              ? perPlayerShare({
                  players: b.players,
                  courtPrice: b.price,
                  perHeadPrice: b.perHeadPrice,
                  threshold: policy.perHeadThreshold
                })
              : null;
          const underfilled = policy ? b.players < policy.minPlayers : false;
          return (
            <Card key={b.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold capitalize">{formatDateTime(b.startAt)}</p>
                  <p className="text-base text-muted">
                    Fine {formatTime(b.endAt)}
                    {b.seriesId ? " · fissa" : ""}
                  </p>
                </div>
                <StatusPill {...statusLabel[b.status]} />
              </div>

              {upcoming && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <p className="text-base">
                    {b.players} {b.players === 1 ? "giocatore" : "giocatori"}
                    {share !== null && (
                      <span className="text-muted"> · {formatEur(share)} a testa</span>
                    )}
                    {underfilled && (
                      <span className="ml-2 text-amber-300">
                        servono almeno {policy?.minPlayers}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-3">
                    <Button variant="secondary" size="lg" onClick={() => setRoster(b)}>
                      Giocatori
                    </Button>
                    <Button variant="danger" size="lg" onClick={() => setTarget(b)}>
                      Disdici
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })
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
            <p className="capitalize">{formatDateTime(target.startAt)}</p>
            {lateCancellation ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-base text-red-200">
                Sei oltre il termine di disdetta gratuita: sarà dovuto il pagamento del campo
                ({formatEur(target.price)}).
              </p>
            ) : (
              <p className="text-base text-emerald-300">
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
