import { cn } from "./cn";

/** Nome dell'associazione, usato in tutta l'app. */
export const APP_NAME = "Vicenza Beach Summer";

/** L'anno corrente, calcolato una sola volta al caricamento del modulo. */
const CURRENT_YEAR = new Date().getFullYear();

/** Logo + nome dell'associazione. `size` adatta l'uso (header vs schermata d'accesso). */
export const BrandMark = ({
  size = "md",
  className
}: {
  size?: "md" | "lg";
  className?: string;
}) => {
  const lg = size === "lg";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl bg-brand-gradient shadow-lg shadow-sea/20",
          lg ? "h-14 w-14 text-3xl" : "h-10 w-10 text-xl"
        )}
      >
        🏐
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-semibold leading-tight text-slate-50",
            lg ? "text-2xl" : "text-lg"
          )}
        >
          {APP_NAME}
        </span>
        <span className={cn("block text-muted", lg ? "text-base" : "text-xs")}>
          Prenotazione campi beach volley
        </span>
      </span>
    </div>
  );
};

/** Footer con la nota di proprietà e i diritti riservati. */
export const BrandFooter = ({ className }: { className?: string }) => (
  <footer
    className={cn(
      "px-4 py-5 text-center text-xs leading-relaxed text-muted",
      className
    )}
  >
    <p>
      © {CURRENT_YEAR} {APP_NAME}
    </p>
    <p>
      App sviluppata da <span className="font-medium text-slate-300">Alo</span> · Tutti i diritti
      riservati
    </p>
  </footer>
);
