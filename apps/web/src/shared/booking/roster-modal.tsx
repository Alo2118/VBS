import { useCallback, useEffect, useState } from "react";
import type { BookingPlayer, BookingPolicy, MemberLite } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Spinner } from "@/shared/ui/spinner";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import {
  addPlayer,
  fetchPlayers,
  removePlayer,
  searchValidMembers
} from "@/shared/api/bookings";
import { perPlayerShare } from "@/shared/utils/pricing";
import { formatEur } from "@/shared/utils/money";

type Props = {
  bookingId: string;
  courtPrice: number;
  perHeadPrice: number;
  policy: BookingPolicy;
  onClose: () => void;
  /** Chiamata quando la rosa cambia (per aggiornare la lista chiamante). */
  onChanged?: () => void;
};

/** Gestione della rosa di uno slot: aggiungi/rimuovi soci validi, mostra la quota. */
export const RosterModal = ({
  bookingId,
  courtPrice,
  perHeadPrice,
  policy,
  onClose,
  onChanged
}: Props) => {
  const notify = useToast();
  const [players, setPlayers] = useState<BookingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberLite[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlayers(await fetchPlayers(bookingId));
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [bookingId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ricerca soci validi al variare del testo (con piccolo debounce).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchValidMembers(q)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const onAdd = async (m: MemberLite) => {
    setBusy(true);
    try {
      await addPlayer(bookingId, m.id);
      setQuery("");
      setResults([]);
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Aggiunta non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (m: BookingPlayer) => {
    setBusy(true);
    try {
      await removePlayer(bookingId, m.memberId);
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Rimozione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const inRoster = new Set(players.map((p) => p.memberId));
  const count = players.length;
  const share = perPlayerShare({
    players: count,
    courtPrice,
    perHeadPrice,
    threshold: policy.perHeadThreshold
  });
  const enough = count >= policy.minPlayers;

  return (
    <Modal
      open
      title="Giocatori dello slot"
      onClose={onClose}
      footer={
        <Button size="lg" onClick={onClose}>
          Fatto
        </Button>
      }
    >
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {/* Riepilogo costo */}
          <div
            className={cnBox(enough)}
          >
            <p className="text-base font-medium">
              {count} {count === 1 ? "giocatore" : "giocatori"} · quota {formatEur(share)} a testa
            </p>
            {!enough && (
              <p className="mt-1 text-sm">
                Servono almeno {policy.minPlayers} soci con tessera valida per giocare.
              </p>
            )}
          </div>

          {/* Rosa attuale */}
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.memberId}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-sand/30 px-3 py-2"
              >
                <span className="text-base">
                  {p.fullName}
                  <NicknameTag nickname={p.nickname} className="ml-1" />
                  {p.isBooker && <span className="ml-2 text-sm text-muted">(capogruppo)</span>}
                </span>
                {!p.isBooker && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(p)}
                    disabled={busy}
                    aria-label={`Rimuovi ${p.fullName}`}
                  >
                    Rimuovi
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {/* Aggiungi giocatori */}
          <div className="space-y-2">
            <Input
              label="Aggiungi un socio (tessera valida)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca per nome…"
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul className="max-h-44 space-y-1 overflow-y-auto">
                {results
                  .filter((m) => !inRoster.has(m.id))
                  .map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => onAdd(m)}
                        disabled={busy}
                        className="flex w-full items-center justify-between rounded-lg border border-line bg-white px-3 py-2 text-left text-base hover:bg-sand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <span>
                          {m.fullName}
                          <NicknameTag nickname={m.nickname} className="ml-1" />
                        </span>
                        <span aria-hidden className="text-accent">
                          +
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {query.trim().length >= 2 && results.length === 0 && (
              <p className="text-sm text-muted">Nessun socio valido trovato.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

const cnBox = (ok: boolean): string =>
  ok
    ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800"
    : "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800";
