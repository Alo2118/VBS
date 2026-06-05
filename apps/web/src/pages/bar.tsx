import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Page } from "@/shared/ui/page";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import { searchValidMembers } from "@/shared/api/bookings";
import type { MemberLite } from "@vbs/shared";
import { postCharge } from "@/shared/api/account";
import { formatEur } from "@/shared/utils/money";

export const BarPage = () => {
  const notify = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberLite[]>([]);
  const [member, setMember] = useState<MemberLite | null>(null);
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

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

  const reset = () => {
    setMember(null);
    setQuery("");
    setResults([]);
    setAmount("");
    setDesc("");
  };

  const save = async () => {
    if (!member) return;
    const amt = Number(amount.replace(",", "."));
    if (!amt || amt <= 0) {
      notify("Inserisci un importo valido.", "error");
      return;
    }
    setBusy(true);
    try {
      await postCharge(member.id, "BAR", amt, desc || undefined);
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
      <Card className="space-y-3">
        {!member ? (
          <>
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
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sand/30 px-3 py-2">
              <span className="text-base font-medium">
                {member.fullName}
                <NicknameTag nickname={member.nickname} className="ml-1" />
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Cambia
              </Button>
            </div>
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
              placeholder="es. 2 birre, 1 acqua"
            />
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>
              {busy ? "Aggiungo…" : "Aggiungi al conto"}
            </Button>
            <p className="text-sm text-muted">
              La consumazione finisce sul conto del socio; si salda alla Cassa (contanti o Satispay).
            </p>
          </>
        )}
      </Card>
    </Page>
  );
};
