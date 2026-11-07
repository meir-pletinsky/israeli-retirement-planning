import {
  INCOME_BAND_KEYS,
  recurringAmount,
  type IncomeBandKey,
  type IncomeBreakdownPoint,
} from "./incomeBreakdown";

/** A recurring payment keeps arriving; a withdrawal is taken out of savings capital. */
export type IncomeKind = "payment" | "withdrawal";

export interface IncomeCompositionPart {
  band: IncomeBandKey;
  kind: IncomeKind;
  /** Monthly, before tax, in today's money. */
  monthly: number;
}

/** What one retirement year pays, by source. */
export interface IncomeCompositionStage {
  /** The primary user's age. */
  age: number;
  /**
   * The first year with income, or the first year the lifelong payments (Bituach Leumi and any
   * pension annuity) are all paying when that is later.
   */
  reason: "retirement" | "payments";
  /** Payments first, then withdrawals, each in the display order of the income bands. */
  parts: IncomeCompositionPart[];
  /** The sum of `parts`: what the year pays each month. */
  total: number;
}

const paymentsTotal = (point: IncomeBreakdownPoint): number =>
  INCOME_BAND_KEYS.reduce((sum, band) => sum + recurringAmount(point, band), 0);

const stageOf = (point: IncomeBreakdownPoint, reason: IncomeCompositionStage["reason"]): IncomeCompositionStage => {
  const parts: IncomeCompositionPart[] = [];
  for (const band of INCOME_BAND_KEYS) {
    const monthly = recurringAmount(point, band);
    if (monthly > 0) parts.push({ band, kind: "payment", monthly });
  }
  for (const band of INCOME_BAND_KEYS) {
    const monthly = point.withdrawn[band];
    if (monthly > 0) parts.push({ band, kind: "withdrawal", monthly });
  }
  return { age: point.age, reason, parts, total: parts.reduce((sum, part) => sum + part.monthly, 0) };
};

/**
 * Where the monthly income comes from in the first retirement year that has any, and, when the
 * lifelong payments are not all paying yet, in the first year they are (the state pension and
 * pension annuities start at different ages). The split is the same as the Projections
 * timeline's, so each total is that period's gross income there. Empty when no income is
 * estimated.
 */
export function buildIncomeComposition(points: IncomeBreakdownPoint[]): IncomeCompositionStage[] {
  const first = points.find((point) => INCOME_BAND_KEYS.some((band) => point[band] > 0));
  if (!first) return [];
  const stages = [stageOf(first, "retirement")];
  const fullPayments = Math.max(...points.map(paymentsTotal));
  const allPaying = points.find((point) => paymentsTotal(point) === fullPayments);
  if (fullPayments > 0 && allPaying && allPaying.age > first.age) {
    stages.push(stageOf(allPaying, "payments"));
  }
  return stages;
}
