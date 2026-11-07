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
    expect(screen.getByLabelText(/^Purchase date/)).toHaveValue("01/03/2024");
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

  it("opens a new ESOP grant's details with the usual RSU schedule filled in", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    expect(screen.getByLabelText(/^Number of batches/)).toHaveValue(20);
    expect(screen.getByLabelText(/^Months between batches/)).toHaveValue(3);
    expect(screen.getByLabelText(/^Months until the first batch/)).toHaveValue(3);
  });

  it("keeps the other categories' advanced details collapsed until they hold something", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    expect(screen.queryByLabelText(/^Unrealized capital gain/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^More details: / }));
    expect(screen.getByLabelText(/^Unrealized capital gain/)).toBeInTheDocument();
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
    expect(screen.getByLabelText(/^Number of batches/)).toBeInTheDocument();
  });
});

describe("EquityStep — importance tags", () => {
  const labelOf = (name: RegExp) => screen.getByLabelText(name).closest("label");

  it("does not call the grant's tax and vesting group reference-only, only the fields that feed nothing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    const group = screen.getByRole("button", { name: /^Tax and vesting - affects your estimate/ });
    expect(group).not.toHaveTextContent("Reference only");
    expect(labelOf(/^Tax track/)).toHaveTextContent("Recommended");
    expect(labelOf(/^Number of batches/)).not.toHaveTextContent("Reference only");
    expect(labelOf(/^This grant keeps vesting after I leave/)).not.toHaveTextContent("Reference only");
    expect(labelOf(/^24-month trustee holding period met/)).not.toHaveTextContent("Reference only");
    expect(labelOf(/^Estimated tax on vesting\/sale/)).toHaveTextContent("Reference only");
  });

  it("keeps the ESPP group reference-only because none of its fields feed a calculation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    expect(screen.getByRole("button", { name: /^More details: ESPP/ })).toHaveTextContent("Reference only");
  });

  it("tags the purchase price and rate of an ESPP or private holding Recommended, since the gain tax is measured from them", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    expect(labelOf(/^Purchase price per share/)).toHaveTextContent("Recommended");
    expect(labelOf(/^Purchase price per share/)).not.toHaveTextContent("Reference only");
    expect(screen.getByText(/Used for tax: the gain above it is taxed when you sell/)).toBeInTheDocument();
    expect(labelOf(/^Dollar rate on that date/)).toHaveTextContent("Recommended");
  });

  it("tags the market price on an ESPP purchase day Recommended too", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    expect(labelOf(/^Share price on purchase date/)).toHaveTextContent("Recommended");
  });

  it("keeps the dollar rate of a grant reference-only, as it feeds no calculation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    expect(labelOf(/^Dollar rate on that date/)).toHaveTextContent("Reference only");
  });
});

describe("EquityStep — vesting schedule", () => {
  it("derives the vesting batches from one schedule and saves both", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "400");
    await user.type(screen.getByLabelText(/^Grant date/), "31/01/2024");
    // The default schedule is already filled in, so the preview appears once the date and quantity are known.
    expect(
      screen.getByText((content) =>
        /^Batches: 20, from 30\/04\/2024 to 31\/01\/2029\./.test(content.replace(/[\u2066\u2069]/g, "")),
      ),
    ).toBeInTheDocument();
    // The clock is pinned to 2026-06-15, so the first nine batches have vested.
    expect(screen.getByText("Shares vested so far: 180. Not yet vested: 220.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add batch" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const grant = (await loadProfileFromDb())?.equity.holdings[0].employerGrantDetails;
      expect(grant?.vestingSchedule).toEqual({ batches: 20, everyMonths: 3, firstVestMonths: 3 });
      expect(grant?.vestingTranches).toHaveLength(20);
      expect(grant?.vestingTranches[0]).toMatchObject({ vestDate: "2024-04-30", quantity: 20 });
      expect(grant?.vestingTranches.reduce((sum, tranche) => sum + (tranche.quantity ?? 0), 0)).toBe(400);
    });
  });

  it("follows a changed quantity and drops the batches when the schedule is cleared", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "40");
    await user.type(screen.getByLabelText(/^Grant date/), "01/03/2024");
    const batches = screen.getByLabelText(/^Number of batches/);
    await user.clear(batches);
    await user.type(batches, "4");
    const between = screen.getByLabelText(/^Months between batches/);
    await user.clear(between);
    await user.type(between, "12");
    const first = screen.getByLabelText(/^Months until the first batch/);
    await user.clear(first);
    await user.type(first, "12");

    await user.clear(screen.getByLabelText(/^Quantity \(shares\)/));
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "80");
    await user.clear(between);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const grant = (await loadProfileFromDb())?.equity.holdings[0].employerGrantDetails;
      expect(grant?.vestingTranches).toEqual([]);
    });
  });

  it("accepts a single batch without the months between batches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "50");
    await user.type(screen.getByLabelText(/^Grant date/), "01/03/2024");
    const batches = screen.getByLabelText(/^Number of batches/);
    await user.clear(batches);
    await user.type(batches, "1");
    await user.clear(screen.getByLabelText(/^Months between batches/));
    const first = screen.getByLabelText(/^Months until the first batch/);
    await user.clear(first);
    await user.type(first, "12");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const grant = (await loadProfileFromDb())?.equity.holdings[0].employerGrantDetails;
      expect(grant?.vestingTranches).toMatchObject([{ vestDate: "2025-03-01", quantity: 50 }]);
    });
  });

  it("says what is missing before it can show a schedule", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");

    expect(screen.getByText(/^Enter the grant date and the quantity above/)).toBeInTheDocument();
  });

  it("treats the grant as fully vested once the schedule is cleared", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.type(screen.getByLabelText(/^Grant date/), "2024-03-01");
    await user.clear(screen.getByLabelText(/^Number of batches/));
    await user.clear(screen.getByLabelText(/^Months between batches/));
    await user.clear(screen.getByLabelText(/^Months until the first batch/));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const grant = (await loadProfileFromDb())?.equity.holdings[0].employerGrantDetails;
      expect(grant?.vestingTranches).toEqual([]);
    });
  });

  it("saves whether the grant keeps vesting after leaving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.type(screen.getByLabelText(/^Ticker symbol/), "abc");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.type(screen.getByLabelText(/^Grant date/), "2024-03-01");
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

describe("EquityStep — bank deposit form", () => {
  it("says the deposit's own rate values it today and the plan's return takes over after", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Add bank deposit" }));
    expect(
      screen.getByText(
        "The deposit's own rate is used to value it today. From today it is treated like your other investments and grows at the plan's return, not at this rate.",
      ),
    ).toBeInTheDocument();
  });
});
