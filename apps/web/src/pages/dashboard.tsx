import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminSummary } from "@vbs/shared";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { fetchAdminSummary } from "@/shared/api/dashboard";
import { formatEur } from "@/shared/utils/money";

type Tone = "neutral" | "info" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "border-slate-800",
  info: "border-sky-500/40",
  warning: "border-amber-500/40",
  danger: "border-red-500/40"
};

const Stat = ({
  label,
  value,
  hint,
  to,
  tone = "neutral"
}: {
  label: string;
  value: string;
  hint?: string;
  to: string;
  tone?: Tone;
}) => (
  <Link
    to={to}
    className={cn(
      "block rounded-2xl border bg-card/80 p-5 shadow-lg transition hover:bg-slate-800/60",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      toneClasses[tone]
    )}
  >
    <p className="text-base text-muted">{label}</p>
    <p className="mt-1 text-3xl font-semibold">{value}</p>
    {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
  </Link>
);

export const DashboardPage = () => {
  const notify = useToast();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await fetchAdminSummary());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Page title="Riepilogo" description="Colpo d'occhio sullo stato del circolo.">
      {loading || !summary ? (
        <Spinner label="Carico il riepilogo…" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Stat
            label="Prenotazioni oggi"
            value={String(summary.bookingsToday)}
            to="/attendance"
            hint="Vai alle presenze"
          />
          <Stat
            label="Prenotazioni in arrivo"
            value={String(summary.bookingsUpcoming)}
            to="/attendance"
          />
          <Stat
            label="Soci da confermare"
            value={String(summary.pendingMembers)}
            to="/members"
            tone={summary.pendingMembers > 0 ? "warning" : "neutral"}
            hint={summary.pendingMembers > 0 ? "Richiedono validazione" : "Tutto in regola"}
          />
          <Stat
            label="Addebiti da incassare"
            value={String(summary.chargesDueCount)}
            to="/charges"
            tone={summary.chargesDueCount > 0 ? "danger" : "neutral"}
            hint={
              summary.chargesDueCount > 0
                ? `Totale ${formatEur(summary.chargesDueAmount)}`
                : "Nessun sospeso"
            }
          />
          <Stat
            label="Tessere in scadenza"
            value={String(summary.expiringSoon)}
            to="/members"
            tone={summary.expiringSoon > 0 ? "warning" : "neutral"}
            hint="Entro 30 giorni"
          />
          <Stat
            label="Slot incompleti"
            value={String(summary.underfilled)}
            to="/attendance"
            tone={summary.underfilled > 0 ? "warning" : "neutral"}
            hint="Sotto il minimo giocatori"
          />
        </div>
      )}
    </Page>
  );
};
