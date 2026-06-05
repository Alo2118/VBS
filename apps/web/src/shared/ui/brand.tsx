import { cn } from "./cn";

/** Nome dell'associazione, usato in tutta l'app. */
export const APP_NAME = "Vicenza Beach Summer";

/** L'anno corrente, calcolato una sola volta al caricamento del modulo. */
const CURRENT_YEAR = new Date().getFullYear();

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.jpg`;

/**
 * Logo + nome dell'associazione.
 * `size` adatta l'uso (header vs schermata d'accesso); `tone` adatta il colore
 * del testo allo sfondo (chiaro sul gradiente, scuro sulle superfici chiare).
 */
export const BrandMark = ({
  size = "md",
  tone = "dark",
  className
}: {
  size?: "md" | "lg";
  tone?: "dark" | "light";
  className?: string;
}) => {
  const lg = size === "lg";
  const onLight = tone === "dark";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-black/5",
          lg ? "h-14 w-14" : "h-10 w-10"
        )}
      >
        <img src={LOGO_SRC} alt="" className="h-full w-full object-cover" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-semibold leading-tight",
            onLight ? "text-ink" : "text-white",
            lg ? "text-2xl" : "text-lg"
          )}
        >
          {APP_NAME}
        </span>
        <span
          className={cn(
            "block",
            onLight ? "text-muted" : "text-white/80",
            lg ? "text-base" : "text-xs"
          )}
        >
          Prenotazione campi beach volley
        </span>
      </span>
    </div>
  );
};

/** Footer con la nota di proprietà e i diritti riservati. */
export const BrandFooter = ({ className }: { className?: string }) => (
  <footer
    className={cn("px-4 py-5 text-center text-xs leading-relaxed text-muted", className)}
  >
    <p>
      © {CURRENT_YEAR} {APP_NAME}
    </p>
    <p>
      App sviluppata da <span className="font-medium text-ink">Alo</span> · Tutti i diritti
      riservati
    </p>
  </footer>
);
