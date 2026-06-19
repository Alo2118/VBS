import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { StatusPill } from "@/shared/ui/status-pill";

export const WalletPage = () => (
  <Page title="Wallet" actions={<Button>Ricarica contanti</Button>}>
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Ledger immutabile</h3>
          <p className="text-sm text-muted">
            Gestione anticipi in contanti con movimenti TOP_UP e PURCHASE.
          </p>
        </div>
        <StatusPill label="Saldo calcolato" tone="info" />
      </div>
    </Card>
  </Page>
);
