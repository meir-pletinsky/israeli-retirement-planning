import { describe, expect, it } from "vitest";

import { ASSUMPTION_PRESETS, EMPTY_PROFILE, type Assumptions } from "../types";
import { matchingPreset } from "./profileBasics";

const base: Assumptions = EMPTY_PROFILE.assumptions;

describe("matchingPreset", () => {
  it.each(["conservative", "base", "optimistic"] as const)("recognises the %s values", (preset) => {
    expect(matchingPreset({ ...base, preset: "base", ...ASSUMPTION_PRESETS[preset] })).toBe(preset);
  });

  it("goes by the values, not by the preset that was last picked", () => {
    expect(matchingPreset({ ...base, preset: "base", ...ASSUMPTION_PRESETS.optimistic })).toBe("optimistic");
  });

  it("is custom once either the return or the inflation differs", () => {
    expect(matchingPreset({ ...base, investmentReturnPct: 9 })).toBe("custom");
    expect(matchingPreset({ ...base, inflationPct: 3 })).toBe("custom");
  });

  it("is custom for a pair that mixes two presets", () => {
    expect(
      matchingPreset({
        ...base,
        investmentReturnPct: ASSUMPTION_PRESETS.conservative.investmentReturnPct,
        inflationPct: ASSUMPTION_PRESETS.optimistic.inflationPct,
      }),
    ).toBe("custom");
  });

  it("ignores volatility, which no preset sets", () => {
    expect(matchingPreset({ ...base, volatilityPct: 25 })).toBe("base");
  });
});
