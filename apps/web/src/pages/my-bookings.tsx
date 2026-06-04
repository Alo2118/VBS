import { useCallback, useEffect, useMemo, useState } from "react";
import type { Booking } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { StatusPill } from "@/shared/ui/status-pill";
import { useToast } from "@/shared/ui/toast";
import { cancelBooking, fetchMyBookings } from "@/shared/api/bookings";
import { formatDateTime, formatTime } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

const statusLabel: Record<Booking["status"], { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  CONFIRMED: { label: "Confermata", tone: "success" },
  CANCELLED: { label: "Disdetta", tone: "info" },
  NO_SHOW: { label: "Mancata presentazione", tone: "danger" },
  COMPLETED: { label: "Completata", tone: "info" }
};

export const MyBookingsPage = () => {
  const notify = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Booking | null>(null);
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

  const onCancel = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await cancelBooking(target.id);
      const wasLate = new Date() > new Date(target.freeCancellationDeadline);
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

  // È tardi per la disdetta gratuita? (penale = prezzo del campo)
  const lateCancellation = useMemo(
    () => (target ? new Date() > new Date(target.freeCancellationDeadline) : false),
    [target]
  );

  const canCancel = (b: Booking) =>
    b.status === "CONFIRMED" && new Date(b.startAt) > new Date();

  return (
    <Page title="Le mie prenotazioni">
      {loading ? (
        <Spinner />
      ) : bookings.length === 0 ? (
        <Card>
          <p className="text-center text-base text-muted">
            Non hai ancora prenotazioni.
          </p>
        </Card>
      ) : (
        bookings.map((b) => (
          <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold capitalize">{formatDateTime(b.startAt)}</p>
              <p className="text-base text-muted">
                Fine {formatTime(b.endAt)} · {formatEur(b.price)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill {...statusLabel[b.status]} />
              {canCancel(b) && (
                <Button variant="danger" size="lg" onClick={() => setTarget(b)}>
                  Disdici
                </Button>
              )}
            </div>
          </Card>
        ))
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
                La disdetta è gratuita: sei entro i termini.
              </p>
            )}
          </div>
        )}
      </Modal>
    </Page>
  );
};
