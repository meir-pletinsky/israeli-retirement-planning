import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";

import { clearAllData, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EquityStep } from "./EquityStep";
import { MyDataLayout } from "./MyDataLayout";
import { PensionSavingsStep } from "./PensionSavingsStep";

const SHEKEL = "\u20aa";

function renderStep(step: "personal" | "pension-savings" | "equity") {
  return renderWithProviders(
    <Routes>
      <Route path="/my-data" element={<MyDataLayout />}>
        <Route path="pension-savings" element={<PensionSavingsStep />} />
        <Route path="equity" element={<EquityStep />} />
        <Route path="personal" element={<p>personal step</p>} />
      </Route>
    </Routes>,
    { route: `/my-data/${step}` },
  );
}

beforeEach(async () => {
  await clearAllData();
});

describe("My Data summary tables — Pension & Savings", () => {
  it("lists every account with a balance total, above the field legend", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        pensionBalances: [100_000, 50_000],
        pensionAccountOverrides: [
          {
            providerName: "Acme Pension",
            policyNumber: "P-100",
            productCategory: "comprehensivePension",
            accountStatus: "activeContributing",
            contributions: {
              monthlySalaryBase: 20_000,
              employeeRatePercent: 6,
              employerRatePercent: 6.5,
              severanceRatePercent: 6,
            },
            investmentAndFees: {
              investmentTrackName: "",
              feeFromAccumulationPercent: 0.3,
              feeFromDepositPercent: null,
              profitSharingFeePercent: null,
              hasStateYieldGuarantee: false,
            },
            annuityParameters: {
              hasGuaranteedFactor: false,
              conversionFactor: null,
              estimatedMonthlyAnnuity: 5_000,
              annuityTaxType: null,
              guaranteedPaymentMonths: null,
            },
          },
          { providerName: "Beta Study Fund", productCategory: "studyFund" },
        ],
      }),
    );
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings at a glance" });
    const [header, first, second, totals] = within(table).getAllByRole("row");
    expect(header).toHaveTextContent("Provider name");
    expect(header).toHaveTextContent("Total accumulated balance");
    expect(first).toHaveTextContent("Acme Pension");
    expect(first).toHaveTextContent("Policy P-100");
    expect(first).toHaveTextContent("Comprehensive pension fund");
    expect(first).toHaveTextContent("Active \u2014 contributing");
    expect(first).toHaveTextContent(`${SHEKEL}100,000`);
    expect(first).toHaveTextContent("6.5%");
    expect(first).toHaveTextContent("0.3%");
    expect(first).toHaveTextContent(`${SHEKEL}5,000`);
    expect(second).toHaveTextContent("Beta Study Fund");
    expect(second).toHaveTextContent("Study fund (Keren Hishtalmut)");
    expect(second).toHaveTextContent("\u2014");
    expect(totals).toHaveTextContent("Total");
    expect(totals).toHaveTextContent(`${SHEKEL}150,000`);

    const legend = screen.getByRole("region", { name: "Which fields matter?" });
    expect(
      table.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is read-only: the edit and remove buttons stay on the cards", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50, pensionBalances: [100_000] }));
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings at a glance" });
    expect(within(table).queryByRole("button")).not.toBeInTheDocument();
    expect(within(table).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import report" })).toBeInTheDocument();
  });

  it("leaves a spouse's account out of the total until the spouse's age is entered", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        maritalStatus: "married",
        pensionBalances: [100_000, 40_000],
        pensionAccountOverrides: [{ owner: "self" }, { owner: "spouse" }],
      }),
    );
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings at a glance" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Me");
    expect(rows[2]).toHaveTextContent("Not counted \u2014 add your spouse's age");
    expect(rows[3]).toHaveTextContent(`${SHEKEL}100,000`);
    expect(rows[3]).not.toHaveTextContent(`${SHEKEL}140,000`);
    expect(screen.getByText(/The total leaves out accounts marked/)).toBeInTheDocument();
  });

  it("counts the spouse's account and shows its owner once the household is active", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        maritalStatus: "married",
        spouse: { age: 48 },
        pensionBalances: [100_000, 40_000],
        pensionAccountOverrides: [{ owner: "self" }, { owner: "spouse" }],
      }),
    );
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings at a glance" });
    const rows = within(table).getAllByRole("row");
    expect(rows[2]).toHaveTextContent("My spouse");
    expect(rows[3]).toHaveTextContent(`${SHEKEL}140,000`);
    expect(screen.queryByText(/The total leaves out accounts marked/)).not.toBeInTheDocument();
  });

  it("hides the owner column for a single person", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50, pensionBalances: [100_000] }));
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings at a glance" });
    expect(within(table).queryByRole("columnheader", { name: "Account owner" })).not.toBeInTheDocument();
  });

  it("shows no table before any account is added", async () => {
    renderStep("pension-savings");

    expect(await screen.findByText(/no accounts added yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("does not appear on the other steps", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50, pensionBalances: [100_000] }));
    renderStep("personal");

    expect(await screen.findByText("personal step")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("My Data summary tables — Equity & Investments", () => {
  it("shows one table per category with its own totals, above the field legend", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [
          {
            category: "employerGrantedStock",
            ticker: "AAA",
            quantity: 10,
            priceUSD: 200,
            entry: { date: "2024-03-01", priceUSD: 150 },
          },
          {
            category: "employerEsppDiscount",
            ticker: "BBB",
            quantity: 5,
            priceUSD: 100,
            entry: { date: "2025-06-15", priceUSD: 90 },
          },
          {
            category: "personalBrokeragePurchase",
            ticker: "CCC",
            quantity: 2,
            priceUSD: 50,
            entry: { date: "2023-01-10", priceUSD: 40 },
          },
          { ticker: "DDD", quantity: 1, priceUSD: 10, entry: { date: "2022-05-05", priceUSD: 8 } },
        ],
      }),
    );
    renderStep("equity");

    const esop = await screen.findByRole("table", { name: "ESOP / RSU at a glance" });
    const [esopHeader, esopRow, esopTotals] = within(esop).getAllByRole("row");
    expect(esopHeader).toHaveTextContent("Grant date");
    expect(esopHeader).toHaveTextContent("Share price at grant");
    expect(esopHeader).toHaveTextContent("Current price (USD)");
    expect(esopRow).toHaveTextContent("AAA");
    expect(esopRow).toHaveTextContent("Test Co");
    expect(esopRow).toHaveTextContent("2024-03-01");
    expect(esopRow).toHaveTextContent("$150");
    expect(esopRow).toHaveTextContent("$200");
    expect(esopRow).toHaveTextContent("$2,000");
    expect(esopRow).toHaveTextContent(`${SHEKEL}7,400`);
    expect(esopTotals).toHaveTextContent("$2,000");

    const espp = screen.getByRole("table", { name: "ESPP at a glance" });
    expect(within(espp).getAllByRole("row")[0]).toHaveTextContent("Share price on purchase date");
    expect(within(espp).getAllByRole("row")[1]).toHaveTextContent("2025-06-15");
    expect(within(espp).getAllByRole("row")[1]).toHaveTextContent("$90");
    expect(within(espp).getAllByRole("row")[2]).toHaveTextContent("$500");

    const privateInvestments = screen.getByRole("table", { name: "Private investments at a glance" });
    expect(within(privateInvestments).getAllByRole("row")[0]).toHaveTextContent(
      "Purchase price per share",
    );
    expect(within(privateInvestments).getAllByRole("row")[1]).toHaveTextContent("2023-01-10");
    expect(within(privateInvestments).getAllByRole("row")[2]).toHaveTextContent("$100");

    const uncategorised = screen.getByRole("table", { name: "Holdings without a category" });
    const [uncategorisedHeader, uncategorisedRow, uncategorisedTotals] =
      within(uncategorised).getAllByRole("row");
    expect(uncategorisedHeader).toHaveTextContent("Purchase / grant date");
    expect(uncategorisedHeader).toHaveTextContent("Share price on that date");
    expect(uncategorisedRow).toHaveTextContent("2022-05-05");
    expect(uncategorisedRow).toHaveTextContent("$8");
    expect(uncategorisedTotals).toHaveTextContent("$10");

    expect(
      screen.getByText(/Total across all categories/),
    ).toHaveTextContent(`Total across all categories: $2,610 / ${SHEKEL}9,657`);
    expect(screen.getByText("Shekel values use a fixed rate of 3.7 per US dollar.")).toBeInTheDocument();

    const legend = screen.getByRole("region", { name: "Which fields matter?" });
    expect(
      esop.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("lists several holdings of one category in a single table", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [
          { category: "employerGrantedStock", ticker: "AAA", quantity: 10, priceUSD: 200 },
          { category: "employerGrantedStock", ticker: "BBB", quantity: 5, priceUSD: 100 },
        ],
      }),
    );
    renderStep("equity");

    const table = await screen.findByRole("table", { name: "ESOP / RSU at a glance" });
    const [, first, second, totals] = within(table).getAllByRole("row");
    expect(first).toHaveTextContent("AAA");
    expect(second).toHaveTextContent("BBB");
    expect(totals).toHaveTextContent("$2,500");
    expect(totals).toHaveTextContent(`${SHEKEL}9,250`);
  });

  it("shows only the categories that have holdings, with no all-category total", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [{ category: "employerEsppDiscount", quantity: 4, priceUSD: 25 }],
      }),
    );
    renderStep("equity");

    expect(await screen.findByRole("table", { name: "ESPP at a glance" })).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByText(/Total across all categories/)).not.toBeInTheDocument();
  });

  it("leaves a cell empty while the date or a price is missing", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [{ category: "personalBrokeragePurchase", quantity: 3, priceUSD: 20 }],
      }),
    );
    renderStep("equity");

    const table = await screen.findByRole("table", { name: "Private investments at a glance" });
    const [, row] = within(table).getAllByRole("row");
    const cells = within(row).getAllByRole("cell");
    expect(cells[3]).toHaveTextContent("\u2014");
    expect(cells[4]).toHaveTextContent("\u2014");
    expect(row).toHaveTextContent("$60");
  });

  it("is read-only and keeps the Add holding action", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [{ category: "employerGrantedStock", quantity: 1, priceUSD: 10 }],
      }),
    );
    renderStep("equity");

    const table = await screen.findByRole("table", { name: "ESOP / RSU at a glance" });
    expect(within(table).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add holding" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows no table before any holding is added", async () => {
    renderStep("equity");

    expect(await screen.findByText(/no equity holdings added yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
