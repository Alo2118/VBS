import { describe, expect, it } from "vitest";
import { formatEur } from "./money";

describe("formatEur", () => {
  it("usa la virgola decimale e il simbolo €", () => {
    expect(formatEur(16)).toMatch(/16,00/);
    expect(formatEur(16)).toContain("€");
  });

  it("formatta gli zero", () => {
    expect(formatEur(0)).toMatch(/0,00/);
  });
});
