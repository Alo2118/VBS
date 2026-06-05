import { describe, expect, it } from "vitest";
import { formatEur, parseAmount } from "./money";

describe("formatEur", () => {
  it("usa la virgola decimale e il simbolo €", () => {
    expect(formatEur(16)).toMatch(/16,00/);
    expect(formatEur(16)).toContain("€");
  });

  it("formatta gli zero", () => {
    expect(formatEur(0)).toMatch(/0,00/);
  });
});

describe("parseAmount", () => {
  it("accetta la virgola come separatore decimale", () => {
    expect(parseAmount("12,50")).toBe(12.5);
  });

  it("accetta anche il punto", () => {
    expect(parseAmount("8.00")).toBe(8);
  });

  it("restituisce NaN per input non numerici", () => {
    expect(Number.isNaN(parseAmount("abc"))).toBe(true);
  });
});
