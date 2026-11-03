import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EquityStep } from "./EquityStep";

beforeEach(async () => {
  await clearAllData();
});

const ADD_BUTTON_LABEL: Record<string, string> = {
  employerGrantedStock: "Add ESOP / RSU grant",
  employerEsppDiscount: "Add ESPP purchase",
  personalBrokeragePurchase: "Add private trade",
};

async function openAddHolding(user: ReturnType<typeof userEvent.setup>, category: string) {
  await user.click(await screen.findByRole("button", { name: ADD_BUTTON_LABEL[category] }));
}

describe("EquityStep — simple purchase / grant entry", () => {
  it("saves an ESOP grant's date and price in the grant details", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "100");
    await user.type(screen.getByLabelText(/^Grant date/), "2024-03-01");
    await user.type(screen.getByLabelText(/^Share price at grant/), "150");
    await user.type(screen.getByLabelText(/^Current market price/), "200");
    expect(screen.getByText("$20,000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0]).toMatchObject({
        investmentCategory: "employerGrantedStock",
        tickerSymbol: "ABC",
        quantity: 100,
        currentMarketPriceUSD: 200,
        employerGrantDetails: { grantDate: "2024-03-01", costBasisAtGrantUSD: 150 },
      });
    });
  });

  it("saves an ESPP purchase's date and market price in the ESPP details", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "20");
    await user.type(screen.getByLabelText(/^Purchase date/), "2025-06-15");
    await user.type(screen.getByLabelText(/^Share price on purchase date/), "90");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0]).toMatchObject({
        investmentCategory: "employerEsppDiscount",
        esppDetails: { purchaseDate: "2025-06-15", fairMarketValueAtPurchaseUSD: 90 },
      });
    });
  });

  it("saves a private purchase's date and price as its cost basis", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "5");
    await user.type(screen.getByLabelText(/^Purchase date/), "2023-01-10");
    await user.type(screen.getByLabelText(/^Purchase price per share/), "40");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0]).toMatchObject({
        investmentCategory: "personalBrokeragePurchase",
        personalPurchaseDetails: { purchaseDate: "2023-01-10", averageCostBasisUSD: 40 },
      });
    });
  });

  it("titles the dialog with its category, which cannot be changed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    expect(
      screen.getByRole("heading", { name: "ESPP (employee stock purchase plan)" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Investment category/)).not.toBeInTheDocument();
  });

  it.each([
    ["employerGrantedStock", /^Grant date/],
    ["employerEsppDiscount", /^Purchase date/],
    ["personalBrokeragePurchase", /^Purchase date/],
  ])("%s needs a symbol, a date and a quantity before it can be saved", async (category, dateLabel) => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, category);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "5");
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText(dateLabel), "2024-03-01");
    expect(save).toBeEnabled();

    await user.clear(screen.getByLabelText(/^Quantity \(shares\)/));
    expect(save).toBeDisabled();
  });

  it("lets a holding saved without a category pick one, carrying the date and price over", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [{ quantity: 100, priceUSD: 10, entry: { date: "2024-03-01", priceUSD: 150 } }],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText(/^Investment category/), "personalBrokeragePurchase");
    expect(screen.getByLabelText(/^Purchase date/)).toHaveValue("2024-03-01");
    expect(screen.getByLabelText(/^Purchase price per share/)).toHaveValue(150);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      const holding = stored?.equity.holdings[0];
      expect(holding).toMatchObject({
        investmentCategory: "personalBrokeragePurchase",
        personalPurchaseDetails: { purchaseDate: "2024-03-01", averageCostBasisUSD: 150 },
        employerGrantDetails: { grantDate: null, costBasisAtGrantUSD: null },
        esppDetails: { purchaseDate: null, fairMarketValueAtPurchaseUSD: null },
      });
    });
  });

  it("keeps the advanced details under a collapsed section until they hold something", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    expect(screen.queryByRole("button", { name: "Add batch" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^More details: employer grant/ }));
    expect(screen.getByRole("button", { name: "Add batch" })).toBeInTheDocument();
  });

  it("opens the advanced details when the holding already has some", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [
          {
            quantity: 100,
            priceUSD: 10,
            employerGrant: { vestingTranches: [{ vestDate: "2025-03-01", quantity: 40 }] },
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: "Add batch" })).toBeInTheDocument();
  });
});

