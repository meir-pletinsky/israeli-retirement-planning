import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadStockHistory, loadStockIndex, resetStockPriceCache } from "./client";

const INDEX = { generatedAtUtc: "t", source: "s", symbols: [{ symbol: "AAA", name: "Alpha Corp" }] };
const HISTORY = {
  symbol: "AAA",
  name: "Alpha Corp",
  asOf: "2024-01-03",
  priceBasis: "adjusted-close",
  dates: ["2024-01-02", "2024-01-03"],
  close: [10, 11],
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetStockPriceCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadStockIndex", () => {
  it("loads the index from the app's stock-data folder and keeps it", async () => {
    fetchMock.mockImplementation(() => jsonResponse(INDEX));
    expect(await loadStockIndex()).toEqual(INDEX);
    expect(await loadStockIndex()).toEqual(INDEX);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/stock-data\/_index\.json$/);
  });

  it("gives null when the request fails, and tries again next time", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("offline")));
    expect(await loadStockIndex()).toBeNull();
    fetchMock.mockImplementation(() => jsonResponse(INDEX));
    expect(await loadStockIndex()).toEqual(INDEX);
  });

  it("gives null for a missing file, or for an answer that is not an index", async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse(null, false));
    expect(await loadStockIndex()).toBeNull();
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("html")) } as Response));
    expect(await loadStockIndex()).toBeNull();
    fetchMock.mockImplementationOnce(() => jsonResponse({ hello: "world" }));
    expect(await loadStockIndex()).toBeNull();
  });
});

describe("loadStockHistory", () => {
  it("loads one stock's file, whatever the case of the symbol, and keeps it", async () => {
    fetchMock.mockImplementation(() => jsonResponse(HISTORY));
    expect(await loadStockHistory("aaa")).toEqual(HISTORY);
    expect(await loadStockHistory(" AAA ")).toEqual(HISTORY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/stock-data\/AAA\.json$/);
  });

  it("gives null for a file that is not a price history", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ symbol: "AAA", dates: ["2024-01-02"], close: [] }));
    expect(await loadStockHistory("AAA")).toBeNull();
  });
});
