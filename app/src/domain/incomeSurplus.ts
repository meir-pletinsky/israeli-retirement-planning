import type { CashFlowPlan } from "./cashFlow";

/**
 * Per month, in shekels: the income bands are rounded one by one, so a year that matches its
 * target can read a few shekels above it.
 */
const ROUNDING_SLACK = 3;

export interface SurplusMeasure {
  /** Income above the planned spending, per month; 0 when it is not above. */
  excess: number;
  /** The excess as a percentage of the planned spending. */
  excessPct: number;
  /** Whether the excess is more than the cap allows. */
  overCap: boolean;
}

/** How far `income` is above the `planned` spending, and whether that is beyond the cap `capPct`. */
export function measureSurplus(income: number, planned: number, capPct: number): SurplusMeasure {
  const excess = Math.max(income - planned, 0);
  return {
    excess,
    excessPct: planned > 0 ? (excess / planned) * 100 : 0,
    overCap: planned > 0 && excess > (planned * capPct) / 100 + ROUNDING_SLACK,
  };
}

export interface SurplusYear extends SurplusMeasure {
  /** The primary user's age. */
  age: number;
  income: number;
  /** The planned spending that year, with the cost of survivors' cover. */
  planned: number;
}

export interface IncomeSurplus {
  capPct: number;
  /** The years in which income is more than the cap above the planned spending. */
  years: SurplusYear[];
  /** The year with the largest excess among them; null when there are none. */
  peak: SurplusYear | null;
}

/**
 * The years of a planned-spending cash flow in which income exceeds the spending by more than
 * `capPct` percent. Withdrawals from savings are sized to the gap between the spending and the
 * payments, so a surplus can only come from payments that start by themselves (annuities and
 * Bituach Leumi), which cannot be reduced; starting them later is what lowers it.
 */
export function incomeSurplus(plan: CashFlowPlan, capPct: number): IncomeSurplus {
  const years = plan.years.flatMap((year): SurplusYear[] => {
    const planned = year.spending + year.cover;
    const measure = measureSurplus(year.income, planned, capPct);
    return measure.overCap ? [{ ...measure, age: year.age, income: year.income, planned }] : [];
  });
  const peak = years.reduce<SurplusYear | null>((best, year) => (!best || year.excess > best.excess ? year : best), null);
  return { capPct, years, peak };
}
