import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";

import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
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

    const table = await screen.findByRole("table", { name: "Pension & savings accounts" });
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

  it("puts Add and Import above the table and Edit and Remove on every row", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        pensionBalances: [100_000, 50_000],
        pensionAccountOverrides: [
          { providerName: "Acme Pension", policyNumber: "P-100" },
          { providerName: "Beta Fund" },
        ],
      }),
    );
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings accounts" });
    const [header, first, second, totals] = within(table).getAllByRole("row");
    expect(within(header).getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Edit" })).toHaveAccessibleDescription(/Acme Pension/);
    expect(within(first).getByRole("button", { name: "Remove" })).toHaveAccessibleDescription(/Policy P-100/);
    expect(within(second).getByRole("button", { name: "Edit" })).toHaveAccessibleDescription(/Beta Fund/);
    expect(within(totals).queryByRole("button")).not.toBeInTheDocument();
    expect(within(table).queryByRole("textbox")).not.toBeInTheDocument();

    const toolbar = [
      screen.getByRole("button", { name: "Add account" }),
      screen.getByRole("link", { name: "Import Clearing House report" }),
    ];
    for (const control of toolbar) {
      expect(control.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.queryByRole("heading", { name: "Have a Pension Clearing House report?" })).not.toBeInTheDocument();
    expect(screen.getByText(/Have a Pension Clearing House report\? Import it/)).toBeInTheDocument();
    expect(screen.queryByText(/use the cards below/i)).not.toBeInTheDocument();
  });

  it("edits and removes the account of the row whose button was pressed", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        pensionBalances: [100_000, 50_000],
        pensionAccountOverrides: [{ providerName: "Acme Pension" }, { providerName: "Beta Fund" }],
      }),
    );
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings accounts" });
    await user.click(within(within(table).getAllByRole("row")[2]).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Provider name/)).toHaveValue("Beta Fund");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(within(within(table).getAllByRole("row")[1]).getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(within(table).queryByText("Acme Pension")).not.toBeInTheDocument());
    expect(within(table).getByText("Beta Fund")).toBeInTheDocument();
  });

  it("shows one table per person, each totalling only that person's accounts", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        maritalStatus: "married",
        spouse: { age: 48 },
        pensionBalances: [100_000, 40_000],
        pensionAccountOverrides: [
          { owner: "self", providerName: "My Fund" },
          { owner: "spouse", providerName: "Partner Fund" },
        ],
      }),
    );
    renderStep("pension-savings");

    let table = await screen.findByRole("table", { name: "My accounts" });
    expect(within(table).getByText("My Fund")).toBeInTheDocument();
    expect(within(table).queryByText("Partner Fund")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent(`${SHEKEL}100,000`);

    await user.click(screen.getByRole("tab", { name: /Partner/ }));
    table = await screen.findByRole("table", { name: "Partner's accounts" });
    expect(within(table).getByText("Partner Fund")).toBeInTheDocument();
    expect(within(table).queryByText("My Fund")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent(`${SHEKEL}40,000`);
    expect(screen.getByText(/Household total counted in your plan:/)).toHaveTextContent(`${SHEKEL}140,000`);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("explains that the partner's accounts are not counted until the partner's age is entered", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        maritalStatus: "married",
        pensionBalances: [100_000, 40_000],
        pensionAccountOverrides: [{ owner: "self" }, { owner: "spouse" }],
      }),
    );
    renderStep("pension-savings");

    await screen.findByRole("table", { name: "My accounts" });
    expect(screen.getByText(/Household total counted in your plan:/)).toHaveTextContent(`${SHEKEL}100,000`);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Partner/ }));
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("These accounts are not counted yet");
    expect(within(note).getByRole("link", { name: "Go to Personal" })).toHaveAttribute("href", "/my-data/personal");
  });

  it("hides the owner column for a single person", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50, pensionBalances: [100_000] }));
    renderStep("pension-savings");

    const table = await screen.findByRole("table", { name: "Pension & savings accounts" });
    expect(within(table).queryByRole("columnheader", { name: "Account owner" })).not.toBeInTheDocument();
  });

  it("shows no table before any account is added, only the way to add or import one", async () => {
    renderStep("pension-savings");

    expect(await screen.findByText(/no accounts added yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pension & savings accounts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Have a Pension Clearing House report?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import Clearing House report" })).toBeInTheDocument();
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
    expect(screen.getByLabelText("Shekels per US dollar")).toHaveValue(3.7);
    expect(screen.getByText(/A rough built-in rate/)).toBeInTheDocument();

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

  it("has Edit and Remove on every row and the Add holding action above the tables", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [
          { category: "employerGrantedStock", ticker: "AAA", quantity: 1, priceUSD: 10 },
          { category: "employerGrantedStock", ticker: "BBB", quantity: 2, priceUSD: 10 },
        ],
      }),
    );
    renderStep("equity");

    const table = await screen.findByRole("table", { name: "ESOP / RSU at a glance" });
    const [header, first, second, totals] = within(table).getAllByRole("row");
    expect(within(header).getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Edit" })).toHaveAccessibleDescription(/AAA/);
    expect(within(second).getByRole("button", { name: "Remove" })).toHaveAccessibleDescription(/BBB/);
    expect(within(totals).queryByRole("button")).not.toBeInTheDocument();

    const add = screen.getByRole("button", { name: "Add holding" });
    expect(add.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(second).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/^Ticker symbol/)).toHaveValue("BBB");
  });

  it("puts the field legend after the tables", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [{ category: "employerGrantedStock", quantity: 1, priceUSD: 10 }],
      }),
    );
    renderStep("equity");

    const table = await screen.findByRole("table", { name: "ESOP / RSU at a glance" });
    const legend = screen.getByRole("region", { name: "Which fields matter?" });
    expect(table.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no table before any holding is added", async () => {
    renderStep("equity");

    expect(await screen.findByText(/no equity holdings added yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add holding" })).toBeInTheDocument();
  });
});

