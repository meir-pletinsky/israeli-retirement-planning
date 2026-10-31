import { describe, expect, it } from "vitest";

import { CPI_BUILT_IN_POINTS, CPI_BUILT_IN_SUMMARY } from "./builtIn";
import { CPI_BUILT_IN_DECEMBER_CHANGES, CPI_BUILT_IN_RETRIEVED_ON } from "./snapshot";

const changeOf = (year: number) => CPI_BUILT_IN_DECEMBER_CHANGES.find(([y]) => y === year)?.[1];

describe("the built-in inflation table", () => {
  it("has every year from 1952 to 2025 once, oldest first", () => {
    const years = CPI_BUILT_IN_DECEMBER_CHANGES.map(([year]) => year);
    expect(years[0]).toBe(1952);
    expect(years[years.length - 1]).toBeGreaterThanOrEqual(2025);
    years.forEach((year, index) => expect(year).toBe(1952 + index));
  });

  it("matches the figures the Central Bureau of Statistics published", () => {
    expect(changeOf(1952)).toBe(66.4);
    expect(changeOf(1984)).toBe(444.9);
    expect(changeOf(2000)).toBe(0);
    expect(changeOf(2003)).toBe(-1.9);
    expect(changeOf(2020)).toBe(-0.7);
    expect(changeOf(2021)).toBe(2.8);
    expect(changeOf(2022)).toBe(5.3);
    expect(changeOf(2023)).toBe(3);
    expect(changeOf(2024)).toBe(3.2);
    expect(changeOf(2025)).toBe(2.6);
  });

  it("says when it was taken", () => {
    expect(CPI_BUILT_IN_RETRIEVED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has one December point per year", () => {
    expect(CPI_BUILT_IN_POINTS).toHaveLength(CPI_BUILT_IN_DECEMBER_CHANGES.length);
    expect(CPI_BUILT_IN_POINTS.every((point) => point.month === 12)).toBe(true);
  });

  it("gives a latest figure and the 10, 20 and 30 year averages", () => {
    const { latest, averages } = CPI_BUILT_IN_SUMMARY;
    expect(latest).toEqual({ year: 2025, month: 12, yearOverYearPct: 2.6 });
    expect(averages.map((average) => average.years)).toEqual([10, 20, 30]);
    for (const { pct } of averages) {
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThan(5);
    }
  });
});
