import { isIsoDate, parseRateResponse, rateUrl, type UsdIlsRate } from "./format";

/**
 * Asks Frankfurter for the Bank of Israel's dollar rate. Every failure (offline, a date the service
 * has no rate for, an unexpected answer) gives `null`: rates are a convenience, and the app works
 * with the rate the user types or the built-in one.
 */

const TIMEOUT_MS = 10_000;

// Successful answers are kept for the session; a failed one is tried again the next time.
const requests = new Map<string, Promise<UsdIlsRate | null>>();

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
  let request = requests.get(key);
  if (!request) {
    const created = fetchRate(date);
    request = created;
    requests.set(key, created);
    void created.then((result) => {
      if (!result && requests.get(key) === created) requests.delete(key);
    });
  }
  return request;
}

/** For tests: forget every answer so far. */
export function resetFxCache(): void {
  requests.clear();
}
