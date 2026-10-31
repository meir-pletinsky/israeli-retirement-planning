import { cpiUrl, parseCpiResponse, type CpiPoint } from "./format";

/**
 * Asks the Central Bureau of Statistics for the consumer price index. Every failure (offline, a
 * timeout, an unexpected answer) gives `null`: the figures are for reference, and the app falls
 * back to its built-in table.
 */

const TIMEOUT_MS = 10_000;

// The 30-year average needs the 12-month change of 30 Decembers back, so ask for a year more.
const HISTORY_YEARS = 31;

// The index comes out once a month, so a session does not need to ask more than a few times a day.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

let kept: { request: Promise<CpiPoint[] | null>; askedAt: number } | null = null;

async function fetchCpi(): Promise<CpiPoint[] | null> {
  try {
    const response = await fetch(cpiUrl(new Date().getFullYear() - HISTORY_YEARS), {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseCpiResponse(await response.json());
  } catch {
    return null;
  }
}

/** The monthly 12-month changes, kept for a few hours; a failed answer is tried again the next time. */
export function loadIsraelCpi(): Promise<CpiPoint[] | null> {
  if (kept && Date.now() - kept.askedAt < MAX_AGE_MS) return kept.request;
  const request = fetchCpi();
  const entry = { request, askedAt: Date.now() };
  kept = entry;
  void request.then((result) => {
    if (!result && kept === entry) kept = null;
  });
  return request;
}

/** For tests: forget the answer so far. */
export function resetCpiCache(): void {
  kept = null;
}
