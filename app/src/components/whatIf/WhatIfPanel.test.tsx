import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { IncomeBandKey } from "../../domain";
import {
  clearAllData,
  loadProfileFromDb,
  loadWhatIfDraftFromDb,
  saveOnboardedToDb,
  saveProfileToDb,
  saveWhatIfDraftToDb,
} from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { WhatIfPanel } from "./WhatIfPanel";

const bandLabels: Record<IncomeBandKey, string> = {
  pensionFund: "Pension Fund",
  providentFund: "Provident Fund",
  managersInsurance: "Managers' insurance",
  studyFund: "Study fund",
  investments: "Investments",
  bituachLeumi: "Bituach Leumi",
};

async function renderPanel() {
  await saveProfileToDb(
    buildTestProfile({
      age: 50,
      retirementAge: 60,
      pensionBalances: [800_000],
      otherAssets: 200_000,
      retirementMonthlyExpenses: 0,
      investmentReturnPct: 4,
      inflationPct: 2,
    }),
  );
  await saveOnboardedToDb(true);
  renderWithProviders(<WhatIfPanel bandLabels={bandLabels} />);
  return screen.findByLabelText("You stop working at age");
}

async function renderPensionPanel() {
  await saveProfileToDb(
    buildTestProfile({
      age: 50,
      retirementAge: 62,
      pensionBalances: [800_000],
      pensionAccountOverrides: [
        {
          productCategory: "comprehensivePension",
          annuityParameters: {
            hasGuaranteedFactor: false,
            conversionFactor: 200,
            estimatedMonthlyAnnuity: null,
            annuityTaxType: null,
            guaranteedPaymentMonths: null,
          },
        },
      ],
      retirementMonthlyExpenses: 6_000,
      investmentReturnPct: 4,
      inflationPct: 2,
    }),
  );
  await saveOnboardedToDb(true);
  renderWithProviders(<WhatIfPanel bandLabels={bandLabels} />);
  return screen.findByLabelText("Your pension payments start at age");
}

async function renderMixPanel(held: { esop: boolean; studyFund: boolean }) {
  await saveProfileToDb(
    buildTestProfile({
      age: 50,
      retirementAge: 62,
      pensionBalances: held.studyFund ? [800_000, 300_000] : [800_000],
      pensionAccountOverrides: [
        {
          productCategory: "comprehensivePension",
          annuityParameters: {
            hasGuaranteedFactor: true,
            conversionFactor: null,
            estimatedMonthlyAnnuity: 5_000,
            annuityTaxType: null,
            guaranteedPaymentMonths: null,
          },
        },
        ...(held.studyFund ? [{ productCategory: "studyFund" as const }] : []),
      ],
      otherAssets: 300_000,
      bankDeposits: [{ amount: 200_000, bankName: "Leumi" }],
      equity: held.esop ? [{ quantity: 1_000, priceUSD: 100, employerGrant: {} }] : [],
      usdToIlsRate: { rate: 3.6 },
      retirementMonthlyExpenses: 8_000,
      investmentReturnPct: 4,
      inflationPct: 2,
    }),
  );
  await saveOnboardedToDb(true);
  renderWithProviders(<WhatIfPanel bandLabels={bandLabels} />);
  return screen.findByLabelText("Income may exceed spending by");
}

async function renderSurplusPanel(monthlySpending: number) {
  await saveProfileToDb(
    buildTestProfile({
      age: 50,
      retirementAge: 62,
      pensionBalances: [800_000],
      pensionAccountOverrides: [
        {
          productCategory: "comprehensivePension",
          annuityParameters: {
            hasGuaranteedFactor: true,
            conversionFactor: null,
            estimatedMonthlyAnnuity: 5_000,
            annuityTaxType: null,
            guaranteedPaymentMonths: null,
          },
        },
      ],
      otherAssets: 300_000,
      retirementMonthlyExpenses: monthlySpending,
      investmentReturnPct: 4,
      inflationPct: 2,
    }),
  );
  await saveOnboardedToDb(true);
  renderWithProviders(<WhatIfPanel bandLabels={bandLabels} />);
  return screen.findByLabelText("Income may exceed spending by");
}

beforeEach(async () => {
  await clearAllData();
});

