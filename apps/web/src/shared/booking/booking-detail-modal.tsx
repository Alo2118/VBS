import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { StatusPill } from "@/shared/ui/status-pill";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { DAY_BOOKING_STATUS_META, type DayBooking } from "@/shared/api/staff";
import { BookingActions } from "./booking-actions";
import { formatDateTime, formatTime } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

/** Dettaglio di una prenotazione con le azioni staff (es. liberare il campo). */
export const BookingDetailModal = ({
  booking,
  onClose,
  onChanged
}: {
  booking: DayBooking;
  onClose: () => void;
  /** Chiamata dopo un'azione: aggiorna l'elenco chiamante e chiude il dettaglio. */
  onChanged: () => void | Promise<void>;
}) => (
  <Modal
    open
    title="Dettaglio prenotazione"
    onClose={onClose}
    footer={
      <>
        <Button variant="ghost" size="lg" onClick={onClose}>
          Chiudi
        </Button>
        <BookingActions
          booking={booking}
          onChanged={async () => {
            await onChanged();
            onClose();
          }}
        />
      </>
    }
  >
    <dl className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted">Capogruppo</dt>
        <dd className="font-medium">
          {booking.memberName}
          <NicknameTag nickname={booking.memberNickname} className="ml-2" />
        </dd>
      </div>
      <Row label="Campo" value={booking.courtName} />
      <Row label="Giorno" value={formatDateTime(booking.startAt)} />
      <Row label="Orario" value={`${formatTime(booking.startAt)}–${formatTime(booking.endAt)}`} />
      <Row label="Prezzo campo" value={formatEur(booking.price)} />
      <Row label="Giocatori" value={String(booking.players)} />
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted">Stato</dt>
        <dd>
          <StatusPill {...(DAY_BOOKING_STATUS_META[booking.status] ?? { label: booking.status, tone: "info" })} />
        </dd>
      </div>
    </dl>
  </Modal>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3">
    <dt className="text-muted">{label}</dt>
    <dd className="font-medium capitalize">{value}</dd>
  </div>
);
