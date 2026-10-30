/**
 * The US dollar to shekel rate published by the Bank of Israel, relayed by the free Frankfurter
 * service (https://frankfurter.dev), which needs no key and allows requests from a web page.
 */

export interface UsdIlsRate {
  /** The day the Bank of Israel published the rate: the last business day on or before the day asked for. */
  date: string;
  /** Shekels per US dollar. */
  rate: number;
}

const API_URL = "https://api.frankfurter.dev/v2/rate/usd/ils?providers=boi";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

/** The request for the rate on `date`, or for the latest rate when there is none. Only the pair and the date are sent. */
export function rateUrl(date?: string): string {
  return date ? `${API_URL}&date=${date}` : API_URL;
}

/** Reads a Frankfurter answer, `{ date, base, quote, rate }`; null when it is anything else. */
export function parseRateResponse(value: unknown): UsdIlsRate | null {
  if (typeof value !== "object" || value === null) return null;
  const { date, base, quote, rate } = value as Record<string, unknown>;
  if (base !== "USD" || quote !== "ILS" || !isIsoDate(date)) return null;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  return { date, rate };
}
