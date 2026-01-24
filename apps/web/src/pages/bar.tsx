import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";

export const BarPage = () => (
  <Page title="Bar" actions={<Button>Nuova vendita</Button>}>
    <Card>
      <h3 className="text-lg font-semibold">Vendite rapide</h3>
      <p className="mt-2 text-sm text-muted">
        Nessuna gestione magazzino: registra solo le vendite e le modalità di
        pagamento.
      </p>
    </Card>
  </Page>
);
