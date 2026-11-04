import { describe, expect, it } from "vitest";

import type { StockHistoryFile, StockSplit } from "./format";
import { isStockHistoryFile } from "./format";
import { adjustPriceForSplits, adjustQuantityForSplits, splitFactorSince } from "./splits";

function history(splits?: StockSplit[]): StockHistoryFile {
  return {
    symbol: "GOOGL",
    name: "Alphabet",
    asOf: "2026-01-02",
    priceBasis: "adjusted-close",
    dates: ["2026-01-02"],
    close: [150],
    ...(splits && { splits }),
  };
}

const GOOGL = history([
  { date: "2014-04-03", ratio: 1.998 },
  { date: "2022-07-18", ratio: 20 },
]);

describe("splitFactorSince", () => {
  it("multiplies the splits after the purchase date", () => {
    expect(splitFactorSince(GOOGL, "2021-06-01")).toBe(20);
    expect(splitFactorSince(GOOGL, "2010-01-04")).toBeCloseTo(39.96, 6);
  });

  it("does not count a split that happened before the purchase", () => {
    expect(splitFactorSince(GOOGL, "2023-01-03")).toBe(1);
  });

  it("treats a purchase on the split day as already at the new share count", () => {
    expect(splitFactorSince(GOOGL, "2022-07-18")).toBe(1);
    expect(splitFactorSince(GOOGL, "2022-07-17")).toBe(20);
  });

  it("handles a reverse split", () => {
    expect(splitFactorSince(history([{ date: "2020-01-02", ratio: 0.1 }]), "2019-01-01")).toBeCloseTo(0.1, 9);
  });

  it("is 1 when the stock never split, the splits are unknown or the date is missing", () => {
    expect(splitFactorSince(history([]), "2000-01-03")).toBe(1);
    expect(splitFactorSince(history(), "2000-01-03")).toBe(1);
    expect(splitFactorSince(undefined, "2000-01-03")).toBe(1);
    expect(splitFactorSince(GOOGL, null)).toBe(1);
  });
});

describe("adjusting a purchase", () => {
  it("restates shares and price in today's shares", () => {
    expect(adjustQuantityForSplits(10, 20)).toBe(200);
    expect(adjustPriceForSplits(2500, 20)).toBe(125);
    expect(adjustQuantityForSplits(14.979, 1.998 * 20)).toBe(598.56084);
  });
});

describe("isStockHistoryFile with splits", () => {
  it("accepts files with, and without, a split list", () => {
    expect(isStockHistoryFile(GOOGL)).toBe(true);
    expect(isStockHistoryFile(history())).toBe(true);
  });

  it("rejects a malformed split list", () => {
    expect(isStockHistoryFile({ ...GOOGL, splits: [{ date: "x", ratio: 2 }] })).toBe(false);
    expect(isStockHistoryFile({ ...GOOGL, splits: [{ date: "2020-01-01", ratio: 0 }] })).toBe(false);
    expect(isStockHistoryFile({ ...GOOGL, splits: "none" })).toBe(false);
  });
});
