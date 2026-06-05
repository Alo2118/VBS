import { useCallback, useEffect, useState } from "react";
import type { BookingPolicy, PriceRule } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import {
  bulkUpdatePerHead,
  bulkUpdatePrice,
  fetchPriceRules,
  updatePlayerPolicy
} from "@/shared/api/staff";
import { fetchBookingPolicy } from "@/shared/api/bookings";
import { formatEur } from "@/shared/utils/money";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export const PricingPage = () => {
  const notify = useToast();
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newPrice, setNewPrice] = useState("");
  const [newPerHead, setNewPerHead] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [threshold, setThreshold] = useState("");
  const [grace, setGrace] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([fetchPriceRules(), fetchBookingPolicy()]);
      setRules(r);
      setPolicy(p);
      setMinPlayers(String(p.minPlayers));
      setThreshold(String(p.perHeadThreshold));
      setGrace(String(p.cancellationGraceMinutes));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const parsePrice = (raw: string): number | null => {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const applyBulk = async (kind: "price" | "perHead") => {
    const raw = kind === "price" ? newPrice : newPerHead;
    const value = parsePrice(raw);
    if (value === null) {
      notify("Inserisci un valore valido.", "error");
      return;
    }
    setBusy(true);
    try {
      const count =
        kind === "price"
          ? await bulkUpdatePrice([...selected], value)
          : await bulkUpdatePerHead([...selected], value);
      notify(`Aggiornate ${count} fasce.`, "success");
      setSelected(new Set());
      setNewPrice("");
      setNewPerHead("");
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Aggiornamento non riuscito.", "error");
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    const min = Number(minPlayers);
    const thr = Number(threshold);
    const grc = Number(grace);
    if (
      !Number.isInteger(min) || min < 1 ||
      !Number.isInteger(thr) || thr < 1 ||
      !Number.isInteger(grc) || grc < 0
    ) {
      notify("Valori non validi.", "error");
      return;
    }
    setBusy(true);
    try {
      await updatePlayerPolicy({
        minPlayers: min,
        perHeadThreshold: thr,
        cancellationGraceMinutes: grc
      });
      notify("Regole aggiornate.", "success");
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Salvataggio non riuscito.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Tariffe"
      description="Prezzo del campo e quota a testa per fascia oraria. Seleziona e aggiorna in blocco."
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card>
            <div className="space-y-2">
              {rules.map((r) => {
                const active = selected.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active
                        ? "border-sea bg-accent-soft"
                        : "border-line bg-white hover:bg-sand/40"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded border",
                          active ? "border-transparent bg-brand-gradient text-white" : "border-line"
                        )}
                        aria-hidden
                      >
                        {active ? "✓" : ""}
                      </span>
                      <span className="text-base">
                        {r.startTime.slice(0, 5)}–{r.endTime.slice(0, 5)}
                        <span className="ml-2 text-muted">
                          {typeof r.weekday === "number" ? WEEKDAYS[r.weekday] : "Tutti i giorni"}
                        </span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg font-semibold">{formatEur(r.price)}</span>
                      <span className="block text-sm text-muted">
                        {formatEur(r.perHeadPrice)}/testa
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[10rem]">
                <Input
                  label={`Prezzo campo (${selected.size} selez.)`}
                  inputMode="decimal"
                  placeholder="es. 12,00"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                />
              </div>
              <Button
                size="lg"
                onClick={() => applyBulk("price")}
                disabled={busy || selected.size === 0 || newPrice === ""}
              >
                Applica prezzo
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[10rem]">
                <Input
                  label="Quota a testa (oltre la soglia)"
                  inputMode="decimal"
                  placeholder="es. 3,00"
                  value={newPerHead}
                  onChange={(e) => setNewPerHead(e.target.value)}
                />
              </div>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => applyBulk("perHead")}
                disabled={busy || selected.size === 0 || newPerHead === ""}
              >
                Applica quota
              </Button>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Regole giocatori</h3>
              <p className="text-sm text-muted">
                Sotto la soglia il costo del campo è diviso tra i presenti; oltre la soglia ognuno
                paga la quota a testa.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-40">
                <Input
                  label="Minimo giocatori"
                  type="number"
                  min={1}
                  value={minPlayers}
                  onChange={(e) => setMinPlayers(e.target.value)}
                />
              </div>
              <div className="w-48">
                <Input
                  label="Soglia quota a testa"
                  type="number"
                  min={1}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
              <div className="w-56">
                <Input
                  label="Tolleranza disdetta (min)"
                  type="number"
                  min={0}
                  value={grace}
                  onChange={(e) => setGrace(e.target.value)}
                />
              </div>
              <Button size="lg" onClick={savePolicy} disabled={busy}>
                Salva regole
              </Button>
            </div>
            <p className="text-sm text-muted">
              «Tolleranza disdetta»: minuti dopo la prenotazione entro cui la disdetta resta
              gratuita anche oltre il termine (evita la penale a chi prenota e disdice subito).
            </p>
          </Card>
        </>
      )}
    </Page>
  );
};
