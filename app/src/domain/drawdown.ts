import { estimateBituachLeumiPension } from "./bituachLeumi";
import { MAX_PLANNING_AGE } from "./constants";
import { futureValueOfMonthlyContributions } from "./contributions";
import { realAnnualReturnRate, resolveCurrentAge } from "./profileBasics";
import { buildSources, SOURCE_KINDS, type SourceKind } from "./sources";
import type { ProfileData } from "../types";

/** Where a fixed monthly payment comes from: an account's annuity (by kind) or the state pension. */
export type PaymentSource = SourceKind | "bituachLeumi";

export const PAYMENT_SOURCES: readonly PaymentSource[] = [...SOURCE_KINDS, "bituachLeumi"];

export interface DrawdownYear {
  age: number;
  /** Total of all sources at the end of this year, in today's money (unrounded). */
  netWorth: number;
  /** Fixed monthly payments active at this age (state pension and account annuities), by band. */
  streams: Record<PaymentSource, number>;
  /**
   * Each kind's share of the spendable (unlocked, not annuitized) capital
   * before this year's withdrawal. Sums to 1, or is all 0 when no capital is
   * accessible at this age.
   */
  capitalShare: Record<SourceKind, number>;
}

const emptyByKind = (): Record<SourceKind, number> => ({
  pensionFund: 0,
  providentFund: 0,
  managersInsurance: 0,
  studyFund: 0,
  otherInvestments: 0,
});

/**
 * Year-by-year simulation of every source, entirely in today's money:
 * - Every balance grows at the real return; until `retirementAge`, ongoing
 *   deposits are added each year.
 * - From `retirementAge`, `monthlySpending` is withdrawn each year, less the
 *   fixed streams (Bituach Leumi and account annuities) once they start. It is
 *   taken pro rata from the capital that is unlocked at that age; locked
 *   capital cannot fund spending, so a shortfall is not covered from it.
 * - An account that pays an annuity leaves the spendable pool; its capital
 *   stops counting toward net worth once the annuity starts.
 * - Balances never go negative.
 *
 * The first row is the current age (no growth or withdrawal), so it equals
 * today's net worth.
 */
export function simulateDrawdown(
  profile: ProfileData,
  retirementAge: number,
  monthlySpending: number,
): DrawdownYear[] {
  const currentAge = resolveCurrentAge(profile);
  const rate = realAnnualReturnRate(profile.assumptions);
  const annualSpending = monthlySpending * 12;
  const bituachLeumi = estimateBituachLeumiPension(profile, retirementAge);

  const state = buildSources(profile, retirementAge).map((source) => ({
    source,
    balance: source.balance,
    annualContribution: futureValueOfMonthlyContributions(source.monthlyContribution, rate, 1),
  }));

  const rows: DrawdownYear[] = [];
  for (let age = currentAge; age <= Math.max(MAX_PLANNING_AGE, currentAge); age += 1) {
    if (age > currentAge) {
      for (const entry of state) {
        entry.balance *= 1 + rate;
        if (age <= retirementAge) {
          entry.balance += entry.annualContribution;
        }
        if (entry.source.annuity && age >= entry.source.annuity.startAge) {
          entry.balance = 0;
        }
      }
    }

    const streams = { ...emptyByKind(), bituachLeumi: 0 };
    if (age >= bituachLeumi.claimAge) {
      streams.bituachLeumi = bituachLeumi.monthlyPension;
    }
    for (const { source } of state) {
      if (source.annuity && age >= source.annuity.startAge) {
        streams[source.kind] += source.annuity.monthly;
      }
    }

    const unlocked = state.filter(
      ({ source }) => source.annuity === null && age >= source.unlockAge,
    );
    const unlockedTotal = unlocked.reduce((sum, entry) => sum + entry.balance, 0);
    const capitalShare = emptyByKind();
    if (unlockedTotal > 0) {
      for (const entry of unlocked) {
        capitalShare[entry.source.kind] += entry.balance / unlockedTotal;
      }
    }

    if (age > currentAge && age >= retirementAge && unlockedTotal > 0) {
      const streamsAnnual = PAYMENT_SOURCES.reduce((sum, band) => sum + streams[band], 0) * 12;
      const draw = Math.min(Math.max(annualSpending - streamsAnnual, 0), unlockedTotal);
      for (const entry of unlocked) {
        entry.balance -= (draw * entry.balance) / unlockedTotal;
      }
    }

    rows.push({
      age,
      netWorth: state.reduce((sum, entry) => sum + entry.balance, 0),
      streams,
      capitalShare,
    });
  }

  return rows;
}
