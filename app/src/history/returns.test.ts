import { describe, expect, it } from "vitest";

import {
  geometricMean,
  realReturn,
  realReturnsForMix,
  rebaseReturns,
  US_HISTORY_FIRST_YEAR,
  US_HISTORY_LAST_YEAR,
} from "./returns";
import { US_MARKET_HISTORY_ROWS } from "./usMarketHistory";

const byYear = (stockShare: number) =>
  new Map(realReturnsForMix(stockShare).map((entry) => [entry.year, entry.realReturn]));

describe("bundled US market history", () => {
  it("runs year by year without gaps from 1928", () => {
    expect(US_HISTORY_FIRST_YEAR).toBe(1928);
    US_MARKET_HISTORY_ROWS.forEach(([year], index) => {
      expect(year).toBe(US_HISTORY_FIRST_YEAR + index);
    });
    expect(US_HISTORY_LAST_YEAR).toBeGreaterThanOrEqual(2025);
  });

  it("keeps every figure a plausible percentage", () => {
    for (const [, stocks, bonds, inflation] of US_MARKET_HISTORY_ROWS) {
      expect(stocks).toBeGreaterThan(-60);
      expect(stocks).toBeLessThan(60);
      expect(bonds).toBeGreaterThan(-25);
      expect(bonds).toBeLessThan(35);
      expect(inflation).toBeGreaterThan(-12);
      expect(inflation).toBeLessThan(20);
    }
  });
});

describe("realReturn", () => {
  it("divides out inflation instead of subtracting it", () => {
    expect(realReturn(10, 10)).toBeCloseTo(0, 12);
    expect(realReturn(-18.04, 6.45)).toBeCloseTo(0.8196 / 1.0645 - 1, 4);
    expect(realReturn(5, -5)).toBeGreaterThan(0.1);
  });
});

describe("realReturnsForMix", () => {
  it("gives one return for each year of data", () => {
    expect(realReturnsForMix(0.6)).toHaveLength(US_MARKET_HISTORY_ROWS.length);
  });

  it("is all stocks at 100% and all bonds at 0%", () => {
    expect(byYear(1).get(2008)).toBeCloseTo(realReturn(-36.55, 0.09), 12);
    expect(byYear(0).get(2008)).toBeCloseTo(realReturn(20.1, 0.09), 12);
    expect(byYear(0).get(2022)).toBeCloseTo(realReturn(-17.83, 6.45), 12);
  });

  it("blends the two returns in proportion", () => {
    const stocks = byYear(1).get(1974)!;
    const bonds = byYear(0).get(1974)!;
    expect(byYear(0.6).get(1974)).toBeCloseTo(0.6 * stocks + 0.4 * bonds, 12);
  });

  it("keeps the shares within 0 to 100%", () => {
    expect(byYear(1.5).get(1931)).toBeCloseTo(byYear(1).get(1931)!, 12);
    expect(byYear(-1).get(1931)).toBeCloseTo(byYear(0).get(1931)!, 12);
  });

  it("has the famous bad years in it", () => {
    expect(byYear(1).get(1931)!).toBeLessThan(-0.35);
    expect(byYear(1).get(1974)!).toBeLessThan(-0.3);
    expect(byYear(0.6).get(2022)!).toBeLessThan(-0.15);
  });
});

describe("geometricMean", () => {
  it("is the constant return with the same total growth", () => {
    expect(geometricMean([0.1, 0.1, 0.1])).toBeCloseTo(0.1, 12);
    expect(geometricMean([0.5, -0.5])).toBeCloseTo(Math.sqrt(0.75) - 1, 12);
  });

  it("is zero for no data", () => {
    expect(geometricMean([])).toBe(0);
  });

  it("is lower than the plain average when returns vary", () => {
    const returns = [0.3, -0.2, 0.1, 0.05];
    const plain = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    expect(geometricMean(returns)).toBeLessThan(plain);
  });
});

describe("rebaseReturns", () => {
  const history = realReturnsForMix(0.6).map((entry) => entry.realReturn);

  it("hits the requested geometric mean", () => {
    expect(geometricMean(rebaseReturns(history, 0.034))).toBeCloseTo(0.034, 10);
    expect(geometricMean(rebaseReturns(history, 0))).toBeCloseTo(0, 10);
  });

  it("leaves a series that already has the target unchanged", () => {
    const rebased = rebaseReturns(history, geometricMean(history));
    rebased.forEach((value, index) => expect(value).toBeCloseTo(history[index], 12));
  });

  it("keeps the order of good and bad years", () => {
    const rebased = rebaseReturns(history, 0.02);
    const worst = history.indexOf(Math.min(...history));
    expect(rebased.indexOf(Math.min(...rebased))).toBe(worst);
  });
});
