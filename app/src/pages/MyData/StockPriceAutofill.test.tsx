import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStockPriceCache } from "../../stockPrices/client";
import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EquityStep } from "./EquityStep";

const INDEX = {
  generatedAtUtc: "2024-06-15T00:00:00.000Z",
  source: "test",
  symbols: [
    { symbol: "AAA", name: "Alpha Corp", firstDate: "2024-02-28", lastDate: "2024-06-14" },
    { symbol: "BBB", name: "Beta Corp", firstDate: "2024-02-28", lastDate: "2024-06-14" },
  ],
};

function history(symbol: string, name: string, closes: number[]) {
  return {
    symbol,
    name,
    asOf: "2024-06-14",
    priceBasis: "adjusted-close",
    dates: ["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-04", "2024-06-14"],
    close: closes,
  };
}

const FILES: Record<string, unknown> = {
  "_index.json": INDEX,
  "AAA.json": history("AAA", "Alpha Corp", [100, 101, 102.5, 103, 150]),
  "BBB.json": history("BBB", "Beta Corp", [20, 21, 22, 23, 30]),
};

const requested: string[] = [];

beforeEach(async () => {
  await clearAllData();
  resetStockPriceCache();
  requested.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      // The dollar rate has its own tests; here it is simply unavailable.
      if (url.includes("frankfurter")) return { ok: false, json: async () => null } as Response;
      const fileName = url.split("/").pop() ?? "";
      requested.push(fileName);
      const body = FILES[fileName];
      return { ok: body !== undefined, json: async () => body } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openAddHolding(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add holding" }));
  await user.selectOptions(screen.getByLabelText(/^Investment category/), "employerGrantedStock");
  await waitFor(() =>
    expect(document.querySelectorAll("#stock-ticker-suggestions option")).toHaveLength(2),
  );
}

const ticker = () => screen.getByLabelText(/^Ticker symbol/);
const grantDate = () => screen.getByLabelText(/^Grant date/);
const grantPrice = () => screen.getByLabelText(/^Share price at grant/);
const currentPrice = () => screen.getByLabelText(/^Current market price/);
const companyName = () => screen.getByLabelText(/^Company name/);

describe("EquityStep — stock price suggestions and autofill", () => {
  it("suggests the stocks of the price list with their company names", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    const options = [...document.querySelectorAll<HTMLOptionElement>("#stock-ticker-suggestions option")];
    expect(options.map((option) => [option.value, option.label])).toEqual([
      ["AAA", "Alpha Corp"],
      ["BBB", "Beta Corp"],
    ]);
    expect(ticker()).toHaveAttribute("list", "stock-ticker-suggestions");
  });

  it("fills the company, today's price and the price on the grant date once the ticker is known", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(ticker(), "aaa");
    await waitFor(() => expect(currentPrice()).toHaveValue(150));
    expect(companyName()).toHaveValue("Alpha Corp");
    expect(grantPrice()).toHaveValue(null);

    await user.type(grantDate(), "2024-03-01");
    await waitFor(() => expect(grantPrice()).toHaveValue(102.5));

    expect(screen.getByText(/filled in from the closing price on 2024-03-01/)).toBeInTheDocument();
    expect(screen.getByText(/filled in from the closing price on 2024-06-14/)).toBeInTheDocument();
    expect(screen.getByText(/adjusted for later stock splits and dividends/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0]).toMatchObject({
        tickerSymbol: "AAA",
        companyName: "Alpha Corp",
        currentMarketPriceUSD: 150,
        employerGrantDetails: { grantDate: "2024-03-01", costBasisAtGrantUSD: 102.5 },
      });
    });
  });

  it("uses the last trading day before a date with no price, and follows a changed date", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(ticker(), "AAA");
    await user.type(grantDate(), "2024-03-02");
    await waitFor(() => expect(grantPrice()).toHaveValue(102.5));
    expect(screen.getByText(/filled in from the closing price on 2024-03-01/)).toBeInTheDocument();

    await user.clear(grantDate());
    await user.type(grantDate(), "2024-02-29");
    await waitFor(() => expect(grantPrice()).toHaveValue(101));
  });

  it("never replaces a price the user typed, and does not bring back one the user deleted", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(currentPrice(), "99");
    await user.type(ticker(), "AAA");
    await user.type(grantDate(), "2024-03-01");
    await waitFor(() => expect(grantPrice()).toHaveValue(102.5));
    expect(currentPrice()).toHaveValue(99);

    await user.clear(grantPrice());
    await user.type(grantDate(), "{backspace}2");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(grantPrice()).toHaveValue(null);
  });

  it("replaces the filled values when the ticker changes, and clears them when it stops matching", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(ticker(), "AAA");
    await user.type(grantDate(), "2024-03-01");
    await waitFor(() => expect(grantPrice()).toHaveValue(102.5));

    await user.clear(ticker());
    await waitFor(() => expect(currentPrice()).toHaveValue(null));
    expect(grantPrice()).toHaveValue(null);
    expect(companyName()).toHaveValue("");
    expect(screen.queryByText(/adjusted for later stock splits/)).not.toBeInTheDocument();

    await user.type(ticker(), "BBB");
    await waitFor(() => expect(grantPrice()).toHaveValue(22));
    expect(currentPrice()).toHaveValue(30);
    expect(companyName()).toHaveValue("Beta Corp");
  });

  it("leaves a ticker that is not in the list alone, without asking for its file", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openAddHolding(user);

    await user.type(ticker(), "ZZZ");
    await user.type(grantDate(), "2024-03-01");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(currentPrice()).toHaveValue(null);
    expect(grantPrice()).toHaveValue(null);
    expect(requested).toEqual(["_index.json"]);
  });

  it("does not touch the values of a holding that is edited", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [
          {
            quantity: 10,
            priceUSD: 77,
            ticker: "AAA",
            category: "employerGrantedStock",
            entry: { date: "2024-03-01", priceUSD: 5 },
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await waitFor(() => expect(requested).toContain("AAA.json"));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(currentPrice()).toHaveValue(77);
    expect(grantPrice()).toHaveValue(5);
    expect(companyName()).toHaveValue("Test Co");
    expect(screen.queryByText(/adjusted for later stock splits/)).not.toBeInTheDocument();
  });

  it("works like before when the price files cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    await user.selectOptions(screen.getByLabelText(/^Investment category/), "employerGrantedStock");
    await user.type(ticker(), "AAA");
    await user.type(grantDate(), "2024-03-01");
    await user.type(grantPrice(), "150");
    expect(grantPrice()).toHaveValue(150);
    expect(document.querySelector("#stock-ticker-suggestions")).toBeNull();
  });
});
