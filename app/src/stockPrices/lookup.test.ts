import { describe, expect, it } from "vitest";
import {
  isStockHistoryFile,
  isStockIndexFile,
  normalizeSymbol,
  symbolFileName,
  type StockHistoryFile,
  type StockIndexFile,
} from "./format";
import { findSymbol, latestPrice, priceOnOrBefore } from "./lookup";

const history: StockHistoryFile = {
  symbol: "AAA",
  name: "Alpha Corp",
  asOf: "2024-01-12",
  priceBasis: "adjusted-close",
  dates: ["2024-01-02", "2024-01-03", "2024-01-05", "2024-01-12"],
  close: [10, 11, 12.5, 13],
};

describe("priceOnOrBefore", () => {
  it("returns the close of that day", () => {
    expect(priceOnOrBefore(history, "2024-01-03")).toEqual({ date: "2024-01-03", close: 11 });
  });

  it("uses the last trading day before a day with no price (weekend, holiday)", () => {
    expect(priceOnOrBefore(history, "2024-01-07")).toEqual({ date: "2024-01-05", close: 12.5 });
  });

  it("returns the newest price for a date after the history, within the gap limit", () => {
    expect(priceOnOrBefore(history, "2024-01-20")).toEqual({ date: "2024-01-12", close: 13 });
  });

  it("returns null before the first price", () => {
    expect(priceOnOrBefore(history, "2024-01-01")).toBeNull();
  });

  it("returns null when the history ended long before the date", () => {
    expect(priceOnOrBefore(history, "2024-03-01")).toBeNull();
  });

  it("returns null for a date that is not valid", () => {
    expect(priceOnOrBefore(history, "")).toBeNull();
    expect(priceOnOrBefore(history, "2024-1-3")).toBeNull();
    expect(priceOnOrBefore(history, "2024-13-45")).toBeNull();
  });

  it("returns null for an empty history", () => {
    expect(priceOnOrBefore({ ...history, dates: [], close: [] }, "2024-01-03")).toBeNull();
  });
});

describe("latestPrice", () => {
  it("returns the newest close", () => {
    expect(latestPrice(history)).toEqual({ date: "2024-01-12", close: 13 });
  });

  it("returns null for an empty history", () => {
    expect(latestPrice({ ...history, dates: [], close: [] })).toBeNull();
  });
});

describe("findSymbol", () => {
  const index: StockIndexFile = {
    generatedAtUtc: "2024-01-13T00:00:00.000Z",
    source: "test",
    symbols: [
      { symbol: "AAA", name: "Alpha Corp", firstDate: "2024-01-02", lastDate: "2024-01-12" },
      { symbol: "BRK-B", name: "Berkshire", firstDate: "2024-01-02", lastDate: "2024-01-12" },
    ],
  };

  it("finds a symbol whatever the case or spaces", () => {
    expect(findSymbol(index, " aaa ")?.name).toBe("Alpha Corp");
    expect(findSymbol(index, "brk-b")?.symbol).toBe("BRK-B");
  });

  it("returns undefined for an unknown or empty symbol", () => {
    expect(findSymbol(index, "ZZZ")).toBeUndefined();
    expect(findSymbol(index, "  ")).toBeUndefined();
  });
});

describe("format", () => {
  it("normalizes symbols and file names", () => {
    expect(normalizeSymbol(" brk-b ")).toBe("BRK-B");
    expect(symbolFileName("brk-b")).toBe("BRK-B.json");
    expect(symbolFileName("a/b..\\c")).toBe("A_B.._C.json");
  });

  it("accepts the files the job writes and rejects anything else", () => {
    expect(isStockHistoryFile(history)).toBe(true);
    expect(isStockHistoryFile({ ...history, close: [1] })).toBe(false);
    expect(isStockHistoryFile({ ...history, close: [10, 11, "x", 13] })).toBe(false);
    expect(isStockHistoryFile("<!doctype html>")).toBe(false);
    expect(isStockHistoryFile(null)).toBe(false);

    expect(isStockIndexFile({ symbols: [{ symbol: "AAA", name: "Alpha" }] })).toBe(true);
    expect(isStockIndexFile({ symbols: [{ symbol: "AAA" }] })).toBe(false);
    expect(isStockIndexFile({})).toBe(false);
  });
});
