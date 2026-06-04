import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { MemberProfile } from "@vbs/shared";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Page } from "@/shared/ui/page";
import { Spinner } from "@/shared/ui/spinner";
import { StatusPill } from "@/shared/ui/status-pill";
import { useToast } from "@/shared/ui/toast";
import { fetchMembers, validateMember } from "@/shared/api/staff";
import { toIsoDate } from "@/shared/utils/date";

const statusTone = (s: MemberProfile["membershipStatus"]) =>
  s === "VALID" ? "success" : s === "PENDING" ? "warning" : "danger";

const statusText: Record<MemberProfile["membershipStatus"], string> = {
  VALID: "Valida",
  PENDING: "Da confermare",
  EXPIRED: "Scaduta",
  SUSPENDED: "Sospesa"
};

export const MembersPage = () => {
  const notify = useToast();
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<MemberProfile | null>(null);
  const [aics, setAics] = useState("");
  const [start, setStart] = useState(toIsoDate(new Date()));
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await fetchMembers());
    } catch (err) {
      notify(err instanceof Error ? err.message : "Errore nel caricamento.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const openValidate = (m: MemberProfile) => {
    setTarget(m);
    setAics(m.aicsNumber ?? "");
    setStart(m.membershipStartDate ?? toIsoDate(new Date()));
    setEnd(m.membershipEndDate ?? "");
  };

  const onValidate = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      await validateMember({
        memberId: target.id,
        aicsNumber: aics,
        startDate: start,
        endDate: end
      });
      notify("Tessera aggiornata. Il socio può prenotare.", "success");
      setTarget(null);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Operazione non riuscita.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Soci" description="Conferma le tessere per abilitare le prenotazioni.">
      {loading ? (
        <Spinner />
      ) : (
        members.map((m) => (
          <Card key={m.id} className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">{m.fullName || m.email}</p>
              <p className="text-base text-muted">
                {m.email}
                {m.aicsNumber ? ` · Tessera ${m.aicsNumber}` : ""}
                {m.membershipEndDate ? ` · Scad. ${m.membershipEndDate}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill label={statusText[m.membershipStatus]} tone={statusTone(m.membershipStatus)} />
              {m.role === "MEMBER" && (
                <Button size="lg" onClick={() => openValidate(m)}>
                  {m.membershipStatus === "VALID" ? "Modifica tessera" : "Conferma tessera"}
                </Button>
              )}
            </div>
          </Card>
        ))
      )}

      <Modal
        open={Boolean(target)}
        title={`Tessera di ${target?.fullName || target?.email || ""}`}
        onClose={() => setTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setTarget(null)}>
              Annulla
            </Button>
            <Button size="lg" form="validate-form" type="submit" disabled={busy}>
              {busy ? "Salvo…" : "Salva"}
            </Button>
          </>
        }
      >
        <form id="validate-form" onSubmit={onValidate} className="space-y-4">
          <Input
            label="Numero tessera AICS"
            value={aics}
            onChange={(e) => setAics(e.target.value)}
            required
          />
          <Input
            label="Inizio tesseramento"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
          <Input
            label="Scadenza tesseramento"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </form>
      </Modal>
    </Page>
  );
};
