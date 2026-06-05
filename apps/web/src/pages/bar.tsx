import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Page } from "@/shared/ui/page";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { searchValidMembers } from "@/shared/api/bookings";
import type { MemberLite } from "@vbs/shared";
import { postCharge } from "@/shared/api/account";
import { fetchProducts, type Product } from "@/shared/api/products";
import { formatEur } from "@/shared/utils/money";

export const BarPage = () => {
  const notify = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberLite[]>([]);
  const [member, setMember] = useState<MemberLite | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [freeMode, setFreeMode] = useState(false);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchProducts(true).then(setProducts).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (member || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    void searchValidMembers(query).then((r) => alive && setResults(r)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [query, member]);

  const total = useMemo(
    () => products.reduce((sum, p) => sum + p.price * (cart[p.id] ?? 0), 0),
    [products, cart]
  );
  const summary = useMemo(
    () =>
      products
        .filter((p) => (cart[p.id] ?? 0) > 0)
        .map((p) => `${cart[p.id]}× ${p.name}`)
        .join(", "),
    [products, cart]
  );

  const reset = () => {
    setMember(null);
    setQuery("");
    setResults([]);
    setCart({});
    setFreeMode(false);
    setAmount("");
    setDesc("");
  };

  const add = (id: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const save = async () => {
    if (!member) return;
    let amt: number;
    let description: string;
    if (freeMode) {
      amt = Number(amount.replace(",", "."));
      description = desc.trim();
      if (!amt || amt <= 0) {
        notify("Inserisci un importo valido.", "error");
        return;
      }
    } else {
      amt = total;
      description = summary;
      if (amt <= 0) {
        notify("Aggiungi almeno un prodotto.", "error");
        return;
      }
    }
    setBusy(true);
    try {
      await postCharge(member.id, "BAR", amt, description || undefined);
      notify(`Aggiunto ${formatEur(amt)} al conto di ${member.fullName}.`, "success");
      reset();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Bar" description="Aggiungi le consumazioni al conto del socio.">
      {!member ? (
        <Card className="space-y-3">
          <Input
            label="A chi va la consumazione?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un socio per nome o soprannome…"
            autoComplete="off"
          />
          {results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setMember(m)}
                    className="flex w-full items-center justify-between px-1 py-2 text-left text-base hover:bg-sand/40"
                  >
                    <span>
                      {m.fullName}
                      <NicknameTag nickname={m.nickname} className="ml-1" />
                    </span>
                    <span aria-hidden className="text-accent">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sand/30 px-3 py-2">
              <span className="text-base font-medium">
                {member.fullName}
                <NicknameTag nickname={member.nickname} className="ml-1" />
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Cambia
              </Button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFreeMode(false)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-base font-medium",
                  !freeMode ? "border-transparent bg-brand-gradient text-white" : "border-line"
                )}
              >
                Listino
              </button>
              <button
                type="button"
                onClick={() => setFreeMode(true)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-base font-medium",
                  freeMode ? "border-transparent bg-brand-gradient text-white" : "border-line"
                )}
              >
                Importo libero
              </button>
            </div>

            {freeMode ? (
              <>
                <Input
                  label="Importo (€)"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Input
                  label="Cosa (facoltativo)"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="es. fuori listino"
                />
              </>
            ) : products.length === 0 ? (
              <p className="text-base text-muted">
                Listino vuoto. Aggiungi i prodotti dalla pagina «Listino».
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {products.map((p) => {
                  const qty = cart[p.id] ?? 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => add(p.id, 1)}
                      className={cn(
                        "relative rounded-xl border px-3 py-3 text-left transition hover:bg-sand/40",
                        qty > 0 ? "border-accent bg-sand/40" : "border-line"
                      )}
                    >
                      <span className="block truncate text-base font-medium">{p.name}</span>
                      <span className="text-sm text-muted">{formatEur(p.price)}</span>
                      {qty > 0 && (
                        <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-gradient px-1.5 text-sm font-semibold text-white">
                          {qty}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Carrello / totale */}
          {!freeMode && summary && (
            <Card className="space-y-2">
              <h3 className="text-base font-semibold">Conto</h3>
              <ul className="divide-y divide-line">
                {products
                  .filter((p) => (cart[p.id] ?? 0) > 0)
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate text-base">{p.name}</span>
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => add(p.id, -1)}
                          className="h-7 w-7 rounded-full border border-line text-lg leading-none"
                          aria-label={`Togli ${p.name}`}
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-base font-semibold">{cart[p.id]}</span>
                        <button
                          type="button"
                          onClick={() => add(p.id, 1)}
                          className="h-7 w-7 rounded-full border border-line text-lg leading-none"
                          aria-label={`Aggiungi ${p.name}`}
                        >
                          +
                        </button>
                        <span className="w-16 text-right text-base font-semibold">
                          {formatEur(p.price * (cart[p.id] ?? 0))}
                        </span>
                      </span>
                    </li>
                  ))}
              </ul>
              <div className="flex items-center justify-between pt-1 text-lg font-semibold">
                <span>Totale</span>
                <span>{formatEur(total)}</span>
              </div>
            </Card>
          )}

          <Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? "Aggiungo…" : freeMode ? "Aggiungi al conto" : `Aggiungi al conto · ${formatEur(total)}`}
          </Button>
          <p className="text-sm text-muted">
            La consumazione finisce sul conto del socio; si salda alla Cassa (contanti o Satispay).
          </p>
        </>
      )}
    </Page>
  );
};
