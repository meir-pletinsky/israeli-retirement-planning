import { isStockSplit, type StockSplit } from "../../src/stockPrices/format.ts";
import type { DatasetOutput } from "./build.ts";

// Split events come from Yahoo Finance's public chart endpoint. It is not an official API, so
// fetching is best effort: a symbol that cannot be fetched is published without splits (unknown),
// and the whole refresh only fails when too many symbols could not be fetched.

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Yahoo writes share classes with a dash (BRK-B), the price files with a dot (BRK.B). */
export function yahooSymbol(symbol: string): string {
  return symbol.replace(/\./g, "-");
}

interface YahooSplitEvent {
  date?: unknown;
  numerator?: unknown;
  denominator?: unknown;
}

/** The splits in a Yahoo chart response, oldest first; null when the response has no chart. */
export function parseYahooSplits(body: unknown): StockSplit[] | null {
  const result = (body as { chart?: { result?: unknown[] | null } })?.chart?.result?.[0] as
    | { events?: { splits?: Record<string, YahooSplitEvent> } }
    | undefined;
  if (!result) return null;

  const splits: StockSplit[] = [];
  for (const event of Object.values(result.events?.splits ?? {})) {
    const { date, numerator, denominator } = event;
    if (typeof date !== "number" || typeof numerator !== "number" || typeof denominator !== "number") continue;
    if (!(numerator > 0) || !(denominator > 0)) continue;
    const split = {
      date: new Date(date * 1000).toISOString().slice(0, 10),
      ratio: Math.round((numerator / denominator) * 1_000_000) / 1_000_000,
    };
    if (isStockSplit(split) && split.ratio !== 1) splits.push(split);
  }
  return splits.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

async function fetchSymbolSplits(symbol: string, fetchImpl: Fetch, retryDelayMs: number): Promise<StockSplit[] | null> {
  const url = `${CHART_URL}/${encodeURIComponent(yahooSymbol(symbol))}?range=max&interval=3mo&events=split`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (response.ok) return parseYahooSplits(await response.json());
      if (response.status !== 429 && response.status < 500) return null;
    } catch {
      // Network error: try again.
    }
    if (attempt < 3) await new Promise((done) => setTimeout(done, attempt * retryDelayMs));
  }
  return null;
}

export interface AttachSplitsOptions {
  fetch?: Fetch;
  concurrency?: number;
  /** Share of symbols that may fail before the refresh is given up. */
  maxFailureShare?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

/** Adds the split list to every price file in `output`. */
export async function attachSplits(output: DatasetOutput, options: AttachSplitsOptions = {}): Promise<void> {
  const {
    fetch: fetchImpl = fetch,
    concurrency = 8,
    maxFailureShare = 0.2,
    retryDelayMs = 1000,
    log = () => {},
  } = options;
  const files = [...output.files.values()];
  let next = 0;
  let failed = 0;
  let withSplits = 0;

  async function worker(): Promise<void> {
    while (next < files.length) {
      const file = files[next++];
      const splits = await fetchSymbolSplits(file.symbol, fetchImpl, retryDelayMs);
      if (splits === null) {
        failed += 1;
        continue;
      }
      file.splits = splits;
      if (splits.length > 0) withSplits += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  if (files.length > 0 && failed / files.length > maxFailureShare) {
    throw new Error(`Split history could not be fetched for ${failed} of ${files.length} symbols.`);
  }
  log(`Split history: ${withSplits} symbols have splits, ${failed} could not be fetched.`);
}
