import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminSummary } from "@vbs/shared";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { StatusPill } from "@/shared/ui/status-pill";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/ui/cn";
import { fetchAdminSummary } from "@/shared/api/dashboard";
import { fetchTakingsToday, type Takings } from "@/shared/api/account";
import { fetchUpcomingBookings } from "@/shared/api/staff";
import type { DayBooking } from "@/shared/api/staff";
import { BookingDetailModal } from "@/shared/booking/booking-detail-modal";
import { formatDateTime, formatTime } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

type Tone = "neutral" | "info" | "warning" | "danger";

const toneClasses: Record<Tone, { bar: string; chip: string }> = {
  neutral: { bar: "bg-line", chip: "bg-accent-soft text-sea-deep" },
  info: { bar: "bg-sky-400", chip: "bg-sky-100 text-sky-700" },
  warning: { bar: "bg-amber-400", chip: "bg-amber-100 text-amber-700" },
  danger: { bar: "bg-red-400", chip: "bg-red-100 text-red-700" }
};

const Stat = ({
  label,
  value,
  hint,
  to,
  icon,
  tone = "neutral"
}: {
  label: string;
  value: string;
  hint?: string;
  to: string;
  icon: string;
  tone?: Tone;
}) => {
  const t = toneClasses[tone];
  return (
    <Link
      to={to}
      className={cn(
        "group relative block overflow-hidden rounded-2.5xl border border-line/80 bg-card/95 p-5 shadow-card transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-sea/40 hover:shadow-lift",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      )}
    >
      {/* Barra accento (tono) sul bordo sinistro */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", t.bar)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-base text-muted">{label}</p>
        <span
          aria-hidden
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg transition-transform duration-200 group-hover:scale-110",
            t.chip
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </Link>
  );
};

export const DashboardPage = () => {
  const notify = useToast();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [upcoming, setUpcoming] = useState<DayBooking[]>([]);
  const [takings, setTakings] = useState<Takings | null>(null);
  const [detail, setDetail] = useState<DayBooking | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, t] = await Promise.all([
        fetchAdminSummary(),
        fetchUpcomingBookings(),
        fetchTakingsToday()
      ]);
      setSummary(s);
      setUpcoming(u);
      setTakings(t);
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
        <>
        {takings && (
          <div className="relative mb-4 overflow-hidden rounded-2.5xl bg-brand-gradient-strong p-5 text-white shadow-hero">
            {/* Alone decorativo */}
            <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
            <p className="text-sm font-semibold uppercase tracking-wide text-white/80">Incassi di oggi</p>
            <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-xs font-medium text-white/70">💶 Contanti</p>
                <p className="text-2xl font-bold tabular-nums">{formatEur(takings.cash)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-white/70">📱 Satispay</p>
                <p className="text-2xl font-bold tabular-nums">{formatEur(takings.satispay)}</p>
              </div>
              <div className="ml-auto rounded-2xl bg-white/15 px-4 py-2 backdrop-blur-sm">
                <p className="text-xs font-medium text-white/70">Totale</p>
                <p className="text-2xl font-extrabold tabular-nums">{formatEur(takings.cash + takings.satispay)}</p>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <Stat
            label="Prenotazioni oggi"
            value={String(summary.bookingsToday)}
            to="/attendance"
            icon="🏐"
            hint="Vai alle presenze"
          />
          <Stat
            label="Prenotazioni in arrivo"
            value={String(summary.bookingsUpcoming)}
            to="/attendance"
            icon="📅"
          />
          <Stat
            label="Soci da confermare"
            value={String(summary.pendingMembers)}
            to="/members"
            icon="👥"
            tone={summary.pendingMembers > 0 ? "warning" : "neutral"}
            hint={summary.pendingMembers > 0 ? "Richiedono validazione" : "Tutto in regola"}
          />
          <Stat
            label="Da incassare"
            value={String(summary.chargesDueCount)}
            to="/cassa"
            icon="💰"
            tone={summary.chargesDueCount > 0 ? "danger" : "neutral"}
            hint={
              summary.chargesDueCount > 0
                ? `Totale ${formatEur(summary.chargesDueAmount)}`
                : "Tutto saldato"
            }
          />
          <Stat
            label="Tessere in scadenza"
            value={String(summary.expiringSoon)}
            to="/members"
            icon="⏳"
            tone={summary.expiringSoon > 0 ? "warning" : "neutral"}
            hint="Entro 30 giorni"
          />
          <Stat
            label="Slot incompleti"
            value={String(summary.underfilled)}
            to="/attendance"
            icon="⚠️"
            tone={summary.underfilled > 0 ? "warning" : "neutral"}
            hint="Sotto il minimo giocatori"
          />
        </div>
        </>
      )}

      {!loading && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Prossime prenotazioni</h2>
            <span className="text-sm text-muted">Tocca per il dettaglio</span>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-base text-muted">Nessuna prenotazione in arrivo.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setDetail(b)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition hover:bg-sand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {b.memberName}
                        <NicknameTag nickname={b.memberNickname} className="ml-2" />
                      </span>
                      <span className="block text-sm text-muted capitalize">
                        {formatDateTime(b.startAt)} · {b.courtName}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-muted">{formatTime(b.startAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {detail && (
        <BookingDetailModal
          booking={detail}
          onClose={() => setDetail(null)}
          onChanged={load}
        />
      )}
    </Page>
  );
};
