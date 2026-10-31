import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cbsAnswer, steadyMonths } from "../test/cpiFixtures";
import { loadIsraelCpi, resetCpiCache } from "./client";

const NOW = new Date("2026-06-15T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const POINTS = steadyMonths({ year: 2025, month: 1 }, { year: 2026, month: 5 }, 2.5);

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetCpiCache();
  fetchMock.mockReset();
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.setSystemTime(NOW);
});

describe("loadIsraelCpi", () => {
  it("loads the monthly changes, asking from 31 years back so a 30-year average is covered", async () => {
    fetchMock.mockImplementation(() => jsonResponse(cbsAnswer(POINTS)));
    expect(await loadIsraelCpi()).toEqual(POINTS);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false&lang=en&startPeriod=01-1995&PageSize=1000",
    );
  });

  it("sends no cookies and no referrer", async () => {
    fetchMock.mockImplementation(() => jsonResponse(cbsAnswer(POINTS)));
    await loadIsraelCpi();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the answer for a few hours, then asks again", async () => {
    fetchMock.mockImplementation(() => jsonResponse(cbsAnswer(POINTS)));
    await loadIsraelCpi();
    await loadIsraelCpi();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW.getTime() + 5 * HOUR_MS);
    await loadIsraelCpi();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW.getTime() + 6 * HOUR_MS);
    await loadIsraelCpi();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks only once when two parts of the page ask at the same time", async () => {
    fetchMock.mockImplementation(() => jsonResponse(cbsAnswer(POINTS)));
    await Promise.all([loadIsraelCpi(), loadIsraelCpi()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives null when offline, and tries again next time", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("offline")));
    expect(await loadIsraelCpi()).toBeNull();
    fetchMock.mockImplementation(() => jsonResponse(cbsAnswer(POINTS)));
    expect(await loadIsraelCpi()).toEqual(POINTS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives null when the service answers with an error", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ error: "busy" }, false));
    expect(await loadIsraelCpi()).toBeNull();
  });

  it("gives null for an answer that is not the index", async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse({ hello: "world" }));
    expect(await loadIsraelCpi()).toBeNull();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("html")) } as Response),
    );
    expect(await loadIsraelCpi()).toBeNull();
  });
});
