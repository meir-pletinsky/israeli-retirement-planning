import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStockPriceCache } from "../../stockPrices/client";
import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EquityStep } from "./EquityStep";

const FILES: Record<string, unknown> = {
  "_index.json": {
    generatedAtUtc: "2024-06-15T00:00:00.000Z",
    source: "test",
    symbols: [
      { symbol: "AAA", name: "Alpha Corp", firstDate: "2024-02-28", lastDate: "2024-06-14" },
      { symbol: "SPL", name: "Splitter Inc", firstDate: "2024-02-28", lastDate: "2024-06-14" },
    ],
  },
  "AAA.json": {
    symbol: "AAA",
    name: "Alpha Corp",
    asOf: "2024-06-14",
    priceBasis: "adjusted-close",
    dates: ["2024-02-28", "2024-03-15", "2024-06-14"],
    close: [100, 110, 150],
  },
  // A 10:1 split on 2024-04-01: the published prices are already adjusted for it.
  "SPL.json": {
    symbol: "SPL",
    name: "Splitter Inc",
    asOf: "2024-06-14",
    priceBasis: "adjusted-close",
    dates: ["2024-02-28", "2024-03-15", "2024-06-14"],
    close: [10, 11, 15],
    splits: [{ date: "2024-04-01", ratio: 10 }],
  },
};

