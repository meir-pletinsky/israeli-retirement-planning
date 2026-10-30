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

async function openAddHolding(user: ReturnType<typeof userEvent.setup>, category: string) {
  await user.click(await screen.findByRole("button", { name: "Add holding" }));
  await user.selectOptions(screen.getByLabelText(/^Investment category/), category);
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

  it("shows the date and price before a category is chosen and carries them into it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    await user.type(screen.getByLabelText(/^Purchase \/ grant date/), "2024-03-01");
    await user.type(screen.getByLabelText(/^Share price on that date/), "150");

    await user.selectOptions(screen.getByLabelText(/^Investment category/), "employerGrantedStock");
    expect(screen.getByLabelText(/^Grant date/)).toHaveValue("2024-03-01");
    expect(screen.getByLabelText(/^Share price at grant/)).toHaveValue(150);

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
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "100");

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
});
