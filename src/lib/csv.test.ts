import { describe, expect, it } from "vitest";
import { csvAmount, csvCell, toCsv } from "./csv";

describe("export CSV", () => {
  it("échappe les séparateurs, les guillemets et les retours à la ligne", () => {
    expect(csvCell("Ndjock; Paul")).toBe('"Ndjock; Paul"');
    expect(csvCell('Dit "le grand"')).toBe('"Dit ""le grand"""');
    expect(csvCell("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("neutralise les formules de tableur", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+237690000001")).toBe("'+237690000001");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe("-5");
  });

  it("écrit les montants avec la virgule décimale", () => {
    expect(csvAmount(150000, "XAF")).toBe("150000");
    expect(csvAmount(9990, "EUR")).toBe("99,90");
  });

  it("commence par la marque UTF-8 et sépare les lignes à la manière de Windows", () => {
    expect(toCsv(["A", "B"], [["é", 1]])).toBe("﻿A;B\r\né;1\r\n");
  });
});
