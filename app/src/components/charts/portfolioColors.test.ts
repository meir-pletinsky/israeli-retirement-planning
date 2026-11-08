import { describe, expect, it } from "vitest";

import { BACKTEST_COLOURS } from "./backtestColours";
import { CHART_COLORS } from "./chartPalette";
import { INCOME_BAND_COLORS, bandFill } from "./incomeBandColors";
import { PORTFOLIO_KIND_COLORS, necessityFill } from "./portfolioColors";

const channel = (hex: string, start: number) => {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const contrastAgainstWhite = (hex: string) =>
  1.05 / (0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5) + 0.05);

describe("portfolio kind colours", () => {
  it("gives every kind of asset its own colour", () => {
    const colours = Object.values(PORTFOLIO_KIND_COLORS);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it("keeps each colour at least 3:1 against white", () => {
    for (const colour of [...Object.values(PORTFOLIO_KIND_COLORS), ...Object.values(INCOME_BAND_COLORS), ...Object.values(CHART_COLORS)]) {
      expect(contrastAgainstWhite(colour)).toBeGreaterThanOrEqual(3);
    }
  });

  describe("income band swatches", () => {
    it("uses the same 55% tint and stripe width as the withdrawal chart", () => {
      expect(bandFill("pensionFund", false)).toEqual({ backgroundColor: INCOME_BAND_COLORS.pensionFund });
      expect(bandFill("pensionFund", true).backgroundImage).toContain("55%, white");
      expect(bandFill("pensionFund", true).backgroundImage).toContain("2.5px 8px");
    });
  });

  it("keeps the colours reserved for a shortfall out of the assets", () => {
    const reds = [CHART_COLORS.shortfall, BACKTEST_COLOURS.short, BACKTEST_COLOURS.worst];
    for (const colour of Object.values(PORTFOLIO_KIND_COLORS)) expect(reds).not.toContain(colour);
  });
});

describe("necessityFill", () => {
  it("draws essential spending solid and discretionary spending hatched", () => {
    expect(necessityFill("essential")).toHaveProperty("backgroundColor");
    expect(necessityFill("discretionary")).toHaveProperty("backgroundImage");
  });
});
