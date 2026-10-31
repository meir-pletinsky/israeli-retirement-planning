import { describe, expect, it } from "vitest";

import { steadyMonths } from "../test/cpiFixtures";
import type { CpiPoint } from "./format";
import { summarizeCpi } from "./stats";

const averageOf = (points: CpiPoint[], years: number) =>
  summarizeCpi(points)?.averages.find((average) => average.years === years)?.pct;

describe("summarizeCpi", () => {
  it("gives null without any month", () => {
    expect(summarizeCpi([])).toBeNull();
  });

  it("takes the newest month as the latest, whatever the order", () => {
    const points = steadyMonths({ year: 2024, month: 1 }, { year: 2026, month: 9 }, 2);
    const latest = { year: 2026, month: 9, yearOverYearPct: 1.6 };
    points[points.length - 1] = latest;
    expect(summarizeCpi(points)?.latest).toEqual(latest);
    expect(summarizeCpi([...points].reverse())?.latest).toEqual(latest);
  });

  it("averages to the same rate when inflation never changes", () => {
    const points = steadyMonths({ year: 1990, month: 1 }, { year: 2026, month: 9 }, 3);
    const { averages } = summarizeCpi(points)!;
    expect(averages.map((average) => average.years)).toEqual([10, 20, 30]);
    for (const { pct } of averages) expect(pct).toBeCloseTo(3, 10);
  });

  it("compounds the yearly changes instead of adding them up", () => {
    // Five years at 2% then five at 4%, counting back from September 2026.
    const points: CpiPoint[] = [];
    for (let step = 0; step < 10; step++) {
      points.push({ year: 2026 - step, month: 9, yearOverYearPct: step < 5 ? 4 : 2 });
    }
    expect(averageOf(points, 10)).toBeCloseTo((1.04 ** 5 * 1.02 ** 5) ** (1 / 10) * 100 - 100, 10);
  });

  it("reads only the months that are a whole number of years before the latest", () => {
    const points = steadyMonths({ year: 2010, month: 1 }, { year: 2026, month: 9 }, 2);
    const aprilOff = points.map((point) => (point.month === 4 ? { ...point, yearOverYearPct: 50 } : point));
    expect(averageOf(aprilOff, 10)).toBeCloseTo(2, 10);
  });

  it("leaves out the spans that the history does not cover", () => {
    const points = steadyMonths({ year: 2010, month: 9 }, { year: 2026, month: 9 }, 2);
    expect(summarizeCpi(points)?.averages.map((average) => average.years)).toEqual([10]);
    expect(summarizeCpi(steadyMonths({ year: 2026, month: 1 }, { year: 2026, month: 9 }, 2))?.averages).toEqual([]);
  });

  it("leaves out a span that has a missing month, and keeps the shorter ones", () => {
    const points = steadyMonths({ year: 1990, month: 1 }, { year: 2026, month: 9 }, 2).filter(
      (point) => !(point.year === 2011 && point.month === 9),
    );
    expect(summarizeCpi(points)?.averages.map((average) => average.years)).toEqual([10]);
  });

  it("leaves out a span with a fall of 100% or more, which has no yearly rate", () => {
    const points = steadyMonths({ year: 1990, month: 1 }, { year: 2026, month: 9 }, 2).map((point) =>
      point.year === 2010 && point.month === 9 ? { ...point, yearOverYearPct: -100 } : point,
    );
    expect(summarizeCpi(points)?.averages.map((average) => average.years)).toEqual([10]);
  });

  it("works from one month per year, like the built-in table", () => {
    const decembers: CpiPoint[] = [];
    for (let year = 1990; year <= 2025; year++) decembers.push({ year, month: 12, yearOverYearPct: 3 });
    const summary = summarizeCpi(decembers)!;
    expect(summary.latest).toEqual({ year: 2025, month: 12, yearOverYearPct: 3 });
    expect(summary.averages).toHaveLength(3);
  });
});
