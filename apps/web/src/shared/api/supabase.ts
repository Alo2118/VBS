import { createClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import type { BusinessErrorCode } from "@vbs/shared";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fallisce subito e chiaramente invece di errori oscuri a runtime.
  throw new Error(
    "Configurazione Supabase mancante: imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY in apps/web/.env"
  );
}

/** Client Supabase unico per tutta l'app (DEV_BEST_PRACTICE §4.1). */
export const supabase = createClient(url, anonKey);

/** Messaggi utente per i codici errore di business (italiano, leggibili over 50). */
const businessMessages: Record<BusinessErrorCode, string> = {
  MEMBERSHIP_NOT_VALID:
    "La tua tessera non è valida o non è ancora stata confermata dallo staff. Non puoi prenotare.",
  SLOT_TAKEN: "Questo orario è appena stato prenotato da un altro socio. Scegli un altro slot.",
  OUTSIDE_BOOKING_WINDOW: "Non è possibile prenotare per questa data.",
  CANCELLATION_LATE: "Sei oltre il termine di disdetta gratuita: sarà dovuto il pagamento.",
  BOOKING_NOT_FOUND: "Prenotazione non trovata o non più modificabile.",
  NOT_AUTHORIZED: "Non hai i permessi per questa operazione."
};

export class BusinessError extends Error {
  code: BusinessErrorCode | "UNKNOWN";
  constructor(code: BusinessErrorCode | "UNKNOWN", message: string) {
    super(message);
    this.code = code;
  }
}

/** Converte un errore Postgrest in un errore di business con messaggio leggibile. */
export const toBusinessError = (error: PostgrestError | null): BusinessError | null => {
  if (!error) return null;
  const raw = error.message?.trim() ?? "";
  if (raw in businessMessages) {
    const code = raw as BusinessErrorCode;
    return new BusinessError(code, businessMessages[code]);
  }
  return new BusinessError("UNKNOWN", "Si è verificato un errore. Riprova.");
};
