import { isIsoDate, parseRateResponse, rateUrl, type UsdIlsRate } from "./format";

/**
 * Asks Frankfurter for the Bank of Israel's dollar rate. Every failure (offline, a date the service
 * has no rate for, an unexpected answer) gives `null`: rates are a convenience, and the app works
 * with the rate the user types or the built-in one.
 */

const TIMEOUT_MS = 10_000;

/** How often the latest rate is asked for again while the app is open. */
export const LATEST_RATE_REFRESH_MS = 60 * 60 * 1000;
// A little under the refresh period, so a check that comes slightly early still asks again.
const LATEST_RATE_MAX_AGE_MS = LATEST_RATE_REFRESH_MS - 60_000;

// A successful answer for a date is kept for the session, since it never changes. The latest rate
// is kept for an hour. A failed answer is tried again the next time.
const requests = new Map<string, { request: Promise<UsdIlsRate | null>; askedAt: number }>();

async function fetchRate(date?: string): Promise<UsdIlsRate | null> {
  try {
    const response = await fetch(rateUrl(date), {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseRateResponse(await response.json());
  } catch {
    return null;
  }
}

/** The rate on `date` (the last business day on or before it), or the latest rate without a date. */
export function loadUsdIlsRate(date?: string): Promise<UsdIlsRate | null> {
  if (date !== undefined && !isIsoDate(date)) return Promise.resolve(null);
  const key = date ?? "latest";
  const kept = requests.get(key);
  if (kept && (date !== undefined || Date.now() - kept.askedAt < LATEST_RATE_MAX_AGE_MS)) {
    return kept.request;
  }
  const request = fetchRate(date);
  requests.set(key, { request, askedAt: Date.now() });
  void request.then((result) => {
    if (!result && requests.get(key)?.request === request) requests.delete(key);
  });
  return request;
}

/** For tests: forget every answer so far. */
export function resetFxCache(): void {
  requests.clear();
}
