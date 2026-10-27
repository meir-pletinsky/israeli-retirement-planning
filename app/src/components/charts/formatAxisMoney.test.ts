import { describe, expect, it } from "vitest";

import { formatAxisMoney } from "./formatAxisMoney";

describe("formatAxisMoney", () => {
  it.each([
    [0, "₪0"],
    [950, "₪950"],
    [1_000, "₪1k"],
    [2_500, "₪2.5k"],
    [10_000, "₪10k"],
    [12_345, "₪12k"],
    [250_000, "₪250k"],
    [999_400, "₪999k"],
    [999_500, "₪1M"],
    [1_000_000, "₪1M"],
    [1_500_000, "₪1.5M"],
    [12_400_000, "₪12M"],
  ])("formats %d as %s", (value, expected) => {
    expect(formatAxisMoney(value, "₪")).toBe(expected);
  });

  it("keeps the sign of a negative amount", () => {
    expect(formatAxisMoney(-2_500, "₪")).toBe("-₪2.5k");
    expect(formatAxisMoney(-400, "₪")).toBe("-₪400");
  });
});
