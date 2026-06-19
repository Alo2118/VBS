import { Input } from "@/shared/ui/input";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useMemberSearch } from "./use-member-search";
import type { MemberLite } from "@vbs/shared";

/**
 * Campo di ricerca soci con elenco a discesa, riusato da Cassa e Bar.
 * Chiama `onSelect` alla scelta e si ripulisce. `excludeIds` filtra chi escludere.
 */
export const MemberSearch = ({
  onSelect,
  label = "Cerca un socio",
  placeholder = "Nome o soprannome…",
  excludeIds
}: {
  onSelect: (member: MemberLite) => void;
  label?: string;
  placeholder?: string;
  excludeIds?: string[];
}) => {
  const { query, setQuery, results, reset } = useMemberSearch(excludeIds);

  const pick = (m: MemberLite) => {
    onSelect(m);
    reset();
  };

  return (
    <div className="space-y-2">
      <Input
        label={label}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul className="divide-y divide-line">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => pick(m)}
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
    </div>
  );
};
