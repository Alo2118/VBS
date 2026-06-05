import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Closure, Court, OpeningRule } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { fetchCourts } from "@/shared/api/bookings";
import { cancelBookingsForClosure } from "@/shared/api/staff";
import {
  createClosure,
  createOpeningRule,
  deleteClosure,
  deleteOpeningRule,
  fetchClosures,
  fetchOpeningRules
} from "@/shared/api/config";
import { formatDateTime } from "@/shared/utils/date";

const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
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
  const [weekday, setWeekday] = useState("1");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("23:00");
  const [duration, setDuration] = useState("60");
  const [busy, setBusy] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createOpeningRule({
        courtId: court === ALL_COURTS ? undefined : court,
        weekday: Number(weekday),
        openTime,
        closeTime,
        slotDurationMinutes: Number(duration)
      });
      notify("Orario aggiunto.", "success");
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
      <div className="mt-4 space-y-2">
        {rules.length === 0 && <p className="text-base text-muted">Nessun orario configurato.</p>}
        {rules.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3"
          >
            <span className="text-base">
              <strong>{WEEKDAYS[r.weekday]}</strong> · {r.openTime.slice(0, 5)}–
              {r.closeTime.slice(0, 5)} · slot {r.slotDurationMinutes}′ ·{" "}
              <span className="text-muted">{courtName(r.courtId)}</span>
            </span>
            <Button variant="ghost" onClick={() => remove(r.id)}>
              Rimuovi
            </Button>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Select label="Campo" value={court} options={courtOptions} onChange={(e) => setCourt(e.target.value)} />
        <Select
          label="Giorno"
          value={weekday}
          options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))}
          onChange={(e) => setWeekday(e.target.value)}
        />
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
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3"
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