describe("My Data summary tables — dollar rate", () => {
  const holdings = [{ category: "employerGrantedStock" as const, quantity: 10, priceUSD: 100 }];

  it("values the holdings at the Bank of Israel rate in the profile and names its day", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        usdToIlsRate: { rate: 3.118, date: "2026-10-30" },
        equity: holdings,
      }),
    );
    renderStep("equity");

    const table = await screen.findByRole("table", { name: "ESOP / RSU at a glance" });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(`${SHEKEL}3,118`);
    expect(screen.getByLabelText("Shekels per US dollar")).toHaveValue(3.118);
    expect(screen.getByText(/Bank of Israel rate of 2026-10-30/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use the automatic rate" })).not.toBeInTheDocument();
  });

  it("values the holdings at a rate the user types, keeps it as theirs and offers a way back", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        usdToIlsRate: { rate: 3.118, date: "2026-10-30" },
        equity: holdings,
      }),
    );
    renderStep("equity");

    const rate = await screen.findByLabelText("Shekels per US dollar");
    await user.clear(rate);
    await user.type(rate, "3.5");
    await user.tab();

    const table = screen.getByRole("table", { name: "ESOP / RSU at a glance" });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent(`${SHEKEL}3,500`);
    expect(screen.getByText(/The rate you entered/)).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity).toMatchObject({ usdToIlsRate: 3.5, usdToIlsRateDate: null });
    });

    await user.click(screen.getByRole("button", { name: "Use the automatic rate" }));
    expect(screen.getByLabelText("Shekels per US dollar")).toHaveValue(3.7);
    expect(screen.getByText(/A rough built-in rate/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use the automatic rate" })).not.toBeInTheDocument();
  });

  it("goes back to the automatic rate when the field is emptied", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({ age: 50, usdToIlsRate: { rate: 3.3 }, equity: holdings }),
    );
    renderStep("equity");

    const rate = await screen.findByLabelText("Shekels per US dollar");
    expect(rate).toHaveValue(3.3);
    await user.clear(rate);
    await user.tab();

    expect(screen.getByLabelText("Shekels per US dollar")).toHaveValue(3.7);
    expect(screen.queryByText(/The rate you entered/)).not.toBeInTheDocument();
  });
});
