import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { StatusPill } from "@/shared/ui/status-pill";

export const BookingsPage = () => (
  <Page
    title="Prenotazioni"
    actions={<Button variant="secondary">Nuovo slot</Button>}
  >
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Regole prenotazioni</h3>
          <p className="text-sm text-muted">
            Cancellazione 24h prima · Anticipo massimo personalizzabile
          </p>
        </div>
        <StatusPill label="Slot fissi" tone="info" />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          "Campo Beach 1",
          "Campo Beach 2",
          "Campo Beach 3"
        ].map((field) => (
          <div
            key={field}
            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
          >
            <p className="text-sm text-muted">{field}</p>
            <p className="mt-2 text-lg font-semibold">Slot disponibili: 4</p>
          </div>
        ))}
      </div>
    </Card>
  </Page>
);
