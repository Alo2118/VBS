import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookingPolicy, WeekSlot } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { fetchWeekAvailability } from "@/shared/api/availability";
import { createBooking, fetchBookingPolicy } from "@/shared/api/bookings";
import { useAuth } from "@/shared/auth/auth-context";
import { MembershipBanner } from "@/shared/auth/membership-banner";
import {
  addDays,
  formatDay,
  formatTime,
  formatWeekdayShort,
  isSameDay,
  startOfWeek,
  toIsoDate,
  weekDays
} from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

export const BookingsPage = () => {
  const notify = useToast();
  const { canBook } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today));
  const [day, setDay] = useState<Date>(today);
  const [slots, setSlots] = useState<WeekSlot[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WeekSlot | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(
    async (start: Date) => {
      setLoading(true);
      try {
        setSlots(await fetchWeekAvailability(toIsoDate(start)));
      } catch (err) {
        notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
      } finally {
        setLoading(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    void load(weekStart);
  }, [weekStart, load]);

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
      await load(weekStart);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Prenotazione non riuscita.", "error");
    } finally {
      setConfirming(false);
    }
  };

  // Posti liberi per giorno (per i badge della striscia settimanale).
  const freeByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of slots) {
      if (s.status === "FREE") map.set(s.day, (map.get(s.day) ?? 0) + 1);
    }
    return map;
  }, [slots]);

  // Slot del giorno selezionato, raggruppati per campo (nasconde il non disponibile).
  const byCourt = useMemo(() => {
    const iso = toIsoDate(day);
    const map = new Map<string, { name: string; slots: WeekSlot[] }>();
    for (const s of slots) {
      if (s.day !== iso || s.status === "UNAVAILABLE") continue;
      const entry = map.get(s.courtId) ?? { name: s.courtName, slots: [] };
      entry.slots.push(s);
      map.set(s.courtId, entry);
    }
    return [...map.values()];
  }, [slots, day]);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(today));
  const todayIso = toIsoDate(today);

  const goWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    // Porta la selezione sul primo giorno utile della nuova settimana.
    setDay(isSameDay(next, startOfWeek(today)) ? today : next);
  };

  const cancellationNote =
    policy?.cancellationModel === "ROLLING_HOURS"
      ? `Disdetta gratuita fino a ${policy.cancellationHours} ore prima.`
      : "Disdetta gratuita entro le 23:59 del giorno prima.";

  return (
    <Page title="Prenota un campo">
      <MembershipBanner />

      {/* Passo 1: scegli il giorno nella settimana */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => goWeek(-1)}
            disabled={isCurrentWeek}
            aria-label="Settimana precedente"
          >
            ‹
          </Button>
          <p className="text-center text-base font-medium capitalize">
            {formatDay(days[0])} – {formatDay(days[6])}
          </p>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => goWeek(1)}
            aria-label="Settimana successiva"
          >
            ›
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const iso = toIsoDate(d);
            const isPast = iso < todayIso;
            const isSelected = iso === toIsoDate(day);
            const free = freeByDay.get(iso) ?? 0;
            return (
              <button
                key={iso}
                type="button"
                disabled={isPast}
                onClick={() => setDay(d)}
                aria-label={formatDay(d)}
                aria-pressed={isSelected}
                className={cn(
                  "flex flex-col items-center rounded-xl border px-1 py-2 transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isSelected
                    ? "border-accent bg-accent text-slate-900"
                    : isPast
                      ? "cursor-not-allowed border-slate-800 bg-slate-900/60 opacity-50"
                      : "border-slate-700 bg-slate-900/60 hover:bg-slate-800"
                )}
              >
                <span className="text-xs font-medium capitalize">{formatWeekdayShort(d)}</span>
                <span className="text-lg font-semibold leading-tight">{d.getDate()}</span>
                {!isPast && (
                  <span
                    className={cn(
                      "mt-0.5 text-[0.7rem] font-medium",
                      isSelected ? "text-slate-900/80" : free > 0 ? "text-emerald-400" : "text-slate-500"
                    )}
                  >
                    {free > 0 ? `${free} liberi` : "—"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Passo 2: scegli lo slot */}
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
