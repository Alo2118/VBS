import type { BusinessErrorCode } from "@vbs/shared";

/** Messaggi utente per i codici errore di business (italiano, leggibili over 50). */
export const businessMessages: Record<BusinessErrorCode, string> = {
  MEMBERSHIP_NOT_VALID:
    "La tua tessera non è valida o non è ancora stata confermata dallo staff. Non puoi prenotare.",
  SLOT_TAKEN: "Questo orario è appena stato prenotato da un altro socio. Scegli un altro slot.",
  OUTSIDE_BOOKING_WINDOW: "Non è possibile prenotare per questa data.",
  CANCELLATION_LATE: "Sei oltre il termine di disdetta gratuita: sarà dovuto il pagamento.",
  BOOKING_NOT_FOUND: "Prenotazione non trovata o non più modificabile.",
  NOT_AUTHORIZED: "Non hai i permessi per questa operazione."
};

const GENERIC_MESSAGE = "Si è verificato un errore. Riprova.";

export class BusinessError extends Error {
  code: BusinessErrorCode | "UNKNOWN";
  constructor(code: BusinessErrorCode | "UNKNOWN", message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Costruisce un BusinessError dal messaggio grezzo restituito dal DB.
 * Funzione pura (nessuna dipendenza dal client) → unit-testabile.
 */
export const businessErrorFromMessage = (rawMessage?: string | null): BusinessError => {
  const raw = rawMessage?.trim() ?? "";
  if (raw in businessMessages) {
    const code = raw as BusinessErrorCode;
    return new BusinessError(code, businessMessages[code]);
  }
  return new BusinessError("UNKNOWN", GENERIC_MESSAGE);
};
