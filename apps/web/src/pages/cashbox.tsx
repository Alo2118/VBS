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
import { Segmented } from "@/shared/ui/segmented";
import { MemberSearch } from "@/shared/members/member-search";
import { LedgerMovements } from "@/shared/account/ledger-movements";
import {
  fetchMemberAccounts,
  fetchMemberLedger,
  postCharge,
  postPayment,
  postWaiver,
  reverseLedgerEntry,
  type LedgerEntry,
  type MemberAccount,
  type PayMethod
} from "@/shared/api/account";
import { formatEur, parseAmount } from "@/shared/utils/money";

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
            <h3 className="text-base font-semibold">Da incassare ({owing.length})</h3>
            {owing.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nessun sospeso. Tutto saldato 🎉</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {owing.map((a) => (
                  <AccountRow key={a.memberId} a={a} onClick={() => setTarget(a)} />
                ))}
              </ul>
            )}
          </Card>

          {others.length > 0 && (
            <Card>
              <h3 className="text-base font-semibold">Altri conti</h3>
              <ul className="mt-2 divide-y divide-line">
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
      className="flex w-full items-center justify-between gap-3 px-1 py-2 text-left hover:bg-sand/40"
    >
      <span className="min-w-0 truncate text-sm font-medium">
        {a.fullName}
        <NicknameTag nickname={a.nickname} className="ml-1" />
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
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
  // Storno di un movimento
  const [reverseTarget, setReverseTarget] = useState<LedgerEntry | null>(null);
  const [reverseReason, setReverseReason] = useState("");

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
    const amt = parseAmount(payAmount);
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
    const amt = parseAmount(chargeAmount);
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

  const doReverse = async () => {
    if (!reverseTarget) return;
    if (!reverseReason.trim()) {
      notify("Indica il motivo dello storno.", "error");
      return;
    }
    setBusy(true);
    try {
      await reverseLedgerEntry(reverseTarget.id, reverseReason.trim());
      notify("Movimento stornato.", "success");
      setReverseTarget(null);
      setReverseReason("");
      await reload();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Storno non riuscito.", "error");
    } finally {
      setBusy(false);
    }
  };

  const payError = payAmount.trim() && !(parseAmount(payAmount) > 0) ? "Importo non valido." : undefined;
  const chargeError =
    chargeAmount.trim() && !(parseAmount(chargeAmount) > 0) ? "Importo non valido." : undefined;

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
          <Segmented<"PAYMENT" | "TOPUP" | "WAIVER">
            value={payKind}
            onChange={setPayKind}
            options={
              canWaive
                ? [
                    { value: "PAYMENT", label: "Pagamento" },
                    { value: "TOPUP", label: "Ricarica" },
                    { value: "WAIVER", label: "Storno" }
                  ]
                : [
                    { value: "PAYMENT", label: "Pagamento" },
                    { value: "TOPUP", label: "Ricarica" }
                  ]
            }
          />
          {payKind === "WAIVER" ? (
            <Input
              label="Motivo dello storno"
              value={waiveReason}
              onChange={(e) => setWaiveReason(e.target.value)}
              placeholder="es. errore di registrazione"
            />
          ) : (
            <Segmented<PayMethod>
              value={method}
              onChange={setMethod}
              options={[
                { value: "CASH", label: "💶 Contanti" },
                { value: "SATISPAY", label: "📱 Satispay" }
              ]}
            />
          )}
          <Input
            label="Importo (€)"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={payAmount}
            error={payError}
            onChange={(e) => setPayAmount(e.target.value)}
          />
          <Button size="lg" className="w-full" loading={busy} onClick={() => void registerPayment()}>
            {payKind === "WAIVER" ? "Registra storno" : "Registra incasso"}
          </Button>
        </div>

        {/* Aggiungi addebito */}
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Aggiungi addebito</p>
          <Segmented<"COURT" | "BAR">
            value={chargeKind}
            onChange={setChargeKind}
            options={[
              { value: "COURT", label: "🏐 Quota campo" },
              { value: "BAR", label: "🍹 Bar" }
            ]}
          />
          <Input
            label="Importo (€)"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={chargeAmount}
            error={chargeError}
            onChange={(e) => setChargeAmount(e.target.value)}
          />
          <Input
            label="Descrizione (facoltativa)"
            value={chargeDesc}
            onChange={(e) => setChargeDesc(e.target.value)}
            placeholder="es. 2 birre"
          />
          <Button variant="secondary" size="lg" className="w-full" loading={busy} onClick={() => void addCharge()}>
            Aggiungi al conto
          </Button>
        </div>

        {/* Ultimi movimenti */}
        {entries.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Ultimi movimenti</p>
            <LedgerMovements
              entries={entries}
              limit={6}
              onReverse={canWaive ? (e) => setReverseTarget(e) : undefined}
            />
          </div>
        )}
      </div>

      {/* Conferma storno di un movimento */}
      {reverseTarget && (
        <Modal
          open
          title="Annullare il movimento?"
          onClose={() => {
            setReverseTarget(null);
            setReverseReason("");
          }}
          footer={
            <>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => {
                  setReverseTarget(null);
                  setReverseReason("");
                }}
                disabled={busy}
              >
                Mantieni
              </Button>
              <Button variant="danger" size="lg" loading={busy} onClick={() => void doReverse()}>
                Annulla movimento
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-base">
              Verrà inserito un movimento di storno che riporta il saldo come prima.
              Il movimento originale resta nello storico.
            </p>
            <p className="text-base font-medium">
              {reverseTarget.description || reverseTarget.kind} · {formatEur(reverseTarget.amount)}
            </p>
            <Input
              label="Motivo dello storno"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="es. importo sbagliato"
            />
          </div>
        </Modal>
      )}
    </Modal>
  );
};
