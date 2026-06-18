import type React from "react";
import { useEffect } from "react";

/** Dialog modale accessibile (chiusura con Esc / click esterno). */
export const Modal = ({
  open,
  title,
  onClose,
  children,
  footer
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-navy/45 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      {/* Bottom-sheet su mobile, card centrata su desktop. Header e footer
          restano fissi, il corpo scorre: i pulsanti non finiscono mai fuori schermo. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92vh] w-full max-w-md animate-scale-in flex-col rounded-t-3xl border border-line/70 bg-card/98 shadow-lift sm:max-h-[85vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Maniglia del bottom-sheet (solo mobile). */}
        <span
          aria-hidden
          className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden"
        />
        <h2 className="shrink-0 px-5 pb-4 pt-3 text-lg font-semibold text-ink sm:border-b sm:border-line sm:pt-4">
          {title}
        </h2>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-base text-ink/90">{children}</div>
        {footer && (
          <div className="shrink-0 flex flex-wrap justify-end gap-3 border-t border-line bg-sand/20 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
