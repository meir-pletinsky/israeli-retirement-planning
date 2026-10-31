import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cbsAnswer, steadyMonths } from "../test/cpiFixtures";
import { CPI_BUILT_IN_SUMMARY } from "./builtIn";
import { resetCpiCache } from "./client";
import { useIsraelCpi } from "./useIsraelCpi";

const LIVE_POINTS = steadyMonths({ year: 1990, month: 1 }, { year: 2026, month: 5 }, 1.2);

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetCpiCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIsraelCpi", () => {
  it("shows the built-in figures while loading, then the live ones", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(cbsAnswer(LIVE_POINTS)) } as Response),
    );
    const { result } = renderHook(() => useIsraelCpi(true));
    expect(result.current).toEqual({ summary: CPI_BUILT_IN_SUMMARY, status: "loading" });

    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.summary.latest).toEqual({ year: 2026, month: 5, yearOverYearPct: 1.2 });
  });

  it("keeps the built-in figures when the lookup fails", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    const { result } = renderHook(() => useIsraelCpi(true));

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.summary).toBe(CPI_BUILT_IN_SUMMARY);
  });

  it("asks for nothing while it is off", async () => {
    const { result } = renderHook(() => useIsraelCpi(false));
    expect(result.current).toEqual({ summary: CPI_BUILT_IN_SUMMARY, status: "off" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("goes back to the built-in figures when turned off, and asks again when turned on", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(cbsAnswer(LIVE_POINTS)) } as Response),
    );
    const { result, rerender } = renderHook(({ enabled }) => useIsraelCpi(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current.status).toBe("live"));

    rerender({ enabled: false });
    expect(result.current).toEqual({ summary: CPI_BUILT_IN_SUMMARY, status: "off" });

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe("live"));
  });
});
