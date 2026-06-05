import {
  LEDGER_KIND_LABELS,
  PAY_METHOD_LABELS,
  signedAmount,
  type LedgerEntry
} from "@/shared/api/account";
import { cn } from "@/shared/ui/cn";
import { formatEur } from "@/shared/utils/money";
import { formatDateTime } from "@/shared/utils/date";

/**
 * Lista dei movimenti del conto, riusata da «Il mio conto» (socio) e dalla
 * Cassa (staff). `limit` mostra solo gli ultimi N movimenti.
 */
export const LedgerMovements = ({
  entries,
  limit
}: {
  entries: LedgerEntry[];
  limit?: number;
}) => {
  if (entries.length === 0) {
    return <p className="text-base text-muted">Nessun movimento.</p>;
  }
  const rows = limit ? entries.slice(0, limit) : entries;
  return (
    <ul className="divide-y divide-line">
      {rows.map((e) => {
        const signed = signedAmount(e);
        return (
          <li key={e.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-base font-medium">
                {e.description || LEDGER_KIND_LABELS[e.kind]}
              </p>
              <p className="text-sm text-muted">
                {LEDGER_KIND_LABELS[e.kind]}
                {e.method ? ` · ${PAY_METHOD_LABELS[e.method]}` : ""} · {formatDateTime(e.createdAt)}
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
  );
};
