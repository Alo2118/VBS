import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookingPolicy } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { StatusPill } from "@/shared/ui/status-pill";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import {
  fetchDayBookings,
  markNoShow,
  staffCancelBooking,
  undoNoShow
} from "@/shared/api/staff";
import { fetchBookingPolicy } from "@/shared/api/bookings";
import type { DayBooking } from "@/shared/api/staff";
import { addDays, formatDay, formatTime, toIsoDate } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

const statusMeta: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" }> = {
  CONFIRMED: { label: "Confermata", tone: "success" },
  CANCELLED: { label: "Disdetta", tone: "info" },
  NO_SHOW: { label: "No-show", tone: "danger" },
  COMPLETED: { label: "Completata", tone: "info" }
};

export const AttendancePage = () => {
  const notify = useToast();
  const today = useMemo(() => new Date(), []);
  const [day, setDay] = useState<Date>(today);
  const [bookings, setBookings] = useState<DayBooking[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [freeTarget, setFreeTarget] = useState<DayBooking | null>(null);

  const load = useCallback(async (target: Date) => {
    setLoading(true);
    try {
      setBookings(await fetchDayBookings(toIsoDate(target)));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load(day);
  }, [day, load]);

  useEffect(() => {
    fetchBookingPolicy().then(setPolicy).catch(() => undefined);
  }, []);

  // Azione generica con gestione busy/errore/refresh.
  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      notify(ok, "info");
      await load(day);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const onNoShow = (b: DayBooking) =>
    run(b.id, () => markNoShow(b.id), "Segnata come mancata presentazione. Addebito generato.");

  const onUndoNoShow = (b: DayBooking) =>
    run(b.id, () => undoNoShow(b.id), "Mancata presentazione annullata. Addebito rimosso.");

  const onFree = (b: DayBooking, charge: boolean) => {
    setFreeTarget(null);
    void run(
      b.id,
      () => staffCancelBooking(b.id, charge),
      charge ? "Campo liberato con penale al capogruppo." : "Campo liberato senza penale."
    );
  };

  const now = new Date();

  return (
    <Page
      title="Presenze e campi"
      description="Segna le mancate presentazioni, annullale in caso di errore e libera i campi (disdette dopo termine)."
    >
      <Card className="flex items-center justify-between gap-4">
        <Button variant="secondary" size="lg" onClick={() => setDay((d) => addDays(d, -1))} aria-label="Giorno precedente">
          ‹
        </Button>
        <p className="text-xl font-semibold capitalize">{formatDay(day)}</p>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setDay((d) => addDays(d, 1))}
          aria-label="Giorno successivo"
        >
          ›
        </Button>
      </Card>

      {loading ? (
        <Spinner />
      ) : bookings.length === 0 ? (
        <Card>
          <p className="text-center text-base text-muted">Nessuna prenotazione in questa giornata.</p>
        </Card>
      ) : (
        bookings.map((b) => (
          <Card key={b.id} className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">
                {b.memberName}
                <NicknameTag nickname={b.memberNickname} className="ml-2" />
              </p>
              <p className="text-base text-muted">
                {b.courtName} · {formatTime(b.startAt)}–{formatTime(b.endAt)} ·{" "}
                <span className={policy && b.players < policy.minPlayers ? "text-amber-300" : ""}>
                  {b.players} giocatori
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill {...(statusMeta[b.status] ?? { label: b.status, tone: "info" })} />
              {b.status === "CONFIRMED" && new Date(b.startAt) > now && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setFreeTarget(b)}
                  disabled={busyId === b.id}
                >
                  Libera campo
                </Button>
              )}
              {b.status === "CONFIRMED" && new Date(b.startAt) <= now && (
                <Button variant="danger" size="lg" onClick={() => onNoShow(b)} disabled={busyId === b.id}>
                  No-show
                </Button>
              )}
              {b.status === "NO_SHOW" && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => onUndoNoShow(b)}
                  disabled={busyId === b.id}
                >
                  Annulla no-show
                </Button>
              )}
            </div>
          </Card>
        ))
      )}

      <Modal
        open={Boolean(freeTarget)}
        title="Libera campo"
        onClose={() => setFreeTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setFreeTarget(null)}>
              Annulla
            </Button>
            {freeTarget && (
              <>
                <Button variant="secondary" size="lg" onClick={() => onFree(freeTarget, false)}>
                  Senza penale
                </Button>
                <Button variant="danger" size="lg" onClick={() => onFree(freeTarget, true)}>
                  Con penale
                </Button>
              </>
            )}
          </>
        }
      >
        {freeTarget && (
          <div className="space-y-2">
            <p>
              Disdire la prenotazione di <span className="font-medium">{freeTarget.memberName}</span>{" "}
              ({freeTarget.courtName}, {formatTime(freeTarget.startAt)}) e liberare il campo?
            </p>
            <p className="text-base text-muted">
              «Con penale» addebita al capogruppo il prezzo del campo ({formatEur(freeTarget.price)}),
              come una disdetta tardiva. «Senza penale» non genera alcun addebito.
            </p>
          </div>
        )}
      </Modal>
    </Page>
  );
};
