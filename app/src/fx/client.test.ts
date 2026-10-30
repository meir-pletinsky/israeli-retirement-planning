import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadUsdIlsRate, resetFxCache } from "./client";

const TODAY = { date: "2026-10-30", base: "USD", quote: "ILS", rate: 3.118 };
const FRIDAY = { date: "2019-03-15", base: "USD", quote: "ILS", rate: 3.604 };
const NOW = new Date("2026-06-15T12:00:00Z");
const MINUTE_MS = 60 * 1000;

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetFxCache();
  fetchMock.mockReset();
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.setSystemTime(NOW);
});

describe("loadUsdIlsRate", () => {
  it("loads the latest rate when no date is given, and keeps it for the session", async () => {
    fetchMock.mockImplementation(() => jsonResponse(TODAY));
    expect(await loadUsdIlsRate()).toEqual({ date: "2026-10-30", rate: 3.118 });
    expect(await loadUsdIlsRate()).toEqual({ date: "2026-10-30", rate: 3.118 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.frankfurter.dev/v2/rate/usd/ils?providers=boi");
  });

  it("loads the rate of a date, which can be an earlier business day than the date asked for", async () => {
    fetchMock.mockImplementation(() => jsonResponse(FRIDAY));
    expect(await loadUsdIlsRate("2019-03-16")).toEqual({ date: "2019-03-15", rate: 3.604 });
    expect(fetchMock.mock.calls[0][0]).toMatch(/&date=2019-03-16$/);
  });

  it("sends no cookies and no referrer", async () => {
    fetchMock.mockImplementation(() => jsonResponse(TODAY));
    await loadUsdIlsRate();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("keeps the latest rate and each date's rate apart", async () => {
    fetchMock.mockImplementation((url) => jsonResponse(String(url).includes("date=") ? FRIDAY : TODAY));
    expect((await loadUsdIlsRate())?.rate).toBe(3.118);
    expect((await loadUsdIlsRate("2019-03-15"))?.rate).toBe(3.604);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks for the latest rate again after an hour, but never for a date's rate again", async () => {
    fetchMock.mockImplementation((url) => jsonResponse(String(url).includes("date=") ? FRIDAY : TODAY));
    await loadUsdIlsRate();
    await loadUsdIlsRate("2019-03-15");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(NOW.getTime() + 30 * MINUTE_MS);
    await loadUsdIlsRate();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(NOW.getTime() + 60 * MINUTE_MS);
    await loadUsdIlsRate();
    await loadUsdIlsRate("2019-03-15");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).not.toMatch(/date=/);
  });

  it("gives null when offline, and tries again next time", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("offline")));
    expect(await loadUsdIlsRate()).toBeNull();
    fetchMock.mockImplementation(() => jsonResponse(TODAY));
    expect(await loadUsdIlsRate()).toEqual({ date: "2026-10-30", rate: 3.118 });
  });

  it("gives null for a date the service has no rate for", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ status: 404, message: "not found" }, false));
    expect(await loadUsdIlsRate("1990-01-01")).toBeNull();
  });

  it("gives null for an answer that is not a rate", async () => {
    fetchMock.mockImplementationOnce(() => jsonResponse({ hello: "world" }));
    expect(await loadUsdIlsRate()).toBeNull();
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("html")) } as Response),
    );
    expect(await loadUsdIlsRate()).toBeNull();
  });

  it("does not ask for a date that is not a date", async () => {
    expect(await loadUsdIlsRate("not-a-date")).toBeNull();
    expect(await loadUsdIlsRate("")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
