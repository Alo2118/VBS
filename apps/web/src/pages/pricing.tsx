import { useCallback, useEffect, useState } from "react";
import type { PriceRule } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { bulkUpdatePrice, fetchPriceRules } from "@/shared/api/staff";
import { formatEur } from "@/shared/utils/money";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export const PricingPage = () => {
  const notify = useToast();
  const [rules, setRules] = useState<PriceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newPrice, setNewPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRules(await fetchPriceRules());
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

  const applyBulk = async () => {
    const price = Number(newPrice.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      notify("Inserisci un prezzo valido.", "error");
      return;
    }
    setBusy(true);
    try {
      const count = await bulkUpdatePrice([...selected], price);
      notify(`Prezzo aggiornato su ${count} fasce.`, "success");
      setSelected(new Set());
      setNewPrice("");
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Aggiornamento non riuscito.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="Tariffe"
      description="Seleziona una o più fasce e aggiorna il prezzo in blocco."
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
                        ? "border-accent bg-accent/15"
                        : "border-slate-800 bg-slate-900/50 hover:bg-slate-800/60"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded border",
                          active ? "border-accent bg-accent text-slate-900" : "border-slate-600"
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
                    <span className="text-lg font-semibold">{formatEur(r.price)}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[12rem]">
              <Input
                label={`Nuovo prezzo (${selected.size} selezionate)`}
                inputMode="decimal"
                placeholder="es. 12,00"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            <Button size="lg" onClick={applyBulk} disabled={busy || selected.size === 0}>
              {busy ? "Applico…" : "Applica a selezionate"}
            </Button>
          </Card>
        </>
      )}
    </Page>
  );
};
