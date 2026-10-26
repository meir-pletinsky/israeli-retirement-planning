import {
  buildHousehold,
  resolveRetirementTiming,
  retirementTimingAtAge,
  type Household,
  type RetirementTiming,
} from "./household";
import { futureValueOfMonthlyContributions } from "./contributions";
import { SOURCE_KINDS, type SourceKind } from "./sources";
import type { ProfileData } from "../types";
import type { RetirementScenario } from "./types";

/** Where a fixed monthly payment comes from: an account's annuity (by kind) or the state pension. */
export type PaymentSource = SourceKind | "bituachLeumi";

export const PAYMENT_SOURCES: readonly PaymentSource[] = [...SOURCE_KINDS, "bituachLeumi"];

export interface DrawdownYear {
  /** The primary user's age. For a couple, the spouse is `age` minus the age gap. */
  age: number;
  /** Years from now; the row's position on the household clock. */
  yearsFromNow: number;
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
 * Year-by-year simulation of every source of a household, entirely in
 * today's money:
 * - Every balance grows at the real return; until its owner's retirement age,
 *   ongoing deposits are added each year.
 * - From the moment the later spouse retires, `monthlySpending` is withdrawn
 *   each year, less the fixed streams (Bituach Leumi, the spouse supplement
 *   and account annuities) once they start. It is taken pro rata from the
 *   capital that is unlocked at that point; locked capital cannot fund
 *   spending, so a shortfall is not covered from it.
 * - An account that pays an annuity leaves the spendable pool; its capital
 *   stops counting toward net worth once the annuity starts.
 * - Balances never go negative.
 *
 * The first row is today (no growth or withdrawal), so it equals today's net
 * worth. Row ages are the primary user's.
 */
export function simulateHouseholdDrawdown(
  household: Household,
  monthlySpending: number,
): DrawdownYear[] {
  const { rate, members, retirementYears, horizonYears } = household;
  const annualSpending = monthlySpending * 12;
  const primary = members[0];

  const state = members.flatMap((member) =>
    member.sources.map((source) => ({
      member,
      source,
      balance: source.balance,
      annualContribution: futureValueOfMonthlyContributions(source.monthlyContribution, rate, 1),
    })),
  );

  const rows: DrawdownYear[] = [];
  for (let years = 0; years <= horizonYears; years += 1) {
    if (years > 0) {
      for (const entry of state) {
        const age = entry.member.currentAge + years;
        entry.balance *= 1 + rate;
        if (age <= entry.member.retirementAge) {
          entry.balance += entry.annualContribution;
        }
        if (entry.source.annuity && age >= entry.source.annuity.startAge) {
          entry.balance = 0;
        }
      }
    }

    const streams = { ...emptyByKind(), bituachLeumi: 0 };
    for (const member of members) {
      const age = member.currentAge + years;
      const { claimAge, monthlyPension, spouseSupplement } = member.bituachLeumi;
      if (age >= claimAge) {
        streams.bituachLeumi += monthlyPension;
      }
      if (
        spouseSupplement &&
        age >= spouseSupplement.startAge &&
        (spouseSupplement.endAge === null || age < spouseSupplement.endAge)
      ) {
        streams.bituachLeumi += spouseSupplement.monthly;
      }
    }
    for (const { member, source } of state) {
      if (source.annuity && member.currentAge + years >= source.annuity.startAge) {
        streams[source.kind] += source.annuity.monthly;
      }
    }

    const unlocked = state.filter(
      ({ member, source }) =>
        source.annuity === null && member.currentAge + years >= source.unlockAge,
    );
    const unlockedTotal = unlocked.reduce((sum, entry) => sum + entry.balance, 0);
    const capitalShare = emptyByKind();
    if (unlockedTotal > 0) {
      for (const entry of unlocked) {
        capitalShare[entry.source.kind] += entry.balance / unlockedTotal;
      }
    }

    if (years > 0 && years >= retirementYears && unlockedTotal > 0) {
      const streamsAnnual = PAYMENT_SOURCES.reduce((sum, band) => sum + streams[band], 0) * 12;
      const draw = Math.min(Math.max(annualSpending - streamsAnnual, 0), unlockedTotal);
      for (const entry of unlocked) {
        entry.balance -= (draw * entry.balance) / unlockedTotal;
      }
    }

    rows.push({
      age: primary.currentAge + years,
      yearsFromNow: years,
      netWorth: state.reduce((sum, entry) => sum + entry.balance, 0),
      streams,
      capitalShare,
    });
  }

  return rows;
}

/** `simulateHouseholdDrawdown` for the given retirement ages. */
export function simulateDrawdownForTiming(
  profile: ProfileData,
  timing: RetirementTiming,
  monthlySpending: number,
): DrawdownYear[] {
  return simulateHouseholdDrawdown(buildHousehold(profile, timing), monthlySpending);
}

/**
 * `simulateHouseholdDrawdown` for the primary user retiring at
 * `retirementAge`. For a couple, the spouse retires at the same moment.
 */
export function simulateDrawdown(
  profile: ProfileData,
  retirementAge: number,
  monthlySpending: number,
): DrawdownYear[] {
  return simulateDrawdownForTiming(
    profile,
    retirementTimingAtAge(profile, retirementAge),
    monthlySpending,
  );
}

/** `simulateDrawdownForTiming` at the retirement ages implied by `scenario`. */
export function simulateDrawdownForScenario(
  profile: ProfileData,
  scenario: RetirementScenario,
  monthlySpending: number,
): DrawdownYear[] {
  return simulateDrawdownForTiming(
    profile,
    resolveRetirementTiming(profile, scenario),
    monthlySpending,
  );
}
