import { PLANNING_HORIZON_AGES, type ProfileData } from "../types";
import { simulateHouseholdDrawdown } from "./drawdown";
import { desiredRetirementMonthly } from "./expenses";
import { buildHousehold, resolveRetirementTiming, withPlanningHorizon } from "./household";
import { estimateNetIncomeForHousehold } from "./netIncome";
import { UNMET_TOLERANCE } from "./spendingTest";
import type { RetirementScenario } from "./types";

/** What the plan gives if the household lives to one age, in today's money. */
export interface LongevityRow {
  /** The age of the primary user the plan is run to (the youngest spouse reaches it). */
  age: number;
  /** True for the age the plan uses now (`assumptions.planningHorizonAge`). */
  isPlanned: boolean;
  /** The lowest net monthly income of any retirement year when the savings are sized to last to `age`. */
  netMonthlyIncome: number;
  /** `netMonthlyIncome` minus the plan's own; zero for the planned age, negative when living longer costs income. */
  netMonthlyChange: number;
  /** Net income minus the desired monthly spending; null when no spending is entered. */
  monthlyGap: number | null;
  /**
   * The primary user's age in the first year the usable savings cannot fund the desired
   * spending, when that is before `age`; null when they can, or when no spending is entered.
   */
  runsOutAge: number | null;
}

export interface LongevityTest {
  /** The age the plan runs to now. */
  plannedAge: number;
  /** The desired monthly spending in retirement, or null when none is entered. */
  desiredMonthly: number | null;
  /** One row per planning age, the earliest first. */
  rows: LongevityRow[];
}

/**
 * What living longer than the plan assumes does: the income the savings can sustain to each of
 * the planning ages (`PLANNING_HORIZON_AGES`), and where the desired spending would run out of
 * savings. The same retirement ages, return and tax rules as the plan; only the last age differs.
 * The state pension and any pension annuity are paid for life, so living longer costs income
 * only through the savings being spread over more years.
 */
export function buildLongevityTest(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): LongevityTest {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const desiredSpending = desiredRetirementMonthly(profile.expenses);
  const desiredMonthly = desiredSpending !== null && desiredSpending > 0 ? desiredSpending : null;

  const rows = PLANNING_HORIZON_AGES.map((age): LongevityRow => {
    const atAge = withPlanningHorizon(household, age);
    const netMonthlyIncome = estimateNetIncomeForHousehold(atAge).netMonthlyIncome;
    const short =
      desiredMonthly === null
        ? undefined
        : simulateHouseholdDrawdown(atAge, desiredMonthly, { lean: true }).find(
            (row) => row.unmet > UNMET_TOLERANCE,
          );
    return {
      age,
      isPlanned: age === household.planningHorizonAge,
      netMonthlyIncome,
      netMonthlyChange: 0,
      monthlyGap: desiredMonthly === null ? null : netMonthlyIncome - desiredMonthly,
      runsOutAge: short ? short.age : null,
    };
  });
  const planned = rows.find((row) => row.isPlanned);
  const plannedIncome = planned ? planned.netMonthlyIncome : rows[0].netMonthlyIncome;
  for (const row of rows) row.netMonthlyChange = row.netMonthlyIncome - plannedIncome;
  return { plannedAge: household.planningHorizonAge, desiredMonthly, rows };
}
