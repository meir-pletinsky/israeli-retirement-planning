import { describe, expect, it, vi } from "vitest";

import { PRICE_BASIS, type StockHistoryFile } from "../../src/stockPrices/format.ts";
import type { DatasetOutput } from "./build.ts";
import { attachSplits, parseYahooSplits, yahooSymbol } from "./splits.ts";

function outputOf(...symbols: string[]): DatasetOutput {
  const files = new Map<string, StockHistoryFile>();
  for (const symbol of symbols) {
    files.set(`${symbol}.json`, {
      symbol,
      name: symbol,
      asOf: "2026-01-02",
      priceBasis: PRICE_BASIS,
      dates: ["2026-01-02"],
      close: [10],
    });
  }
  return { index: { generatedAtUtc: "", source: "", symbols: [] }, files };
}

const GOOGL_BODY = {
  chart: {
    result: [
      {
        events: {
          splits: {
            "1656648000": { date: 1658151000, numerator: 20, denominator: 1 },
            "1396324800": { date: 1396531800, numerator: 1998, denominator: 1000 },
          },
        },
      },
    ],
  },
};

const NO_SPLITS_BODY = { chart: { result: [{ meta: {} }] } };

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("parseYahooSplits", () => {
  it("reads the split dates and ratios, oldest first", () => {
    expect(parseYahooSplits(GOOGL_BODY)).toEqual([
      { date: "2014-04-03", ratio: 1.998 },
      { date: "2022-07-18", ratio: 20 },
    ]);
  });

  it("reads a reverse split as a ratio below 1", () => {
    const body = { chart: { result: [{ events: { splits: { a: { date: 1577977800, numerator: 1, denominator: 10 } } } }] } };
    expect(parseYahooSplits(body)).toEqual([{ date: "2020-01-02", ratio: 0.1 }]);
  });

  it("returns an empty list when the stock never split, and null without a chart", () => {
    expect(parseYahooSplits(NO_SPLITS_BODY)).toEqual([]);
    expect(parseYahooSplits({ chart: { result: null, error: { code: "Not Found" } } })).toBeNull();
    expect(parseYahooSplits("<html>")).toBeNull();
  });
});

describe("yahooSymbol", () => {
  it("writes share classes with a dash", () => {
    expect(yahooSymbol("BRK.B")).toBe("BRK-B");
    expect(yahooSymbol("AAPL")).toBe("AAPL");
  });
});

describe("attachSplits", () => {
  it("adds the split list to each file", async () => {
    const output = outputOf("GOOGL", "KO");
    const fetchImpl = vi.fn(async (url: string) => respond(url.includes("/GOOGL?") ? GOOGL_BODY : NO_SPLITS_BODY));
    await attachSplits(output, { fetch: fetchImpl, retryDelayMs: 0 });

    expect(output.files.get("GOOGL.json")?.splits).toHaveLength(2);
    expect(output.files.get("KO.json")?.splits).toEqual([]);
  });

  it("leaves the splits of a symbol that cannot be fetched unknown", async () => {
    const output = outputOf("A", "B", "C", "D", "E", "F");
    const fetchImpl = async (url: string) => (url.includes("/F?") ? respond({}, 404) : respond(NO_SPLITS_BODY));
    await attachSplits(output, { fetch: fetchImpl, retryDelayMs: 0 });

    expect(output.files.get("F.json")?.splits).toBeUndefined();
    expect(output.files.get("A.json")?.splits).toEqual([]);
  });

  it("retries a throttled request", async () => {
    const output = outputOf("A");
    const fetchImpl = vi.fn().mockResolvedValueOnce(respond({}, 429)).mockResolvedValue(respond(GOOGL_BODY));
    await attachSplits(output, { fetch: fetchImpl, retryDelayMs: 0 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(output.files.get("A.json")?.splits).toHaveLength(2);
  });

  it("gives up when too many symbols fail", async () => {
    const output = outputOf("A", "B");
    const fetchImpl = async () => respond({}, 404);
    await expect(attachSplits(output, { fetch: fetchImpl, retryDelayMs: 0 })).rejects.toThrow(
      "could not be fetched for 2 of 2",
    );
  });
});
