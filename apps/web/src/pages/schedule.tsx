import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Closure, Court, OpeningRule } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { cn } from "@/shared/ui/cn";
import { useToast } from "@/shared/ui/toast";
import { fetchCourts } from "@/shared/api/bookings";
import { cancelBookingsForClosure } from "@/shared/api/staff";
import {
  createClosure,
  createOpeningRules,
  deleteClosure,
  deleteOpeningRule,
  fetchClosures,
  fetchOpeningRules
} from "@/shared/api/config";
import { formatDateTime } from "@/shared/utils/date";

const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
/** Ordine di visualizzazione lunedì→domenica (i valori restano i DOW Postgres). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_PRESETS: { label: string; days: number[] }[] = [
  { label: "Tutti i giorni", days: [1, 2, 3, 4, 5, 6, 0] },
  { label: "Lun–Ven", days: [1, 2, 3, 4, 5] },
  { label: "Weekend", days: [6, 0] }
];
const ALL_COURTS = "ALL";

export const SchedulePage = () => {
  const notify = useToast();
  const [courts, setCourts] = useState<Court[]>([]);
  const [rules, setRules] = useState<OpeningRule[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);

  const courtName = useCallback(
    (id?: string) => (id ? courts.find((c) => c.id === id)?.name ?? "—" : "Tutti i campi"),
    [courts]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, cl] = await Promise.all([
        fetchCourts(),
        fetchOpeningRules(),
        fetchClosures()
      ]);
      setCourts(c);
      setRules(r);
      setClosures(cl);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const courtOptions = useMemo(
    () => [
      { value: ALL_COURTS, label: "Tutti i campi" },
      ...courts.map((c) => ({ value: c.id, label: c.name }))
    ],
    [courts]
  );

  if (loading) {
    return (
      <Page title="Orari e chiusure">
        <Spinner />
      </Page>
    );
  }

  return (
    <Page title="Orari e chiusure" description="Configura gli slot prenotabili e le eccezioni.">
      <OpeningRulesSection
        rules={rules}
        courtOptions={courtOptions}
        courtName={courtName}
        onChange={load}
        notify={notify}
      />
      <ClosuresSection
        closures={closures}
        courtOptions={courtOptions}
        courtName={courtName}
        onChange={load}
        notify={notify}
      />
    </Page>
  );
};

type Notify = ReturnType<typeof useToast>;

const OpeningRulesSection = ({
  rules,
  courtOptions,
  courtName,
  onChange,
  notify
}: {
  rules: OpeningRule[];
  courtOptions: { value: string; label: string }[];
  courtName: (id?: string) => string;
  onChange: () => Promise<void>;
  notify: Notify;
}) => {
  const [court, setCourt] = useState(ALL_COURTS);
  const [days, setDays] = useState<number[]>([]);
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("23:00");
  const [duration, setDuration] = useState("60");
  const [busy, setBusy] = useState(false);

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  // Raggruppa le regole per giorno (lun→dom) per una lettura immediata.
  const byDay = useMemo(() => {
    const map = new Map<number, OpeningRule[]>();
    for (const r of rules) {
      const list = map.get(r.weekday) ?? [];
      list.push(r);
      map.set(r.weekday, list);
    }
    return WEEK_ORDER.filter((d) => map.has(d)).map((d) => ({ day: d, items: map.get(d)! }));
  }, [rules]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (days.length === 0) {
      notify("Seleziona almeno un giorno.", "error");
      return;
    }
    if (closeTime <= openTime) {
      notify("L'orario di chiusura deve essere dopo l'apertura.", "error");
      return;
    }
    setBusy(true);
    try {
      await createOpeningRules({
        courtId: court === ALL_COURTS ? undefined : court,
        weekdays: days,
        openTime,
        closeTime,
        slotDurationMinutes: Number(duration)
      });
      notify(
        days.length === 1 ? "Orario aggiunto." : `Orario aggiunto su ${days.length} giorni.`,
        "success"
      );
      setDays([]);
      await onChange();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteOpeningRule(id);
      notify("Orario rimosso.", "info");
      await onChange();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    }
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold">Orari di apertura</h3>
      <div className="mt-4 space-y-4">
        {byDay.length === 0 && <p className="text-base text-muted">Nessun orario configurato.</p>}
        {byDay.map(({ day, items }) => (
          <div key={day}>
            <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
              {WEEKDAYS[day]}
            </p>
            <div className="space-y-2">
              {items.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sand/30 px-4 py-3"
                >
                  <span className="text-base">
                    {r.openTime.slice(0, 5)}–{r.closeTime.slice(0, 5)} · slot {r.slotDurationMinutes}′ ·{" "}
                    <span className="text-muted">{courtName(r.courtId)}</span>
                  </span>
                  <Button variant="ghost" onClick={() => remove(r.id)}>
                    Rimuovi
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-5 space-y-4">
        {/* Giorni: selezione multipla con scorciatoie */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">Giorni</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_ORDER.map((d) => {
              const on = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                    on ? "border-transparent bg-brand-gradient text-white" : "border-line hover:bg-sand/40"
                  )}
                >
                  {WEEKDAYS_SHORT[d]}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {WEEKDAY_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDays(p.days)}
                className="text-accent underline-offset-2 hover:underline"
              >
                {p.label}
              </button>
            ))}
            {days.length > 0 && (
              <button
                type="button"
                onClick={() => setDays([])}
                className="text-muted underline-offset-2 hover:underline"
              >
                Azzera
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select label="Campo" value={court} options={courtOptions} onChange={(e) => setCourt(e.target.value)} />
          <Select
            label="Durata slot"
            value={duration}
            options={[
              { value: "60", label: "60 minuti" },
              { value: "90", label: "90 minuti" },
              { value: "120", label: "120 minuti" }
            ]}
            onChange={(e) => setDuration(e.target.value)}
          />
          <Input label="Apertura" type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} required />
          <Input label="Chiusura" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} required />
          <div className="flex items-end">
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? "Aggiungo…" : "Aggiungi orario"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
};

