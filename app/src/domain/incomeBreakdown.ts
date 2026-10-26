import type { ProfileData } from "../types";
import { simulateHouseholdDrawdown } from "./drawdown";
import { buildHousehold, resolveRetirementTiming, type RetirementTiming } from "./household";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import { SOURCE_KINDS, type SourceKind } from "./sources";
import type { RetirementScenario } from "./types";

/** Monthly retirement income at one age, split by where it comes from (today's money). */
export interface IncomeBreakdownPoint {
  age: number;
  pensionFund: number;
  providentFund: number;
  managersInsurance: number;
  studyFund: number;
  /** Non-pension investments: `otherAssets` and equity holdings. */
  investments: number;
  bituachLeumi: number;
}

export type IncomeBandKey = Exclude<keyof IncomeBreakdownPoint, "age">;

/** Display order of the bands, bottom to top in the chart. */
export const INCOME_BAND_KEYS: readonly IncomeBandKey[] = [
  "pensionFund",
  "providentFund",
  "managersInsurance",
  "studyFund",
  "investments",
  "bituachLeumi",
];

/** `otherInvestments` is called `investments` in the income bands. */
const BAND_FOR_KIND: Record<SourceKind, IncomeBandKey> = {
  pensionFund: "pensionFund",
  providentFund: "providentFund",
  managersInsurance: "managersInsurance",
  studyFund: "studyFund",
  otherInvestments: "investments",
};

/**
 * Splits the estimated sustainable monthly retirement income (see
 * `retirementIncome.ts`) by source and age, using the same year-by-year
 * simulation as the net-worth projection (see `drawdown.ts`):
 * - The Bituach Leumi pension (with any spouse supplement) and account
 *   annuities are their own bands from their start age on.
 * - The rest is paid from savings, split across each kind in proportion to
 *   the capital that is unlocked at that age. Capital that is still locked
 *   (e.g. a pension fund before age 60) does not contribute until it opens,
 *   so the mix shifts at each unlock.
 * There is no withdrawal ordering or tax optimisation yet (Phase 3 scope —
 * see docs/plan.md), so unlocked kinds are drawn on pro rata.
 *
 * Points start when the household retires (the later spouse) and are
 * labelled with the primary user's age.
 */
export function estimateIncomeBreakdownForTiming(
  profile: ProfileData,
  timing: RetirementTiming,
): IncomeBreakdownPoint[] {
  const household = buildHousehold(profile, timing);
  const { monthlyIncomeTodayMoney } = estimateHouseholdRetirementIncome(household);
  const rows = simulateHouseholdDrawdown(household, monthlyIncomeTodayMoney);

  const points: IncomeBreakdownPoint[] = [];
  // When all unlocked capital has been used up (the last year of a fully
  // amortized plan) keep showing the previous mix rather than an empty bar.
  let lastShares = rows[0].capitalShare;
  for (let index = Math.ceil(household.retirementYears); index < rows.length; index += 1) {
    const row = rows[index];
    const hasCapital = SOURCE_KINDS.some((kind) => row.capitalShare[kind] > 0);
    const shares = hasCapital ? row.capitalShare : lastShares;
    lastShares = shares;

    const point: IncomeBreakdownPoint = {
      age: row.age,
      pensionFund: 0,
      providentFund: 0,
      managersInsurance: 0,
      studyFund: 0,
      investments: 0,
      bituachLeumi: Math.round(row.streams.bituachLeumi),
    };
    let streamsTotal = point.bituachLeumi;
    for (const kind of SOURCE_KINDS) {
      point[BAND_FOR_KIND[kind]] = Math.round(row.streams[kind]);
      streamsTotal += point[BAND_FOR_KIND[kind]];
    }

    const fromSavings = Math.max(monthlyIncomeTodayMoney - streamsTotal, 0);
    const shareTotal = SOURCE_KINDS.reduce((sum, kind) => sum + shares[kind], 0);
    if (fromSavings > 0 && shareTotal > 0) {
      const draws = SOURCE_KINDS.map((kind) => ({
        kind,
        amount: Math.round(fromSavings * (shares[kind] / shareTotal)),
        share: shares[kind],
      }));
      const largest = draws.reduce((best, draw) => (draw.share > best.share ? draw : best));
      largest.amount += fromSavings - draws.reduce((sum, draw) => sum + draw.amount, 0);
      for (const draw of draws) {
        point[BAND_FOR_KIND[draw.kind]] += draw.amount;
      }
    }
    points.push(point);
  }
  return points;
}

/** `estimateIncomeBreakdownForTiming` at the retirement ages implied by `scenario`. */
export function estimateIncomeBreakdown(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): IncomeBreakdownPoint[] {
  return estimateIncomeBreakdownForTiming(profile, resolveRetirementTiming(profile, scenario));
}
