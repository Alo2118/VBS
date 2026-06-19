import { useEffect, useState } from "react";
import { searchValidMembers } from "@/shared/api/bookings";
import type { MemberLite } from "@vbs/shared";

/**
 * Ricerca soci validi "as-you-type" con debounce (250ms) ed esclusioni
 * opzionali. Logica condivisa tra MemberSearch (Cassa/Bar) e la rosa dello slot.
 */
export const useMemberSearch = (excludeIds?: string[]) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberLite[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void searchValidMembers(q)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  const visible = excludeIds ? results.filter((m) => !excludeIds.includes(m.id)) : results;
  const reset = () => {
    setQuery("");
    setResults([]);
  };

  return { query, setQuery, results: visible, reset };
};
