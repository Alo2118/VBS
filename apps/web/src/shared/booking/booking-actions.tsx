import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { useToast } from "@/shared/ui/toast";
import {
  markNoShow,
  staffCancelBooking,
  undoNoShow
} from "@/shared/api/staff";
import { postCourtFees } from "@/shared/api/account";
import type { DayBooking } from "@/shared/api/staff";
import { formatTime } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

/**
 * Azioni staff su una prenotazione, in base allo stato e all'orario:
 *  - futura confermata → «Libera campo» (disdetta con/senza penale)
 *  - già iniziata confermata → «No-show»
 *  - no-show → «Annulla no-show»
 * Riutilizzabile da Presenze e dal dettaglio in dashboard.
 */
export const BookingActions = ({
  booking,
  onChanged
}: {
  booking: DayBooking;
  onChanged: () => void | Promise<void>;
}) => {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) notify(ok, "info");
      await onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const onFree = (charge: boolean) => {
    setFreeOpen(false);
    void run(
      () => staffCancelBooking(booking.id, charge),
      charge ? "Campo liberato con penale al capogruppo." : "Campo liberato senza penale."
    );
  };

  const started = new Date(booking.startAt) <= new Date();

  return (
    <>
      {booking.status === "CONFIRMED" && !started && (
        <Button variant="secondary" size="lg" onClick={() => setFreeOpen(true)} disabled={busy}>
          Libera campo
        </Button>
      )}
      {booking.status === "CONFIRMED" && started && (
        <Button
          variant="danger"
          size="lg"
          onClick={() => run(() => markNoShow(booking.id), "Segnata come mancata presentazione. Addebito generato.")}
          disabled={busy}
        >
          No-show
        </Button>
      )}
      {booking.status === "NO_SHOW" && (
        <Button
          variant="secondary"
          size="lg"
          onClick={() => run(() => undoNoShow(booking.id), "Mancata presentazione annullata. Addebito rimosso.")}
          disabled={busy}
        >
          Annulla no-show
        </Button>
      )}
      {(booking.status === "CONFIRMED" || booking.status === "NO_SHOW") && (
        <Button
          variant="ghost"
          size="lg"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const n = await postCourtFees(booking.id);
              notify(
                n > 0
                  ? `Quota campo addebitata a ${n} giocatori.`
                  : "Quota campo già addebitata.",
                n > 0 ? "success" : "info"
              );
            }, "")
          }
        >
          Quota campo
        </Button>
      )}

      <Modal
        open={freeOpen}
        title="Libera campo"
        onClose={() => setFreeOpen(false)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setFreeOpen(false)}>
              Annulla
            </Button>
            <Button variant="secondary" size="lg" onClick={() => onFree(false)}>
              Senza penale
            </Button>
            <Button variant="danger" size="lg" onClick={() => onFree(true)}>
              Con penale
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <p>
            Disdire la prenotazione di <span className="font-medium">{booking.memberName}</span> (
            {booking.courtName}, {formatTime(booking.startAt)}) e liberare il campo?
          </p>
          <p className="text-base text-muted">
            «Con penale» addebita al capogruppo il prezzo del campo ({formatEur(booking.price)}), come
            una disdetta tardiva. «Senza penale» non genera alcun addebito.
          </p>
        </div>
      </Modal>
    </>
  );
};
