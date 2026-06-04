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
