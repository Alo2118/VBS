import { useCallback, useEffect, useMemo, useState } from "react";
import type { BookingPolicy, WeekSlot } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { Input } from "@/shared/ui/input";
import { fetchWeekAvailability } from "@/shared/api/availability";
import {
  createBooking,
  createRecurringBooking,
  fetchBookingPolicy
} from "@/shared/api/bookings";
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

export const BookingsPage = () => {
  const notify = useToast();
  const { canBook, isStaff } = useAuth();
  const today = useMemo(() => new Date(), []);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today));
  const [day, setDay] = useState<Date>(today);
  const [slots, setSlots] = useState<WeekSlot[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WeekSlot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [until, setUntil] = useState("");

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

  const closeConfirm = () => {
    setSelected(null);
    setRecurring(false);
    setUntil("");
  };

  const onConfirm = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      if (recurring && until) {
        const res = await createRecurringBooking(selected.courtId, selected.startAt, until);
        notify(
          `Prenotazione fissa: ${res.created} occorrenze create` +
            (res.skipped.length ? `, ${res.skipped.length} saltate (slot occupato).` : "."),
          "success"
        );
      } else {
        await createBooking(selected.courtId, selected.startAt);
        notify("Prenotazione confermata! Aggiungi i giocatori da «Le mie prenotazioni».", "success");
      }
      closeConfirm();
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
                    ? "border-transparent bg-brand-gradient text-white shadow-soft"
                    : isPast
                      ? "cursor-not-allowed border-line bg-white opacity-50"
                      : "border-line bg-white hover:bg-sand/40"
                )}
              >
                <span className="text-xs font-medium capitalize">{formatWeekdayShort(d)}</span>
                <span className="text-lg font-semibold leading-tight">{d.getDate()}</span>
                {!isPast && (
                  <span
                    className={cn(
                      "mt-0.5 text-[0.7rem] font-medium",
                      isSelected ? "text-white/90" : free > 0 ? "text-emerald-600" : "text-muted"
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
                        ? "border-sea/40 bg-accent-soft hover:bg-sea/15"
                        : "cursor-not-allowed border-line bg-sand/30 opacity-60"
                    )}
                  >
                    <span className="text-lg font-semibold">{formatTime(slot.startAt)}</span>
                    <span
                      className={cn(
                        "mt-1 w-full truncate text-sm",
                        free ? "text-emerald-600" : "text-muted"
                      )}
                      title={free ? undefined : slot.booker}
                    >
                      {free ? "Libero" : (slot.booker ?? "Occupato")}
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
        onClose={closeConfirm}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={closeConfirm}>
              Annulla
            </Button>
            <Button size="lg" onClick={onConfirm} disabled={confirming || (recurring && !until)}>
              {confirming ? "Confermo…" : recurring ? "Crea fissa" : "Conferma"}
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
            <p className="pt-1 text-sm text-muted">
              Aggiungi i giocatori (minimo {policy?.minPlayers ?? 4} soci con tessera valida) da
              «Le mie prenotazioni».
            </p>
            <p className="text-sm text-muted">
              {cancellationNote}
              {policy && policy.cancellationGraceMinutes > 0
                ? ` Hai comunque ${policy.cancellationGraceMinutes} minuti dalla prenotazione per disdire gratis.`
                : ""}{" "}
              Dopo, in caso di mancata disdetta è dovuto il prezzo del campo.
            </p>

            {/* Prenotazione fissa (solo staff) */}
            {isStaff && (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <label className="flex items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                  />
                  Ripeti ogni settimana (prenotazione fissa)
                </label>
                {recurring && (
                  <Input
                    label="Fino al"
                    type="date"
                    value={until}
                    min={toIsoDate(day)}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                )}
              </div>
            )}
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
