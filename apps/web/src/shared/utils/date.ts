// Formattazione date/ore centralizzata (DEV_BEST_PRACTICE §4.3). Locale it-IT.

const TIME_ZONE = "Europe/Rome";

export const toIsoDate = (date: Date): string => {
  // YYYY-MM-DD nel fuso locale (evita scivolamenti di giorno con UTC).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** Offset (in minuti) di Europe/Rome per un dato istante UTC (gestisce l'ora legale). */
const romeOffsetMinutes = (utc: Date): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })
    .formatToParts(utc)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - utc.getTime()) / 60000;
};

/** Istante UTC (ISO) della mezzanotte locale (Europe/Rome) per una data YYYY-MM-DD. */
const romeMidnightUtc = (isoDate: string): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offset = romeOffsetMinutes(guess);
  return new Date(guess.getTime() - offset * 60_000).toISOString();
};

/**
 * Intervallo UTC semiaperto [inizio, inizioGiornoDopo) corrispondente alla
 * giornata locale (Europe/Rome) indicata da `isoDate` (YYYY-MM-DD). Da usare
 * per filtrare colonne `timestamptz` senza scivolamenti di giorno.
 */
export const romeDayRangeUtc = (isoDate: string): { start: string; endExclusive: string } => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const nextIso = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start: romeMidnightUtc(isoDate), endExclusive: romeMidnightUtc(nextIso) };
};

export const isSameDay = (a: Date, b: Date): boolean =>
  toIsoDate(a) === toIsoDate(b);

/** Lunedì della settimana che contiene `date` (settimana ISO, inizio lunedì). */
export const startOfWeek = (date: Date): Date => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isoDow = (d.getDay() + 6) % 7; // 0 = lunedì … 6 = domenica
  return addDays(d, -isoDow);
};

/** I 7 giorni (Date) a partire da `start`. */
export const weekDays = (start: Date): Date[] =>
  Array.from({ length: 7 }, (_, i) => addDays(start, i));

const dayFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TIME_ZONE
});

const timeFormatter = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE
});

const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE
});

const weekdayShortFormatter = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  timeZone: TIME_ZONE
});

/** "lunedì 8 giugno" */
export const formatDay = (date: Date): string => dayFormatter.format(date);

/** "lun" — etichetta breve del giorno della settimana. */
export const formatWeekdayShort = (date: Date): string =>
  weekdayShortFormatter.format(date).replace(".", "");

/** "18:00" da una stringa ISO. */
export const formatTime = (iso: string): string =>
  timeFormatter.format(new Date(iso));

/** "venerdì 6 giugno, 23:59" da una stringa ISO. */
export const formatDateTime = (iso: string): string =>
  dateTimeFormatter.format(new Date(iso));