describe("WhatIfPanel", () => {
  it("warns when pension payments alone pay more than the spending allows, until the allowance is raised", async () => {
    const cap = await renderSurplusPanel(4_500);

    expect(cap).toHaveValue("5");
    expect(await screen.findByText(/your income (is|goes) more than/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be reduced/)).toBeInTheDocument();

    fireEvent.change(cap, { target: { value: "25" } });
    await waitFor(() => expect(screen.queryByText(/your income (is|goes) more than/)).not.toBeInTheDocument());
  });

  it("leaves the cap out when no spending is planned", async () => {
    await renderPanel();

    expect(screen.queryByLabelText("Income may exceed spending by")).not.toBeInTheDocument();
  });

  it("shows what bears on a withdrawal in the year's sources", async () => {
    const user = userEvent.setup();
    await renderSurplusPanel(8_000);
    await user.click(screen.getByRole("button", { name: "Where this year's income comes from" }));

    expect((await screen.findAllByText("Planned spending")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Drawing order:/)).toBeInTheDocument();
    expect((await screen.findAllByText("In shekels")).length).toBeGreaterThan(0);
  });

  it("shows the estimated tax by year below the income chart, and follows the basis", async () => {
    const user = userEvent.setup();
    await renderSurplusPanel(8_000);

    const income = await screen.findByRole("region", { name: "Monthly income by year" });
    const tax = screen.getByRole("region", { name: "Estimated tax by year" });
    expect(income.compareDocumentPosition(tax) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(income).getByText("before tax", { selector: "strong" })).toBeInTheDocument();
    expect(within(tax).getByText(/^Tax peaks at/)).toBeInTheDocument();

    await user.click(within(tax).getByRole("button", { name: "Show as table" }));
    const table = within(tax).getByRole("table", { name: "Estimated tax by year" });
    expect(table.querySelectorAll("tbody tr").length).toBeGreaterThan(5);
    expect(within(table).getByRole("columnheader", { name: "Estimated tax" })).toBeInTheDocument();

    const planned = table.textContent;
    await user.click(screen.getByRole("button", { name: "Sustainable income" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "Estimated tax by year" })).queryByRole("table")?.textContent,
      ).not.toBe(planned),
    );
  });

  it("splits the withdrawals between the kinds the plan holds and saves the mix", async () => {
    const user = userEvent.setup();
    await renderMixPanel({ esop: true, studyFund: true });
    expect(screen.queryByLabelText("Study fund")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Your mix" }));
    const studyFund = screen.getByLabelText("Study fund");
    fireEvent.change(studyFund, { target: { value: "60" } });

    expect(studyFund).toHaveValue("60");
    expect(screen.getByLabelText("ESOP (employer shares)")).toHaveValue("0");
    expect(screen.getByLabelText("ESPP, private & other shares")).toHaveValue("20");
    expect(screen.getByLabelText("Bank deposits")).toHaveValue("20");
    expect(
      screen.getByRole("img", {
        name: "Study fund 60%, ESOP (employer shares) 0%, ESPP, private & other shares 20%, Bank deposits 20%",
      }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Bank deposits"), { target: { value: "100" } });
    expect(studyFund).toHaveValue("0");
    expect(screen.getByLabelText("ESPP, private & other shares")).toHaveValue("0");

    await user.click(screen.getByRole("button", { name: "Apply to my plan" }));
    await waitFor(async () => {
      const saved = (await loadProfileFromDb())?.assumptions;
      expect(saved?.withdrawalStrategy).toBe("custom");
      expect(saved?.withdrawalMix).toEqual({ studyFund: 0, esop: 0, shares: 0, deposits: 100 });
    });
  });

  it("offers the tax-smart bridge only with employer shares, and saves the mode chosen for it", async () => {
    const user = userEvent.setup();
    await renderMixPanel({ esop: true, studyFund: false });
    expect(screen.queryByRole("radio", { name: /^Match my spending/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/This app is not a tax adviser/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Tax-smart bridge" }));
    expect(screen.getByRole("radio", { name: /^Match my spending/ })).toBeChecked();
    expect(screen.getByText(/This app is not a tax adviser/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /^Zero income tax/ }));
    await user.click(screen.getByRole("button", { name: "Apply to my plan" }));
    await waitFor(async () => {
      const saved = (await loadProfileFromDb())?.assumptions;
      expect(saved?.withdrawalStrategy).toBe("taxSmart");
      expect(saved?.bridgeMode).toBe("zeroTax");
    });
  });

  it("offers selling once a year with employer shares, and saves the choice", async () => {
    const user = userEvent.setup();
    await renderMixPanel({ esop: true, studyFund: false });

    await user.click(screen.getByRole("checkbox", { name: /^Sell once a year, in January/ }));
    await user.click(screen.getByRole("button", { name: "Apply to my plan" }));
    await waitFor(async () => {
      expect((await loadProfileFromDb())?.assumptions.lumpSumSales).toBe(true);
    });
  });

  it("leaves the once-a-year choice out when the plan holds no employer shares", async () => {
    await renderMixPanel({ esop: false, studyFund: false });

    expect(screen.queryByRole("checkbox", { name: /^Sell once a year/ })).not.toBeInTheDocument();
  });

  it("leaves the tax-smart bridge out when the plan holds no employer shares", async () => {
    await renderMixPanel({ esop: false, studyFund: false });

    expect(screen.queryByRole("radio", { name: "Tax-smart bridge" })).not.toBeInTheDocument();
  });

  it("offers a slider only for the kinds of savings the plan holds", async () => {
    const user = userEvent.setup();
    await renderMixPanel({ esop: false, studyFund: false });
    await user.click(screen.getByRole("radio", { name: "Your mix" }));

    expect(screen.getByLabelText("ESPP, private & other shares")).toBeInTheDocument();
    expect(screen.getByLabelText("Bank deposits")).toBeInTheDocument();
    expect(screen.queryByLabelText("ESOP (employer shares)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Study fund")).not.toBeInTheDocument();
  });

  it("leaves the mix out when the plan holds only one kind of savings", async () => {
    const user = userEvent.setup();
    await renderSurplusPanel(8_000);
    await user.click(screen.getByRole("radio", { name: "Your mix" }));

    expect(screen.queryByLabelText("ESPP, private & other shares")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Bank deposits")).not.toBeInTheDocument();
  });

  it("starts on the saved plan with nothing to apply", async () => {
    const slider = await renderPanel();

    expect(slider).toHaveValue("60");
    expect(screen.getByText(/This is your saved plan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply to my plan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset to my plan" })).toBeDisabled();
  });

  it("keeps a moved slider as a draft until it is applied", async () => {
    const user = userEvent.setup();
    const slider = await renderPanel();

    fireEvent.change(slider, { target: { value: "64" } });

    expect(slider).toHaveValue("64");
    expect(await screen.findByText(/This is a draft and your plan is unchanged/)).toBeInTheDocument();
    expect((await loadProfileFromDb())?.personal.retirementAge).toBe(60);

    await user.click(screen.getByRole("button", { name: "Apply to my plan" }));

    expect(await screen.findByText("Saved to your plan.")).toBeInTheDocument();
    await waitFor(async () => expect((await loadProfileFromDb())?.personal.retirementAge).toBe(64));
    expect(screen.getByRole("button", { name: "Apply to my plan" })).toBeDisabled();
  });

  it("goes back to the saved plan on reset", async () => {
    const user = userEvent.setup();
    const slider = await renderPanel();

    fireEvent.change(slider, { target: { value: "56" } });
    await user.click(screen.getByRole("button", { name: "Reset to my plan" }));

    expect(slider).toHaveValue("60");
    expect(await screen.findByText(/This is your saved plan/)).toBeInTheDocument();
    expect((await loadProfileFromDb())?.personal.retirementAge).toBe(60);
  });

  it("keeps the draft apart from the plan and brings it back when the tab is opened again", async () => {
    const user = userEvent.setup();
    const slider = await renderPanel();

    fireEvent.change(slider, { target: { value: "64" } });
    await waitFor(async () =>
      expect(await loadWhatIfDraftFromDb()).toMatchObject({ overrides: { retirementAge: 64 } }),
    );
    expect((await loadProfileFromDb())?.personal.retirementAge).toBe(60);

    cleanup();
    renderWithProviders(<WhatIfPanel bandLabels={bandLabels} />);
    expect(await screen.findByLabelText("You stop working at age")).toHaveValue("64");
    expect(screen.getByText(/This is a draft/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset to my plan" }));
    await waitFor(async () => expect(await loadWhatIfDraftFromDb()).toBeNull());
  });

  it("brings the draft's view choices back too, and pulls a value the plan no longer allows into range", async () => {
    await saveWhatIfDraftToDb({ overrides: { retirementAge: 200 }, basis: "sustainable", column: "monthlySpending" });
    await renderSurplusPanel(8_000);

    expect(await screen.findByLabelText("You stop working at age")).toHaveValue("72");
    expect(screen.getByRole("button", { name: "Sustainable income" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers a pension start age only when an annuity can be delayed", async () => {
    await renderPanel();

    expect(screen.queryByLabelText("Your pension payments start at age")).not.toBeInTheDocument();
  });

  it("lets the pension start later than retirement and follows retirement otherwise", async () => {
    const user = userEvent.setup();
    const pension = await renderPensionPanel();
    const retirement = screen.getByLabelText("You stop working at age");

    expect(pension).toHaveValue("62");
    expect(pension).toHaveAttribute("min", "62");

    fireEvent.change(pension, { target: { value: "67" } });
    expect(pension).toHaveValue("67");
    expect(await screen.findByText(/Annuities start at age/)).toBeInTheDocument();

    fireEvent.change(retirement, { target: { value: "65" } });
    expect(pension).toHaveValue("67");
    fireEvent.change(retirement, { target: { value: "68" } });
    expect(pension).toHaveValue("68");

    fireEvent.change(retirement, { target: { value: "62" } });
    fireEvent.change(pension, { target: { value: "66" } });
    await user.click(screen.getByRole("button", { name: "Apply to my plan" }));
    await waitFor(async () => expect((await loadProfileFromDb())?.personal.pensionStartAge).toBe(66));
  });

  it("traces one year of income to the accounts and savings behind it", async () => {
    const user = userEvent.setup();
    await renderPanel();

    const toggle = screen.getByRole("button", { name: "Where this year's income comes from" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Year")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const heading = (age: number) =>
      screen.getByRole("heading", { name: new RegExp(`^Monthly income at age \\u2066?${age}\\u2069?$`) });
    await screen.findByLabelText("Year");
    expect(heading(60)).toBeInTheDocument();
    expect(screen.getByText("Total, before tax")).toBeInTheDocument();
    expect(screen.getAllByText("Test Provider").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash and other assets")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Year"), "65");

    expect(heading(65)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous year" }));
    expect(heading(64)).toBeInTheDocument();
  });
});
