import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Page } from "@/shared/ui/page";
import { StatusPill } from "@/shared/ui/status-pill";

export const MembersPage = () => (
  <Page title="Membri" actions={<Button>Nuovo membro</Button>}>
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Tesseramento AICS</h3>
          <p className="text-sm text-muted">
            Inserimento manuale con stati VALID, EXPIRED, SUSPENDED.
          </p>
        </div>
        <StatusPill label="Controlli backend" tone="success" />
      </div>
    </Card>
  </Page>
);
