import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { buildTaxByAge } from "../domain";
import i18n from "../i18n";
import { formatNumber } from "../i18n/formatters";
import { buildTestProfile } from "../test/domainFixtures";
import { TaxByAgeCard } from "./TaxByAgeCard";

type Profile = Parameters<typeof buildTestProfile>[0];

function renderCard(overrides: Profile) {
  render(<TaxByAgeCard taxByAge={buildTaxByAge(buildTestProfile(overrides))} />);
}

const man = { age: 50, gender: "male" as const, retirementAge: 60 };
afterEach(async () => {
  await act(async () => { await i18n.changeLanguage("en"); });
});

describe("TaxByAgeCard", () => {
  it("renders nothing when there are no accounts at all", () => {
    renderCard({ ...man });

    expect(screen.queryByRole("heading", { name: /taxed at different ages/ })).not.toBeInTheDocument();
  });

  it("keeps each account collapsed until it is opened", async () => {
    renderCard({
      ...man,
      pensionBalances: [800_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
    });

    const account = screen.getByRole("group", { name: "Test Provider" });
    expect(account).not.toHaveAttribute("open");
    await userEvent.click(within(account).getByRole("heading", { name: "Test Provider" }));
    expect(account).toHaveAttribute("open");
  });

  it("shows each part of a pension fund with its rates by age band, as percentages", () => {
    renderCard({
      ...man,
      pensionBalances: [800_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
    });

    expect(screen.getByRole("heading", { name: "How each account is taxed at different ages" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Test Provider" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /From age .*67.* \(statutory retirement age\)/ })).toBeInTheDocument();
    expect(screen.getByText("Pension savings")).toBeInTheDocument();
    expect(screen.getByText("Severance pay")).toBeInTheDocument();
    expect(screen.getAllByText("Monthly annuity")).toHaveLength(3);
    expect(screen.getAllByText("Lump sum")).toHaveLength(3);
    expect(screen.getAllByText(/3\.23.5\.17%.*National Insurance of .*1\.02.6\.79%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/67%.*of the qualifying-annuity ceiling.*2043.*taxable balance .*10.47%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/higher of .*35%.* and your marginal rate/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/13,750.*per year of service \(2026\)/).length).toBeGreaterThan(0);
  });

  it("explains payment-year exemptions without evidence badges or sources", () => {
    renderCard({
      age: 66,
      gender: "male",
      retirementAge: 67,
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ productCategory: "managersInsurance" }],
    });

    expect(screen.queryByText(/unverified|secondary sources|not verified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/exemption follows the payment tax year, not the year you retired/)).toBeInTheDocument();
    expect(screen.getAllByText(/5,306.*a month \(2026\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/does not say how its balance splits/)).toBeInTheDocument();
  });

  it.each(["en", "he", "ru"])("renders study-fund limits and restricts the 3-year age route in %s", async (language) => {
    await i18n.changeLanguage(language);
    renderCard({
      ...man,
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ productCategory: "studyFund" }],
    });

    const table = screen.getByRole("table");
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell");
    const threeYearRule = i18n.t("myData.steps.pensionSavings.taxByAge.condition.studyFundThreeYearsFromStatutory");
    expect(within(cells[1]).queryByText(threeYearRule)).not.toBeInTheDocument();
    expect(within(cells[2]).queryByText(threeYearRule)).not.toBeInTheDocument();
    expect(within(cells[3]).getByText(threeYearRule)).toBeInTheDocument();
    const card = screen.getByRole("region");
    for (const limit of [15_712, 18_854, 20_566, 13_203]) {
      expect(card).toHaveTextContent(formatNumber(limit).replace(/\u00a0/g, " "));
    }
    expect(card.textContent).not.toContain("{{");
  });

  it("gives each spouse's account the age band of its own owner", () => {
    renderCard({
      ...man,
      maritalStatus: "married",
      spouse: { age: 56, gender: "female", retirementAge: 60 },
      pensionBalances: [100_000, 100_000],
      pensionAccountOverrides: [
        { owner: "self", productCategory: "studyFund" },
        { owner: "spouse", productCategory: "studyFund" },
      ],
    });

    const groups = screen.getAllByRole("group", { name: "Test Provider" });
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByRole("columnheader", { name: /From age .*67/ })).toBeInTheDocument();
    expect(within(groups[1]).getByRole("columnheader", { name: /From age .*65/ })).toBeInTheDocument();
  });

  it("says how many accounts have no product type and are left out", () => {
    renderCard({
      ...man,
      pensionBalances: [100_000, 100_000],
      pensionAccountOverrides: [{ productCategory: "studyFund" }, { productCategory: null }],
    });

    expect(screen.getByText(/Accounts without a product type are not shown/)).toBeInTheDocument();
  });

  it("still points out accounts without a product type when none has rules to show", () => {
    renderCard({
      ...man,
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ productCategory: null }],
    });

    expect(screen.getByRole("heading", { name: "How each account is taxed at different ages" })).toBeInTheDocument();
    expect(screen.getByText(/Accounts without a product type are not shown \(1\)/)).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
