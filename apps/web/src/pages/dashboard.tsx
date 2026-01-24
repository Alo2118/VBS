import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { StatusPill } from "@/shared/ui/status-pill";

export const DashboardPage = () => (
  <Page
    title="Dashboard"
    actions={<Button>Nuova prenotazione</Button>}
  >
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <p className="text-sm text-muted">Campi disponibili oggi</p>
        <p className="mt-3 text-3xl font-semibold">12</p>
        <StatusPill label="Aggiornato 5 min fa" tone="info" />
      </Card>
      <Card>
        <p className="text-sm text-muted">Prenotazioni in corso</p>
        <p className="mt-3 text-3xl font-semibold">8</p>
        <StatusPill label="Nessuna criticità" tone="success" />
      </Card>
      <Card>
        <p className="text-sm text-muted">Incassi bar (oggi)</p>
        <p className="mt-3 text-3xl font-semibold">€ 324</p>
        <StatusPill label="+12% vs ieri" tone="warning" />
      </Card>
    </div>
    <Card>
      <h3 className="text-lg font-semibold">Focus operativo</h3>
      <p className="mt-2 text-sm text-muted">
        Configura i giorni di anticipo massimo e la durata degli slot per i
        campi beach. Gestisci le tessere manualmente e attiva le notifiche per
        conferme e cancellazioni.
      </p>
    </Card>
  </Page>
);
