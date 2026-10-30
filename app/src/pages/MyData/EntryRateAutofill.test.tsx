import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFxCache } from "../../fx/client";
import { resetStockPriceCache } from "../../stockPrices/client";
import { clearAllData, loadProfileFromDb, saveFxLookupEnabledToDb } from "../../storage/db";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EquityStep } from "./EquityStep";

/** What the rate service knows, by the day asked for. A Saturday answers with the Friday before it. */
const RATES: Record<string, { date: string; rate: number }> = {
  "2024-03-01": { date: "2024-03-01", rate: 3.65 },
  "2024-03-02": { date: "2024-03-01", rate: 3.65 },
  "2024-02-29": { date: "2024-02-29", rate: 3.6 },
};

const requestedDates: string[] = [];

function serveRates() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.includes("frankfurter")) return { ok: false, json: async () => null } as Response;
      const date = new URL(url).searchParams.get("date") ?? "";
      requestedDates.push(date);
      const found = RATES[date];
      return {
        ok: found !== undefined,
        json: async () => (found ? { ...found, base: "USD", quote: "ILS" } : { status: 404 }),
      } as Response;
    }),
  );
}

beforeEach(async () => {
  await clearAllData();
  resetFxCache();
  resetStockPriceCache();
  requestedDates.length = 0;
  serveRates();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openAddHolding(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add holding" }));
  await user.selectOptions(screen.getByLabelText(/^Investment category/), "employerGrantedStock");
}

const grantDate = () => screen.getByLabelText(/^Grant date/);
const rateField = () => screen.getByLabelText(/^Dollar rate on that date/);

describe("EquityStep — dollar rate of the grant date", () => {
  it("fills the rate of the grant date, says which day it is from, and saves it with the entry", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(grantDate(), "2024-03-01");
    await waitFor(() => expect(rateField()).toHaveValue(3.65));
    expect(screen.getByText(/Bank of Israel rate of 2024-03-01/)).toBeInTheDocument();
    expect(screen.getByText(/the tax calculations do not use it yet/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0].employerGrantDetails).toMatchObject({
        grantDate: "2024-03-01",
        usdToIlsRateAtGrant: 3.65,
      });
    });
  });

  it("names the earlier business day when the grant date has no rate of its own", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(grantDate(), "2024-03-02");
    await waitFor(() => expect(rateField()).toHaveValue(3.65));
    expect(screen.getByText(/Bank of Israel rate of 2024-03-01/)).toBeInTheDocument();
  });

  it("follows a changed date, and takes the rate away when the new date has none", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(grantDate(), "2024-03-01");
    await waitFor(() => expect(rateField()).toHaveValue(3.65));

    await user.clear(grantDate());
    await user.type(grantDate(), "2024-02-29");
    await waitFor(() => expect(rateField()).toHaveValue(3.6));

    await user.clear(grantDate());
    await user.type(grantDate(), "1990-01-01");
    await waitFor(() => expect(rateField()).toHaveValue(null));
    expect(screen.queryByText(/Bank of Israel rate of/)).not.toBeInTheDocument();
  });

  it("keeps a rate the user typed, and does not bring a deleted one back", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(grantDate(), "2024-03-01");
    await waitFor(() => expect(rateField()).toHaveValue(3.65));

    await user.clear(rateField());
    await waitFor(() => expect(rateField()).toHaveValue(null));
    await user.type(rateField(), "3.7");
    expect(rateField()).toHaveValue(3.7);
    expect(screen.queryByText(/Bank of Israel rate of/)).not.toBeInTheDocument();

    await user.clear(grantDate());
    await user.type(grantDate(), "2024-02-29");
    await waitFor(() => expect(requestedDates).toContain("2024-02-29"));
    expect(rateField()).toHaveValue(3.7);
  });

  it("does not overwrite a rate typed before the date", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(rateField(), "3.9");
    await user.type(grantDate(), "2024-03-01");
    await waitFor(() => expect(requestedDates).toContain("2024-03-01"));
    expect(rateField()).toHaveValue(3.9);
  });

  it("stays silent when the rate service cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(grantDate(), "2024-03-01");
    expect(rateField()).toHaveValue(null);
    expect(screen.queryByText(/Bank of Israel rate of/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not ask the service when the lookup is turned off in Settings", async () => {
    await saveFxLookupEnabledToDb(false);
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(grantDate(), "2024-03-01");
    expect(rateField()).toHaveValue(null);
    expect(requestedDates).toEqual([]);

    await user.type(rateField(), "3.6");
    expect(rateField()).toHaveValue(3.6);
  });
});