const ClosuresSection = ({
  closures,
  courtOptions,
  courtName,
  onChange,
  notify
}: {
  closures: Closure[];
  courtOptions: { value: string; label: string }[];
  courtName: (id?: string) => string;
  onChange: () => Promise<void>;
  notify: Notify;
}) => {
  const [court, setCourt] = useState(ALL_COURTS);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!start || !end) {
      notify("Indica inizio e fine della chiusura.", "error");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      notify("La fine della chiusura deve essere dopo l'inizio.", "error");
      return;
    }
    setBusy(true);
    try {
      // datetime-local è ora locale (Rome): converto all'istante UTC.
      await createClosure({
        courtId: court === ALL_COURTS ? undefined : court,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
        reason: reason || undefined
      });
      notify("Chiusura aggiunta.", "success");
      setReason("");
      await onChange();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteClosure(id);
      notify("Chiusura rimossa.", "info");
      await onChange();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    }
  };

  const cancelBookings = async (id: string) => {
    if (
      !window.confirm(
        "Annullare tutte le prenotazioni in questa fascia e avvisare i giocatori? L'azione non addebita penali."
      )
    ) {
      return;
    }
    try {
      const n = await cancelBookingsForClosure(id);
      notify(
        n === 0
          ? "Nessuna prenotazione da annullare in questa fascia."
          : `${n} ${n === 1 ? "campo annullato" : "campi annullati"}, giocatori avvisati.`,
        n === 0 ? "info" : "success"
      );
      await onChange();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    }
  };

  return (
    <Card>
      <h3 className="text-lg font-semibold">Chiusure / eccezioni</h3>
      <div className="mt-4 space-y-2">
        {closures.length === 0 && <p className="text-base text-muted">Nessuna chiusura programmata.</p>}
        {closures.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sand/30 px-4 py-3"
          >
            <span className="text-base capitalize">
              {courtName(c.courtId)} · {formatDateTime(c.startAt)} → {formatDateTime(c.endAt)}
              {c.reason ? ` · ${c.reason}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => cancelBookings(c.id)}>
                Annulla prenotazioni e avvisa
              </Button>
              <Button variant="ghost" onClick={() => remove(c.id)}>
                Rimuovi
              </Button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Select label="Campo" value={court} options={courtOptions} onChange={(e) => setCourt(e.target.value)} />
        <Input label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="es. manutenzione" />
        <Input label="Inizio" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        <Input label="Fine" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Aggiungo…" : "Aggiungi chiusura"}
          </Button>
        </div>
      </form>
    </Card>
  );
};