beforeEach(async () => {
  await clearAllData();
  resetStockPriceCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = FILES[url.split("/").pop() ?? ""];
      return { ok: body !== undefined, json: async () => body } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openBulk(user: ReturnType<typeof userEvent.setup>, addLabel: string) {
  await user.click(await screen.findByRole("button", { name: addLabel }));
  await user.click(screen.getByRole("tab", { name: "Bulk (paste CSV)" }));
}

const paste = (text: string) =>
  fireEvent.change(screen.getByLabelText(/^Purchases, one per line/), { target: { value: text } });

describe("HoldingDialog — bulk entry", () => {
  it("shows the dialog's two ways to add, Single first", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await user.click(await screen.findByRole("button", { name: "Add private trade" }));

    expect(screen.getByRole("tab", { name: "Single" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText(/^Ticker symbol/)).toBeInTheDocument();
  });

  it("previews pasted private purchases, skips unreadable lines and saves one holding per row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openBulk(user, "Add private trade");

    const save = screen.getByRole("button", { name: "Add 0 holdings" });
    expect(save).toBeDisabled();
    expect(screen.getByText("No readable rows yet.")).toBeInTheDocument();

    paste("2024-03-15, aaa, 10\n01/02/2024, msft, 2.5\nnot a row\n03/04/2024,AAA,1,1.5");
    expect(await screen.findByRole("button", { name: "Add 3 holdings" })).toBeEnabled();
    expect(screen.getByText("1 line could not be read and was ignored.")).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getByText("15/03/2024")).toBeInTheDocument();
    expect(within(table).getByText("01/02/2024")).toBeInTheDocument();
    // AAA is in the price list, so the missing price on 15/03/2024 is estimated; MSFT is not.
    expect(await within(table).findByText("$110.00 (estimated)")).toBeInTheDocument();
    expect(within(table).getByText("—")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add 3 holdings" }));
    await waitFor(async () => {
      const holdings = (await loadProfileFromDb())?.equity.holdings ?? [];
      expect(holdings).toHaveLength(3);
      expect(holdings[0]).toMatchObject({
        investmentCategory: "personalBrokeragePurchase",
        tickerSymbol: "AAA",
        quantity: 10,
        companyName: "Alpha Corp",
        currentMarketPriceUSD: 150,
        personalPurchaseDetails: { purchaseDate: "2024-03-15", averageCostBasisUSD: 110 },
      });
      expect(holdings[1]).toMatchObject({
        tickerSymbol: "MSFT",
        quantity: 2.5,
        personalPurchaseDetails: { purchaseDate: "2024-02-01", averageCostBasisUSD: null },
      });
    });
  });

  it("takes an ESOP's symbol and vesting schedule once and applies them to every row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openBulk(user, "Add ESOP / RSU grant");

    expect(screen.queryByText("Symbol")).not.toBeInTheDocument();
    paste("01/03/2024, 40, 12.5\n01/03/2025, 80");
    expect(screen.getByText("Enter the stock symbol to add these rows.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 holdings" })).toBeDisabled();

    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    for (const [label, value] of [
      [/^Number of batches/, "4"],
      [/^Months between batches/, "12"],
      [/^Months until the first batch/, "12"],
    ] as const) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    }
    await user.click(screen.getByRole("button", { name: "Add 2 holdings" }));

    await waitFor(async () => {
      const holdings = (await loadProfileFromDb())?.equity.holdings ?? [];
      expect(holdings).toHaveLength(2);
      expect(holdings[0]).toMatchObject({
        investmentCategory: "employerGrantedStock",
        tickerSymbol: "ABC",
        quantity: 40,
        employerGrantDetails: {
          grantDate: "2024-03-01",
          costBasisAtGrantUSD: 12.5,
          vestingSchedule: { batches: 4, everyMonths: 12, firstVestMonths: 12 },
        },
      });
      expect(holdings[0].employerGrantDetails.vestingTranches).toHaveLength(4);
      expect(holdings[1].tickerSymbol).toBe("ABC");
      expect(holdings[1].employerGrantDetails.costBasisAtGrantUSD).toBeNull();
      expect(holdings[1].employerGrantDetails.vestingTranches[0]).toMatchObject({
        vestDate: "2026-03-01",
        quantity: 20,
      });
    });
  });

  it("reads quantities with a dot as the decimal point", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openBulk(user, "Add ESPP purchase");

    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    paste("01/03/2024; 1,5\n02/03/2024; 1.5");
    expect(await screen.findByRole("button", { name: "Add 1 holding" })).toBeEnabled();
    expect(screen.getByText("1 line could not be read and was ignored.")).toBeInTheDocument();
  });

  it("restates pasted rows in today's shares after a later split", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openBulk(user, "Add private trade");

    // Bought before the 10:1 split: 10 shares at $110 became 100 shares at $11.
    // The second row has no price, and the estimate is already adjusted.
    // The third was bought after the split and stays as it is.
    paste("2024-03-15, spl, 10, 110\n2024-03-15, spl, 3\n2024-05-02, spl, 4, 14");
    const table = await screen.findByRole("table");
    await waitFor(() => expect(within(table).getAllByText("×10")).toHaveLength(2));
    expect(within(table).getByText("100")).toBeInTheDocument();
    expect(within(table).getByText("$11.00")).toBeInTheDocument();
    expect(within(table).getByText("30")).toBeInTheDocument();
    expect(within(table).getByText("$11.00 (estimated)")).toBeInTheDocument();
    expect(screen.getByText(/Rows marked with ×/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add 3 holdings" }));
    await waitFor(async () => {
      const holdings = (await loadProfileFromDb())?.equity.holdings ?? [];
      expect(holdings.map((h) => h.quantity)).toEqual([100, 30, 4]);
      expect(holdings.map((h) => h.personalPurchaseDetails.averageCostBasisUSD)).toEqual([11, 11, 14]);
    });
  });

  it("takes the numbers as typed when they are not marked as reported before splits", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await openBulk(user, "Add private trade");

    await user.click(screen.getByRole("checkbox", { name: /as originally reported/ }));
    paste("2024-03-15, spl, 100, 11");
    const table = await screen.findByRole("table");
    expect(within(table).queryByText("×10")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add 1 holding" }));
    await waitFor(async () => {
      const [holding] = (await loadProfileFromDb())?.equity.holdings ?? [];
      expect(holding).toMatchObject({
        quantity: 100,
        personalPurchaseDetails: { averageCostBasisUSD: 11 },
      });
    });
  });

  it("restates a single entry too, dividing only a price that was typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await user.click(await screen.findByRole("button", { name: "Add private trade" }));

    await user.type(screen.getByLabelText(/^Ticker symbol/), "SPL");
    await user.type(screen.getByLabelText(/^Purchase date/), "2024-03-15");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    const price = screen.getByLabelText(/^Purchase price/);
    await waitFor(() => expect(price).toHaveValue(11));
    expect(await screen.findByText(/it will be saved as 100 shares/)).toBeInTheDocument();

    const total = screen.getByText(/^Total value:/);
    await waitFor(() => expect(total).toHaveTextContent("$1,500"));
    expect(total).toHaveTextContent("as reported: 10 shares \u00b7 $150");
    await user.clear(price);
    await user.type(price, "110");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const [holding] = (await loadProfileFromDb())?.equity.holdings ?? [];
      expect(holding).toMatchObject({
        quantity: 100,
        personalPurchaseDetails: { averageCostBasisUSD: 11 },
      });
    });
  });

  it("keeps an estimated single-entry price as it is, since it is already adjusted", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });
    await user.click(await screen.findByRole("button", { name: "Add private trade" }));

    await user.type(screen.getByLabelText(/^Ticker symbol/), "SPL");
    await user.type(screen.getByLabelText(/^Purchase date/), "2024-03-15");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await waitFor(() => expect(screen.getByLabelText(/^Purchase price/)).toHaveValue(11));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const [holding] = (await loadProfileFromDb())?.equity.holdings ?? [];
      expect(holding).toMatchObject({
        quantity: 100,
        personalPurchaseDetails: { averageCostBasisUSD: 11 },
      });
    });
  });

  it("offers no bulk entry when editing a saved holding", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50, equity: [{ quantity: 100, priceUSD: 10 }] }));
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /as originally reported/ })).not.toBeInTheDocument();
  });
});
