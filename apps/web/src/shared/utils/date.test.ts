import { describe, expect, it } from "vitest";
import { addDays, formatTime, isSameDay, toIsoDate } from "./date";

describe("toIsoDate", () => {
  it("formatta come YYYY-MM-DD con zero padding", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("addDays", () => {
  it("aggiunge e sottrae giorni senza mutare l'originale", () => {
    const base = new Date(2026, 5, 8);
    expect(toIsoDate(addDays(base, 1))).toBe("2026-06-09");
    expect(toIsoDate(addDays(base, -1))).toBe("2026-06-07");
    expect(toIsoDate(base)).toBe("2026-06-08"); // immutato
  });

  it("attraversa correttamente i confini di mese", () => {
    expect(toIsoDate(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01");
  });
});

describe("isSameDay", () => {
  it("confronta solo la parte data", () => {
    expect(isSameDay(new Date(2026, 5, 8, 9), new Date(2026, 5, 8, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 5, 8), new Date(2026, 5, 9))).toBe(false);
  });
});

describe("formatTime", () => {
  it("converte un ISO UTC nell'ora locale Europe/Rome (ora legale +2)", () => {
    expect(formatTime("2026-06-08T16:00:00Z")).toBe("18:00");
  });
});