describe("EquityStep — vesting tranches", () => {
  it("adds, saves and removes vesting batches of an employer grant", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "100");
    await user.type(screen.getByLabelText(/^Grant date/), "2024-03-01");

    // Two batches, then remove the first.
    await user.click(screen.getByRole("button", { name: /^More details: employer grant/ }));
    await user.click(screen.getByRole("button", { name: "Add batch" }));
    await user.click(screen.getByRole("button", { name: "Add batch" }));
    expect(screen.getAllByLabelText(/^Vesting date/)).toHaveLength(2);

    const [firstBatch, secondBatch] = screen.getAllByRole("group");
    await user.click(firstBatch.querySelector("button")!);
    expect(screen.getAllByLabelText(/^Vesting date/)).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Batch 1" })).toBe(secondBatch);

    await user.type(screen.getByLabelText(/^Vesting date/), "2025-03-01");
    await user.type(screen.getByLabelText(/^Shares in batch/), "40");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0].employerGrantDetails.vestingTranches).toMatchObject([
        { vestDate: "2025-03-01", quantity: 40, grantPriceUSD: null },
      ]);
    });
  });

  it("warns when the batches add up to more than the holding's quantity", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.click(screen.getByRole("button", { name: /^More details: employer grant/ }));
    await user.click(screen.getByRole("button", { name: "Add batch" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Shares in batch/), "25");
    expect(screen.getByRole("status")).toHaveTextContent(
      "The batches add up to 25 shares, more than the 10 in this holding",
    );
  });

  it("creates an even schedule from the grant date and the quantity", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "400");
    await user.type(screen.getByLabelText(/^Grant date/), "2024-01-31");
    await user.click(screen.getByRole("button", { name: /^More details: employer grant/ }));

    const create = screen.getByRole("button", { name: "Create schedule" });
    expect(create).toBeEnabled();
    expect(
      screen.getByText((content) =>
        /^Batches: 20, from 30\.04\.2024 to 31\.01\.2029\./.test(content.replace(/[\u2066\u2069]/g, "")),
      ),
    ).toBeInTheDocument();

    await user.click(create);
    expect(screen.getAllByLabelText(/^Vesting date/)).toHaveLength(20);
    // The clock is pinned to 2026-06-15, so the first nine batches have vested.
    expect(screen.getByText("Shares vested so far: 180. Not yet vested: 220.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace the batches with this schedule" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const tranches = (await loadProfileFromDb())?.equity.holdings[0].employerGrantDetails.vestingTranches;
      expect(tranches).toHaveLength(20);
      expect(tranches?.[0]).toMatchObject({ vestDate: "2024-04-30", quantity: 20 });
      expect(tranches?.reduce((sum, tranche) => sum + (tranche.quantity ?? 0), 0)).toBe(400);
    });
  });

  it("cannot create a schedule without a grant date and a quantity", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.click(screen.getByRole("button", { name: /^More details: employer grant/ }));

    expect(screen.getByRole("button", { name: "Create schedule" })).toBeDisabled();
    expect(screen.getByText(/^Enter the grant date and the quantity above/)).toBeInTheDocument();
  });

  it("saves whether the grant keeps vesting after leaving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.type(screen.getByLabelText(/^Grant date/), "2024-03-01");
    await user.click(screen.getByRole("button", { name: /^More details: employer grant/ }));
    const keeps = screen.getByRole("checkbox", { name: /^This grant keeps vesting after I leave/ });
    expect(keeps).not.toBeChecked();

    await user.click(keeps);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0].employerGrantDetails.keepsVestingAfterLeaving).toBe(true);
    });
  });
});
