import { useCallback, useEffect, useMemo, useState } from "react";
import type { AvailabilitySlot, BookingPolicy } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { fetchAvailability } from "@/shared/api/availability";
import { createBooking, fetchBookingPolicy } from "@/shared/api/bookings";
import { useAuth } from "@/shared/auth/auth-context";
import { MembershipBanner } from "@/shared/auth/membership-banner";
import { addDays, formatDay, formatTime, isSameDay, toIsoDate } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

export const BookingsPage = () => {
  const notify = useToast();
  const { canBook } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [day, setDay] = useState<Date>(today);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AvailabilitySlot | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (target: Date) => {
    setLoading(true);
    try {
      const data = await fetchAvailability(toIsoDate(target));
      setSlots(data);
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

  const onConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      await createBooking(selected.courtId, selected.startAt);
      notify("Prenotazione confermata!", "success");
      setSelected(null);
      await load(day);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Prenotazione non riuscita.", "error");
    } finally {
      setConfirming(false);
    }
  };

  // Raggruppa per campo, mostrando solo gli slot rilevanti (FREE/TAKEN).
  const byCourt = useMemo(() => {
    const map = new Map<string, { name: string; slots: AvailabilitySlot[] }>();
    for (const s of slots) {
      if (s.status === "UNAVAILABLE") continue; // nasconde passato/chiusure (UX)
      const entry = map.get(s.courtId) ?? { name: s.courtName, slots: [] };
      entry.slots.push(s);
      map.set(s.courtId, entry);
    }
    return [...map.values()];
  }, [slots]);

  const isToday = isSameDay(day, today);
  const cancellationNote =
    policy?.cancellationModel === "ROLLING_HOURS"
      ? `Disdetta gratuita fino a ${policy.cancellationHours} ore prima.`
      : "Disdetta gratuita entro le 23:59 del giorno prima.";

  return (
    <Page title="Prenota un campo">
      <MembershipBanner />

      {/* Navigatore giorno (3 passi: giorno → slot → conferma) */}
      <Card className="flex items-center justify-between gap-4">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => setDay((d) => addDays(d, -1))}
          disabled={isToday}
          aria-label="Giorno precedente"
        >
          ‹
        </Button>
        <div className="text-center">
          <p className="text-xl font-semibold capitalize">{formatDay(day)}</p>
          {!isToday && (
            <button
              type="button"
              className="text-base text-accent hover:underline"
              onClick={() => setDay(today)}
            >
              Torna a oggi
            </button>
          )}
        </div>
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
        <Spinner label="Carico la disponibilità…" />
      ) : byCourt.length === 0 ? (
        <Card>
          <p className="text-center text-base text-muted">
            Nessuno slot disponibile in questa giornata.
          </p>
        </Card>
      ) : (
        byCourt.map((court) => (
          <Card key={court.name}>
            <h3 className="text-lg font-semibold">{court.name}</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {court.slots.map((slot) => {
                const free = slot.status === "FREE";
                return (
                  <button
                    key={slot.startAt}
                    type="button"
                    disabled={!free || !canBook}
                    onClick={() => setSelected(slot)}
                    className={cn(
                      "flex flex-col items-center rounded-xl border px-3 py-3 text-center transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      free && canBook
                        ? "border-accent/50 bg-accent/10 hover:bg-accent/20"
                        : "cursor-not-allowed border-slate-800 bg-slate-900/60 opacity-60"
                    )}
                  >
                    <span className="text-lg font-semibold">{formatTime(slot.startAt)}</span>
                    <span className="mt-1 text-sm text-muted">
                      {free ? formatEur(slot.price) : "Occupato"}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        ))
      )}

      {/* Passo 3: conferma con riepilogo e regola di disdetta */}
      <Modal
        open={Boolean(selected)}
        title="Conferma prenotazione"
        onClose={() => setSelected(null)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setSelected(null)}>
              Annulla
            </Button>
            <Button size="lg" onClick={onConfirm} disabled={confirming}>
              {confirming ? "Confermo…" : "Conferma"}
            </Button>
          </>
        }
      >
        {selected && (
          <dl className="space-y-2">
            <Row label="Campo" value={selected.courtName} />
            <Row label="Giorno" value={formatDay(day)} />
            <Row
              label="Orario"
              value={`${formatTime(selected.startAt)}–${formatTime(selected.endAt)}`}
            />
            <Row label="Prezzo" value={formatEur(selected.price)} strong />
            <p className="pt-2 text-sm text-muted">
              {cancellationNote} Dopo, in caso di mancata disdetta è dovuto il prezzo del campo.
            </p>
          </dl>
        )}
      </Modal>
    </Page>
  );
};

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center justify-between gap-4">
    <dt className="text-muted">{label}</dt>
    <dd className={cn("capitalize", strong && "text-lg font-semibold text-accent")}>{value}</dd>
  </div>
);
