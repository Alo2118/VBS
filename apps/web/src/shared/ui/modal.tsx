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
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      {/* Bottom-sheet su mobile, card centrata su desktop. Header e footer
          restano fissi, il corpo scorre: i pulsanti non finiscono mai fuori schermo. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-line bg-card shadow-soft sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="shrink-0 border-b border-line px-5 py-4 text-lg font-semibold text-ink">
          {title}
        </h2>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-base text-ink/90">{children}</div>
        {footer && (
          <div className="shrink-0 flex flex-wrap justify-end gap-3 border-t border-line px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
