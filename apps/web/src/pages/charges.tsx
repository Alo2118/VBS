import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { StatusPill } from "@/shared/ui/status-pill";
import { NicknameTag } from "@/shared/ui/nickname-tag";
import { useToast } from "@/shared/ui/toast";
import { useAuth } from "@/shared/auth/auth-context";
import { fetchCharges, settleCharge, waiveCharge } from "@/shared/api/staff";
import type { ChargeRow } from "@/shared/api/staff";
import { formatDateTime } from "@/shared/utils/date";
import { formatEur } from "@/shared/utils/money";

const typeLabel: Record<ChargeRow["type"], string> = {
  LATE_CANCELLATION: "Disdetta tardiva",
  NO_SHOW: "Mancata presentazione"
};

const statusMeta: Record<ChargeRow["status"], { label: string; tone: "warning" | "success" | "info" }> = {
  DUE: { label: "Dovuto", tone: "warning" },
  PAID: { label: "Incassato", tone: "success" },
  WAIVED: { label: "Esonerato", tone: "info" }
};

export const ChargesPage = () => {
  const notify = useToast();
  const { profile } = useAuth();
  const canWaive = profile?.role === "ADMIN" || profile?.role === "MANAGER";
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [waiveTarget, setWaiveTarget] = useState<ChargeRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCharges(await fetchCharges());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSettle = async (c: ChargeRow) => {
    setBusy(true);
    try {
      await settleCharge(c.id);
      notify("Addebito incassato.", "success");
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  const onWaive = async () => {
    if (!waiveTarget) return;
    setBusy(true);
    try {
      await waiveCharge(waiveTarget.id, reason);
      notify("Addebito esonerato.", "success");
      setWaiveTarget(null);
      setReason("");
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Addebiti" description="Incassa o esonera gli addebiti per disdette tardive e no-show.">
      {loading ? (
        <Spinner />
      ) : charges.length === 0 ? (
        <Card>
          <p className="text-center text-base text-muted">Nessun addebito registrato.</p>
        </Card>
      ) : (
        charges.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">
                {c.memberName}
                <NicknameTag nickname={c.memberNickname} className="ml-2" />
              </p>
              <p className="text-base text-muted capitalize">
                {typeLabel[c.type]} · {formatDateTime(c.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">{formatEur(c.amount)}</span>
              <StatusPill {...statusMeta[c.status]} />
              {c.status === "DUE" && (
                <>
                  <Button size="lg" onClick={() => onSettle(c)} disabled={busy}>
                    Incassa
                  </Button>
                  {canWaive && (
                    <Button
                      variant="ghost"
                      size="lg"
                      onClick={() => setWaiveTarget(c)}
                      disabled={busy}
                    >
                      Esonera
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        ))
      )}

      <Modal
        open={Boolean(waiveTarget)}
        title="Esonera addebito"
        onClose={() => setWaiveTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setWaiveTarget(null)}>
              Annulla
            </Button>
            <Button size="lg" onClick={onWaive} disabled={busy || reason.trim() === ""}>
              {busy ? "Salvo…" : "Conferma esonero"}
            </Button>
          </>
        }
      >
        <Input
          label="Motivazione (obbligatoria)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="es. impianto chiuso per maltempo"
        />
      </Modal>
    </Page>
  );
};
