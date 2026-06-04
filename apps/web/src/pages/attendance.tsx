import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookingPolicy } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { StatusPill } from "@/shared/ui/status-pill";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import { fetchDayBookings } from "@/shared/api/staff";
import { fetchBookingPolicy } from "@/shared/api/bookings";
import type { DayBooking } from "@/shared/api/staff";
import { BookingActions } from "@/shared/booking/booking-actions";
import { addDays, formatDay, formatTime, toIsoDate } from "@/shared/utils/date";

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
              <BookingActions booking={b} onChanged={() => load(day)} />
            </div>
          </Card>
        ))
      )}
    </Page>
  );
};
