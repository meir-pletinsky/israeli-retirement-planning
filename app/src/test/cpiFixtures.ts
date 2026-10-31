import { CPI_SERIES_ID, type CpiPoint } from "../cpi/format";

/** Every month from `from` to `to` (inclusive) with the same 12-month change. */
export function steadyMonths(
  from: { year: number; month: number },
  to: { year: number; month: number },
  yearOverYearPct: number,
): CpiPoint[] {
  const points: CpiPoint[] = [];
  for (let index = from.year * 12 + from.month - 1; index <= to.year * 12 + to.month - 1; index++) {
    points.push({ year: Math.floor(index / 12), month: (index % 12) + 1, yearOverYearPct });
  }
  return points;
}

/** The shape of the Central Bureau of Statistics' answer for the general index: newest month first. */
export function cbsAnswer(points: readonly CpiPoint[], extraSeries: unknown[] = []) {
  const date = [...points]
    .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))
    .map(({ year, month, yearOverYearPct }) => ({
      year,
      month,
      monthDesc: "month",
      percent: 0.1,
      percentYear: yearOverYearPct,
      currBase: { baseDesc: "Average 2024 prices", value: 100.5 },
      prevBase: { baseDesc: "Average 2022 prices", value: 99.9 },
    }));
  return {
    month: [...extraSeries, { code: CPI_SERIES_ID, name: "Consumer Price Index - General", date }],
    quarter: [],
    paging: { total_items: date.length, page_size: 1000, current_page: 1, last_page: 1 },
  };
}
