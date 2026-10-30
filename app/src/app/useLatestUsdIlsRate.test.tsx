import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFxCache } from "../fx/client";
import { useLatestUsdIlsRate } from "./useLatestUsdIlsRate";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-06-15T12:00:00Z");
const MORNING = { date: "2026-10-30", base: "USD", quote: "ILS", rate: 3.118 };
const NEXT_DAY = { date: "2026-10-31", base: "USD", quote: "ILS", rate: 3.2 };

const fetchMock = vi.fn<typeof fetch>();

function answer(body: unknown) {
  fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response));
}

beforeEach(() => {
  vi.setSystemTime(NOW);
  resetFxCache();
  fetchMock.mockReset();
  answer(MORNING);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.setSystemTime(NOW);
});

/** The function the hook gave `setInterval` for its hourly check, and the timer it got back. */
function hourlyCheck(spy: ReturnType<typeof vi.spyOn>) {
  const index = spy.mock.calls.findIndex((call) => call[1] === HOUR_MS);
  expect(index).toBeGreaterThanOrEqual(0);
  return { run: spy.mock.calls[index][0] as () => void, timer: spy.mock.results[index].value };
}

describe("useLatestUsdIlsRate", () => {
  it("loads the latest rate and says when the first check is over", async () => {
    const { result } = renderHook(() => useLatestUsdIlsRate(true));
    expect(result.current).toEqual({ rate: null, settled: false });

    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.rate).toEqual({ date: "2026-10-30", rate: 3.118 });
  });

  it("asks for nothing while it is not enabled, and starts when it is", async () => {
    const { result, rerender } = renderHook(({ enabled }) => useLatestUsdIlsRate(enabled), {
      initialProps: { enabled: false },
    });
    expect(result.current).toEqual({ rate: null, settled: false });
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.rate?.rate).toBe(3.118));
  });

  it("has no rate once it is turned off", async () => {
    const { result, rerender } = renderHook(({ enabled }) => useLatestUsdIlsRate(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.rate?.rate).toBe(3.118));

    rerender({ enabled: false });
    expect(result.current).toEqual({ rate: null, settled: false });
  });

  it("is settled without a rate when the service cannot be reached", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    const { result } = renderHook(() => useLatestUsdIlsRate(true));

    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.rate).toBeNull();
  });

  it("checks again every hour and shows the new rate", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const { result } = renderHook(() => useLatestUsdIlsRate(true));
    await waitFor(() => expect(result.current.rate?.rate).toBe(3.118));
    const { run } = hourlyCheck(setIntervalSpy);

    answer(NEXT_DAY);
    vi.setSystemTime(NOW.getTime() + HOUR_MS);
    act(() => run());

    await waitFor(() => expect(result.current.rate).toEqual({ date: "2026-10-31", rate: 3.2 }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the last rate when a later check fails", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const { result } = renderHook(() => useLatestUsdIlsRate(true));
    await waitFor(() => expect(result.current.rate?.rate).toBe(3.118));
    const { run } = hourlyCheck(setIntervalSpy);

    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    vi.setSystemTime(NOW.getTime() + HOUR_MS);
    act(() => run());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.rate).toEqual({ date: "2026-10-30", rate: 3.118 });
  });

  it("stops checking when it is no longer used", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { result, unmount } = renderHook(() => useLatestUsdIlsRate(true));
    await waitFor(() => expect(result.current.settled).toBe(true));
    const { timer } = hourlyCheck(setIntervalSpy);

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
  });
});
