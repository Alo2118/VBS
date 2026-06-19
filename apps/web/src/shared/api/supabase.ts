import { createClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import { BusinessError, businessErrorFromMessage } from "./errors";

export { BusinessError };

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

/** Converte un errore Postgrest in un errore di business con messaggio leggibile. */
export const toBusinessError = (error: PostgrestError | null): BusinessError | null => {
  if (!error) return null;
  return businessErrorFromMessage(error.message);
};
