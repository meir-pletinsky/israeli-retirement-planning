import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFxCache } from "../fx/client";
import { clearAllData, loadProfileFromDb, saveFxLookupEnabledToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { useProfile } from "./ProfileContext";
import { useUsdToIlsRateRefresh } from "./useUsdToIlsRateRefresh";

const TODAY = { date: "2026-10-30", base: "USD", quote: "ILS", rate: 3.118 };
const HOLDINGS = [{ category: "employerGrantedStock" as const, quantity: 4, priceUSD: 50 }];

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await clearAllData();
  resetFxCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(TODAY) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe() {
  useUsdToIlsRateRefresh();
  const { profile, updateProfile } = useProfile();
  const { holdings, usdToIlsRate, usdToIlsRateDate } = profile.equity;
  return (
    <>
      <output aria-label="rate">{`${usdToIlsRate ?? "none"} | ${usdToIlsRateDate ?? "no date"}`}</output>
      <button onClick={() => updateProfile({ equity: { ...profile.equity, holdings: [] } })}>
        Remove holdings ({holdings.length})
      </button>
    </>
  );
}

const rate = () => screen.getByLabelText("rate");

describe("useUsdToIlsRateRefresh", () => {
  it("asks for nothing while there are no holdings to value", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50 }));
    renderWithProviders(<Probe />);

    await screen.findByLabelText("rate");
    expect(rate()).toHaveTextContent("none | no date");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps today's Bank of Israel rate, and its day, in the profile once there are holdings", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50, equity: HOLDINGS }));
    renderWithProviders(<Probe />);

    await waitFor(() => expect(rate()).toHaveTextContent("3.118 | 2026-10-30"));
    await waitFor(async () => {
      expect((await loadProfileFromDb())?.equity).toMatchObject({
        usdToIlsRate: 3.118,
        usdToIlsRateDate: "2026-10-30",
      });
    });
  });

  it("replaces an older looked-up rate with the latest one", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 50, equity: HOLDINGS, usdToIlsRate: { rate: 3.5, date: "2026-01-02" } }),
    );
    renderWithProviders(<Probe />);

    await waitFor(() => expect(rate()).toHaveTextContent("3.118 | 2026-10-30"));
  });

  it("never replaces a rate the user typed, and does not even ask", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 50, equity: HOLDINGS, usdToIlsRate: { rate: 3.3 } }),
    );
    renderWithProviders(<Probe />);

    await screen.findByLabelText("rate");
    expect(rate()).toHaveTextContent("3.3 | no date");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the rate that was saved when the answer cannot be had", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    await saveProfileToDb(
      buildTestProfile({ age: 50, equity: HOLDINGS, usdToIlsRate: { rate: 3.5, date: "2026-01-02" } }),
    );
    renderWithProviders(<Probe />);

    await screen.findByLabelText("rate");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(rate()).toHaveTextContent("3.5 | 2026-01-02");
  });

  it("takes a looked-up rate away with the last holding, so an empty profile stays empty", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile({ age: 50, equity: HOLDINGS }));
    renderWithProviders(<Probe />);
    await waitFor(() => expect(rate()).toHaveTextContent("3.118 | 2026-10-30"));

    await user.click(screen.getByRole("button", { name: /Remove holdings/ }));

    await waitFor(() => expect(rate()).toHaveTextContent("none | no date"));
  });

  it("keeps a typed rate when the last holding is removed", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({ age: 50, equity: HOLDINGS, usdToIlsRate: { rate: 3.3 } }),
    );
    renderWithProviders(<Probe />);
    await screen.findByLabelText("rate");

    await user.click(screen.getByRole("button", { name: /Remove holdings/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Remove holdings \(0\)/ })).toBeInTheDocument());
    expect(rate()).toHaveTextContent("3.3 | no date");
  });

  it("does not ask while the lookup is turned off in Settings", async () => {
    await saveFxLookupEnabledToDb(false);
    await saveProfileToDb(buildTestProfile({ age: 50, equity: HOLDINGS }));
    renderWithProviders(<Probe />);

    await screen.findByLabelText("rate");
    expect(rate()).toHaveTextContent("none | no date");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
