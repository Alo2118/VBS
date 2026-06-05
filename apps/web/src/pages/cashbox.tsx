import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { useAuth } from "@/shared/auth/auth-context";
import { MemberSearch } from "@/shared/members/member-search";
import { LedgerMovements } from "@/shared/account/ledger-movements";
import {
  fetchMemberAccounts,
  fetchMemberLedger,
  postCharge,
  postPayment,
  postWaiver,
  type LedgerEntry,
  type MemberAccount,
  type PayMethod
} from "@/shared/api/account";
import { formatEur } from "@/shared/utils/money";

type Target = { memberId: string; fullName: string; nickname?: string };

export const CashboxPage = () => {
  const notify = useToast();
  const [accounts, setAccounts] = useState<MemberAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Target | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await fetchMemberAccounts());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const owing = useMemo(() => accounts.filter((a) => a.balance < 0), [accounts]);
  const others = useMemo(() => accounts.filter((a) => a.balance >= 0), [accounts]);

  const onClose = () => {
    setTarget(null);
    void load();
  };

  return (
    <Page title="Cassa" description="Incassi e conti dei soci (contanti o Satispay).">
      {/* Cerca un socio per registrare incasso o consumazione */}
      <Card>
        <MemberSearch
          onSelect={(m) => setTarget({ memberId: m.id, fullName: m.fullName, nickname: m.nickname })}
        />
      </Card>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card>
            <h3 className="text-lg font-semibold">Da incassare ({owing.length})</h3>
            {owing.length === 0 ? (
              <p className="mt-3 text-base text-muted">Nessun sospeso. Tutto saldato 🎉</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {owing.map((a) => (
                  <AccountRow key={a.memberId} a={a} onClick={() => setTarget(a)} />
                ))}
              </ul>
            )}
          </Card>

          {others.length > 0 && (
            <Card>
              <h3 className="text-lg font-semibold">Altri conti</h3>
              <ul className="mt-3 divide-y divide-line">
                {others.map((a) => (
                  <AccountRow key={a.memberId} a={a} onClick={() => setTarget(a)} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {target && <AccountModal target={target} onClose={onClose} notify={notify} />}
    </Page>
  );
};

const AccountRow = ({ a, onClick }: { a: MemberAccount; onClick: () => void }) => (
  <li>
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-sand/40"
    >
      <span className="min-w-0 truncate text-base font-medium">
        {a.fullName}
        <NicknameTag nickname={a.nickname} className="ml-1" />
      </span>
      <span
        className={cn(
          "shrink-0 text-base font-semibold",
          a.balance < 0 ? "text-red-600" : a.balance > 0 ? "text-emerald-600" : "text-muted"
        )}
      >
        {a.balance < 0 ? `deve ${formatEur(-a.balance)}` : a.balance > 0 ? `credito ${formatEur(a.balance)}` : "in pari"}
      </span>
    </button>
  </li>
);

const AccountModal = ({
  target,
  onClose,
  notify
}: {
  target: Target;
  onClose: () => void;
  notify: (m: string, t?: "success" | "error" | "info") => void;
}) => {
  const { profile } = useAuth();
  const canWaive = profile?.role === "ADMIN" || profile?.role === "MANAGER";
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // Form incasso
  const [payAmount, setPayAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [payKind, setPayKind] = useState<"PAYMENT" | "TOPUP" | "WAIVER">("PAYMENT");
  const [waiveReason, setWaiveReason] = useState("");
  // Form addebito
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeKind, setChargeKind] = useState<"COURT" | "BAR">("COURT");
  const [chargeDesc, setChargeDesc] = useState("");

  const reload = useCallback(async () => {
    const { balance: b, entries: e } = await fetchMemberLedger(target.memberId);
    setBalance(b);
    setEntries(e);
    if (b < 0) setPayAmount(String(-b)); // precompila col dovuto
  }, [target.memberId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const registerPayment = async () => {
    const amt = Number(payAmount.replace(",", "."));
    if (!amt || amt <= 0) {
      notify("Inserisci un importo valido.", "error");
      return;
    }
    if (payKind === "WAIVER" && !waiveReason.trim()) {
      notify("Indica il motivo dello storno.", "error");
      return;
    }
    setBusy(true);
    try {
      if (payKind === "WAIVER") {
        await postWaiver(target.memberId, amt, waiveReason.trim());
        notify("Storno registrato.", "success");
      } else {
        await postPayment(target.memberId, amt, method, payKind);
        notify("Incasso registrato.", "success");
      }
      setPayAmount("");
      setWaiveReason("");
      await reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const addCharge = async () => {
    const amt = Number(chargeAmount.replace(",", "."));
    if (!amt || amt <= 0) {
      notify("Inserisci un importo valido.", "error");
      return;
    }
    setBusy(true);
    try {
      await postCharge(target.memberId, chargeKind, amt, chargeDesc || undefined);
      notify("Addebito aggiunto al conto.", "success");
      setChargeAmount("");
      setChargeDesc("");
      await reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={target.fullName} onClose={onClose}>
      <div className="space-y-4">
        {/* Saldo */}
        <div
          className={cn(
            "rounded-xl border px-3 py-2 text-base font-semibold",
            balance === null
              ? "border-line text-muted"
              : balance < 0
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : balance > 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-line text-muted"
          )}
        >
          {balance === null
            ? "…"
            : balance < 0
              ? `Deve ${formatEur(-balance)}`
              : balance > 0
                ? `Credito ${formatEur(balance)}`
                : "Conto in pari"}
        </div>

        {/* Registra incasso */}
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Registra incasso</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={payKind === "PAYMENT"} onChange={() => setPayKind("PAYMENT")} />
              Pagamento
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={payKind === "TOPUP"} onChange={() => setPayKind("TOPUP")} />
              Ricarica (prepagato)
            </label>
            {canWaive && (
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={payKind === "WAIVER"} onChange={() => setPayKind("WAIVER")} />
                Storno (esonera)
              </label>
            )}
          </div>
          {payKind !== "WAIVER" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMethod("CASH")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-base font-medium",
                  method === "CASH" ? "border-transparent bg-brand-gradient text-white" : "border-line"
                )}
              >
                💶 Contanti
              </button>
              <button
                type="button"
                onClick={() => setMethod("SATISPAY")}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-base font-medium",
                  method === "SATISPAY" ? "border-transparent bg-brand-gradient text-white" : "border-line"
                )}
              >
                📱 Satispay
              </button>
            </div>
          ) : (
            <Input
              label="Motivo dello storno"
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              placeholder="es. errore di registrazione"
            />
          )}
          <Input
            label="Importo (€)"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void registerPayment()}>
            {busy ? "…" : payKind === "WAIVER" ? "Registra storno" : "Registra incasso"}
          </Button>
        </div>

        {/* Aggiungi addebito */}
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Aggiungi addebito</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChargeKind("COURT")}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-base font-medium",
                chargeKind === "COURT" ? "border-transparent bg-brand-gradient text-white" : "border-line"
              )}
            >
              🏐 Quota campo
            </button>
            <button
              type="button"
              onClick={() => setChargeKind("BAR")}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-base font-medium",
                chargeKind === "BAR" ? "border-transparent bg-brand-gradient text-white" : "border-line"
              )}
            >
              🍹 Bar
            </button>
          </div>
          <Input
            label="Importo (€)"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={chargeAmount}
            onChange={(e) => setChargeAmount(e.target.value)}
          />
          <Input
            label="Descrizione (facoltativa)"
            value={chargeDesc}
            onChange={(e) => setChargeDesc(e.target.value)}
            placeholder="es. 2 birre"
          />
          <Button variant="secondary" size="lg" className="w-full" disabled={busy} onClick={() => void addCharge()}>
            {busy ? "…" : "Aggiungi al conto"}
          </Button>
        </div>

        {/* Ultimi movimenti */}
        {entries.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Ultimi movimenti</p>
            <LedgerMovements entries={entries} limit={6} />
          </div>
        )}
      </div>
    </Modal>
  );
};
