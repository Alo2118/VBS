import { describe, expect, it } from "vitest";
import { businessErrorFromMessage } from "./errors";

describe("businessErrorFromMessage", () => {
  it("mappa i codici noti su messaggi leggibili", () => {
    const err = businessErrorFromMessage("SLOT_TAKEN");
    expect(err.code).toBe("SLOT_TAKEN");
    expect(err.message).toMatch(/già stato prenotato|altro socio/i);
  });

  it("ignora gli spazi attorno al codice", () => {
    expect(businessErrorFromMessage("  MEMBERSHIP_NOT_VALID  ").code).toBe(
      "MEMBERSHIP_NOT_VALID"
    );
  });

  it("usa un messaggio generico per i codici sconosciuti", () => {
    const err = businessErrorFromMessage("qualcosa di strano");
    expect(err.code).toBe("UNKNOWN");
    expect(err.message).toMatch(/errore/i);
  });

  it("gestisce messaggio nullo/assente", () => {
    expect(businessErrorFromMessage(null).code).toBe("UNKNOWN");
    expect(businessErrorFromMessage(undefined).code).toBe("UNKNOWN");
  });
});
