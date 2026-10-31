import type { CpiPoint } from "./format";

/** The spans of the average inflation shown. Older history is dominated by the 1980s and misleads. */
export const CPI_AVERAGE_YEARS = [10, 20, 30] as const;

export interface CpiSummary {
  /** The newest month, with its change over the 12 months before it. */
  latest: CpiPoint;
  /** Average yearly inflation over the last N years, ending at the latest month. Omits spans the history does not cover. */
  averages: { years: number; pct: number }[];
}

const monthIndex = (point: { year: number; month: number }) => point.year * 12 + point.month;

/**
 * The latest 12-month inflation and the averages over the last 10, 20 and 30 years. An average
 * chains the 12-month changes at 12-month steps back from the latest month, so it is the compound
 * yearly rate over exactly those years. Null without any point.
 */
export function summarizeCpi(points: readonly CpiPoint[]): CpiSummary | null {
  if (points.length === 0) return null;
  const changes = new Map(points.map((point) => [monthIndex(point), point.yearOverYearPct]));
  const latest = points.reduce((a, b) => (monthIndex(b) > monthIndex(a) ? b : a));
  const latestIndex = monthIndex(latest);

  const averages: CpiSummary["averages"] = [];
  for (const years of CPI_AVERAGE_YEARS) {
    let growth = 1;
    let complete = true;
    for (let step = 0; step < years; step++) {
      const change = changes.get(latestIndex - 12 * step);
      if (change === undefined || change <= -100) {
        complete = false;
        break;
      }
      growth *= 1 + change / 100;
    }
    if (complete) averages.push({ years, pct: (growth ** (1 / years) - 1) * 100 });
  }
  return { latest, averages };
}
