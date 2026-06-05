import { useCallback, useEffect, useState } from "react";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import {
  fetchMyAccount,
  signedAmount,
  type LedgerEntry,
  type LedgerKind,
  type PayMethod
} from "@/shared/api/account";
import { formatEur } from "@/shared/utils/money";
import { formatDateTime } from "@/shared/utils/date";

const kindLabel: Record<LedgerKind, string> = {
  COURT: "Quota campo",
  BAR: "Bar",
  PENALTY: "Penale",
  PAYMENT: "Pagamento",
  TOPUP: "Ricarica",
  WAIVER: "Storno",
  ADJUST: "Rettifica"
};

const methodLabel: Record<PayMethod, string> = { CASH: "contanti", SATISPAY: "Satispay" };

export const AccountPage = () => {
  const notify = useToast();
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { balance: b, entries: e } = await fetchMyAccount();
      setBalance(b);
      setEntries(e);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const owes = balance < 0;
  const credit = balance > 0;

  return (
    <Page title="Il mio conto">
      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Saldo in evidenza */}
          <Card
            className={cn(
              "border-2",
              owes ? "border-amber-300 bg-amber-50" : credit ? "border-emerald-300 bg-emerald-50" : ""
            )}
          >
            {owes ? (
              <>
                <p className="text-base text-amber-800">Da saldare</p>
                <p className="mt-1 text-3xl font-bold text-amber-800">{formatEur(-balance)}</p>
                <p className="mt-2 text-sm text-amber-800">
                  Puoi saldare alla cassa, in contanti o con Satispay.
                </p>
              </>
            ) : credit ? (
              <>
                <p className="text-base text-emerald-800">Credito disponibile</p>
                <p className="mt-1 text-3xl font-bold text-emerald-800">{formatEur(balance)}</p>
                <p className="mt-2 text-sm text-emerald-800">
                  Verrà scalato dalle prossime quote campo o consumazioni.
                </p>
              </>
            ) : (
              <>
                <p className="text-base text-muted">Saldo</p>
                <p className="mt-1 text-3xl font-bold">Conto in pari</p>
              </>
            )}
          </Card>

          <Card>
            <h3 className="text-lg font-semibold">Movimenti</h3>
            {entries.length === 0 ? (
              <p className="mt-3 text-base text-muted">Nessun movimento.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {entries.map((e) => {
                  const signed = signedAmount(e);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium">
                          {e.description || kindLabel[e.kind]}
                        </p>
                        <p className="text-sm text-muted">
                          {kindLabel[e.kind]}
                          {e.method ? ` · ${methodLabel[e.method]}` : ""} ·{" "}
                          {formatDateTime(e.createdAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-base font-semibold",
                          signed < 0 ? "text-red-600" : "text-emerald-600"
                        )}
                      >
                        {signed < 0 ? "−" : "+"}
                        {formatEur(Math.abs(signed))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </Page>
  );
};
