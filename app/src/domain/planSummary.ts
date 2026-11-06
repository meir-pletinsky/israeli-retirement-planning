import {
  profileSectionHasData,
  type ProfileData,
  type ProfileSection,
} from "../types";
import { desiredRetirementMonthly } from "./expenses";

/** What a plan holds, in the terms a user would use to recognise it. */
export interface PlanSummary {
  age: number | null;
  retirementAge: number | null;
  hasSpouse: boolean;
  pensionAccounts: number;
  holdings: number;
  bankDeposits: number;
  expenseItems: number;
  /** Desired monthly spending in retirement, in today's money. */
  retirementMonthly: number | null;
}

export function summarizePlan(profile: ProfileData): PlanSummary {
  return {
    age: profile.personal.age,
    retirementAge: profile.personal.retirementAge,
    hasSpouse: profile.personal.maritalStatus === "married" && profile.spouse.age !== null,
    pensionAccounts: profile.pensionSavings.accounts.length,
    holdings: profile.equity.holdings.length,
    bankDeposits: profile.bankDeposits.length,
    expenseItems: profile.expenses.items.length,
    retirementMonthly: desiredRetirementMonthly(profile.expenses),
  };
}

/** The pages of the plan, as the user meets them in My Data. */
export type PlanArea =
  | "personal"
  | "pensionSavings"
  | "equity"
  | "bankDeposits"
  | "expenses"
  | "assumptions";

const AREA_SECTIONS: Record<PlanArea, readonly ProfileSection[]> = {
  personal: ["personal", "spouse", "taxExemptionBasket", "bituachLeumi"],
  pensionSavings: ["pensionSavings"],
  equity: ["equity"],
  bankDeposits: ["bankDeposits"],
  expenses: ["expenses"],
  assumptions: ["assumptions"],
};

/**
 * The areas of the current plan that hold data the file has nothing for. Importing replaces the
 * whole plan, so those areas end up empty.
 */
export function areasEmptiedByImport(
  current: ProfileData,
  fileSections: readonly ProfileSection[],
): PlanArea[] {
  return (Object.keys(AREA_SECTIONS) as PlanArea[]).filter((area) =>
    AREA_SECTIONS[area].some(
      (section) => profileSectionHasData(current, section) && !fileSections.includes(section),
    ),
  );
}
