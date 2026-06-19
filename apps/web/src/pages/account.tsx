import { useCallback, useEffect, useState } from "react";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { fetchMyAccount, type LedgerEntry } from "@/shared/api/account";
import { LedgerMovements } from "@/shared/account/ledger-movements";
import { formatEur } from "@/shared/utils/money";

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
                <p className="text-sm text-amber-800">Da saldare</p>
                <p className="mt-1 text-3xl font-bold text-amber-800">{formatEur(-balance)}</p>
                <p className="mt-2 text-sm text-amber-800">
                  Puoi saldare alla cassa, in contanti o con Satispay.
                </p>
              </>
            ) : credit ? (
              <>
                <p className="text-sm text-emerald-800">Credito disponibile</p>
                <p className="mt-1 text-3xl font-bold text-emerald-800">{formatEur(balance)}</p>
                <p className="mt-2 text-sm text-emerald-800">
                  Verrà scalato dalle prossime quote campo o consumazioni.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Saldo</p>
                <p className="mt-1 text-3xl font-bold">Conto in pari</p>
              </>
            )}
          </Card>

          <Card>
            <h3 className="mb-2 text-base font-semibold">Movimenti</h3>
            <LedgerMovements entries={entries} />
          </Card>
        </>
      )}
    </Page>
  );
};
