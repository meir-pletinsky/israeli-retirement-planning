import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { IncomeBandKey } from "../../domain";
import { clearAllData, loadProfileFromDb, saveOnboardedToDb, saveProfileToDb } from "../../storage/db";
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
    expect(await screen.findByText(/This is a draft and nothing is saved/)).toBeInTheDocument();
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
