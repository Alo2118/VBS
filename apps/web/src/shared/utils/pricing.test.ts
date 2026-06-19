import { describe, expect, it } from "vitest";
import { perPlayerShare, totalCost } from "./pricing";

const base = { courtPrice: 10, perHeadPrice: 3, threshold: 8 };

describe("perPlayerShare", () => {
  it("entro la soglia divide il prezzo del campo tra i presenti", () => {
    expect(perPlayerShare({ ...base, players: 4 })).toBeCloseTo(2.5);
    expect(perPlayerShare({ ...base, players: 5 })).toBeCloseTo(2);
    expect(perPlayerShare({ ...base, players: 8 })).toBeCloseTo(1.25);
  });

  it("oltre la soglia applica la quota fissa a testa", () => {
    expect(perPlayerShare({ ...base, players: 9 })).toBe(3);
    expect(perPlayerShare({ ...base, players: 12 })).toBe(3);
  });
});

describe("totalCost", () => {
  it("è il prezzo del campo entro la soglia", () => {
    expect(totalCost({ ...base, players: 6 })).toBe(10);
    expect(totalCost({ ...base, players: 8 })).toBe(10);
  });

  it("oltre la soglia è quota a testa × giocatori", () => {
    expect(totalCost({ ...base, players: 9 })).toBe(27);
    expect(totalCost({ ...base, players: 10 })).toBe(30);
  });
});
