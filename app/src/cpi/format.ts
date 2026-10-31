/**
 * Israel's Consumer Price Index (the general index), published monthly by the Central Bureau of
 * Statistics (CBS). Its API (https://api.cbs.gov.il) needs no key and allows requests from a web page.
 */

export const CPI_SERIES_ID = 120010;

const API_URL = "https://api.cbs.gov.il/index/data/price";

/** The index's change over the 12 months that end in this month. */
export interface CpiPoint {
  year: number;
  /** 1 to 12. */
  month: number;
  yearOverYearPct: number;
}

/** The request for every month from January of `startYear`. Only the series number and a year are sent. */
export function cpiUrl(startYear: number): string {
  // The service pages its answer at 100 months unless asked for more.
  return `${API_URL}?id=${CPI_SERIES_ID}&format=json&download=false&lang=en&startPeriod=01-${startYear}&PageSize=1000`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMonth(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12;
}

/**
 * Reads a CBS answer into 12-month changes, oldest first. Null when it is anything else. The first
 * year of the series has no 12-month change, so those months are left out.
 */
export function parseCpiResponse(value: unknown): CpiPoint[] | null {
  if (!isRecord(value) || !Array.isArray(value.month)) return null;
  const series = value.month.find((entry) => isRecord(entry) && entry.code === CPI_SERIES_ID);
  if (!isRecord(series) || !Array.isArray(series.date)) return null;

  const points: CpiPoint[] = [];
  for (const entry of series.date) {
    if (!isRecord(entry)) return null;
    const { year, month, percentYear } = entry;
    if (typeof year !== "number" || !Number.isInteger(year) || !isMonth(month)) return null;
    if (percentYear === null) continue;
    if (typeof percentYear !== "number" || !Number.isFinite(percentYear)) return null;
    points.push({ year, month, yearOverYearPct: percentYear });
  }
  if (points.length === 0) return null;
  return points.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
}
