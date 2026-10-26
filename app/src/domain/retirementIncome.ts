import type { ProfileData } from "../types";
import {
  buildHousehold,
  primaryAgeAtMemberAge,
  resolveRetirementTiming,
  retirementTimingAtAge,
  yearsUntilAge,
  type Household,
  type RetirementTiming,
} from "./household";
import type { RetirementAccessSummary, RetirementIncomeEstimate, RetirementScenario } from "./types";

/** Present value of 1 paid at the end of each of `months` months, at `monthlyRate`. */
function annuityFactor(monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (Math.abs(monthlyRate) < 1e-9) return months;
  return (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
}

interface Stream {
  monthly: number;
  /** Months after household retirement until the payments start. */
  startMonth: number;
  /** Months after household retirement at which the payments stop (the horizon when they last). */
  endMonth: number;
}

interface Spendable {
  value: number;
  /** The primary user's age at which the capital can be spent. */
  unlockAge: number;
  /** Months after household retirement until the capital can be spent (0 = already accessible). */
  unlockMonth: number;
}

/**
 * Estimates the sustainable monthly retirement income (in today's money)
 * that a household's projected savings can provide from the moment the later
 * spouse retires, fully amortized through the planning horizon. A single
 * person is a household of one. This is independent of the user's desired
 * expenses — see `fundingGap.ts` for the comparison against
 * `expenses.retirementMonthly`.
 *
 * Uses the standard annuity/amortization formula so the balance reaches
 * (approximately) zero at the end of the planning horizon, rather than a
 * naive balance-divided-by-months estimate that ignores ongoing growth.
 *
 * Time is counted in months after household retirement. Each member's pot
 * is projected to their own retirement and then keeps growing until the
 * household retires. Two things shape the level S the household can spend
 * every month:
 * - Fixed streams (Bituach Leumi pensions, the spouse supplement, and
 *   accounts converted to an annuity) pay from their start month and, for the
 *   supplement, stop at an end month. Streams that start before household
 *   retirement count from retirement, so earlier payments are ignored.
 * - Locked capital (e.g. a pension fund before age 60) cannot fund spending
 *   before it unlocks.
 *
 * For every month `t` at which something changes (the horizon `M`, each
 * unlock, each stream start or end), the spending needed through `t` must be
 * covered by the capital unlocked before `t` plus the streams paid so far:
 * `S * A(t) - sum(stream * (A(min(t, end)) - A(start))) <= unlocked capital`,
 * where A is the annuity factor. S is the largest value meeting all of them.
 * With nothing locked and no streams, only the horizon constraint remains:
 * the plain amortization.
 */
export function estimateHouseholdRetirementIncome(
  household: Household,
): RetirementIncomeEstimate {
  const { members, rate: annualRate, retirementYears, horizonYears } = household;
  const primary = members[0];

  const monthsInRetirement = Math.round((horizonYears - retirementYears) * 12);
  const horizonMonths = Math.max(monthsInRetirement, 0);
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const monthsAfterRetirement = (yearsFromNow: number) =>
    Math.min(Math.max(Math.round((yearsFromNow - retirementYears) * 12), 0), horizonMonths);

  const streams: Stream[] = [];
  const spendable: Spendable[] = [];
  let accountAnnuityMonthly = 0;
  let netWorthAtRetirement = 0;

  for (const member of members) {
    const monthsFromAge = (age: number) => monthsAfterRetirement(yearsUntilAge(member, age));
    const ownRetirementYears = Math.max(member.retirementAge - member.currentAge, 0);
    // An earlier retiree's pot keeps growing until the household retires.
    const catchUpGrowth = Math.pow(1 + annualRate, retirementYears - ownRetirementYears);

    const { monthlyPension, claimAge, spouseSupplement } = member.bituachLeumi;
    if (monthlyPension > 0) {
      streams.push({
        monthly: monthlyPension,
        startMonth: monthsFromAge(claimAge),
        endMonth: horizonMonths,
      });
    }
    if (spouseSupplement) {
      const startMonth = monthsFromAge(spouseSupplement.startAge);
      const endMonth =
        spouseSupplement.endAge === null ? horizonMonths : monthsFromAge(spouseSupplement.endAge);
      if (endMonth > startMonth) {
        streams.push({ monthly: spouseSupplement.monthly, startMonth, endMonth });
      }
    }

    for (const source of member.sources) {
      const value = source.valueAtRetirement * catchUpGrowth;
      netWorthAtRetirement += value;
      if (source.annuity) {
        accountAnnuityMonthly += source.annuity.monthly;
        streams.push({
          monthly: source.annuity.monthly,
          startMonth: monthsFromAge(source.annuity.startAge),
          endMonth: horizonMonths,
        });
      } else {
        spendable.push({
          value,
          unlockAge: primaryAgeAtMemberAge(household, member, source.unlockAge),
          unlockMonth: Math.max(
            Math.round((yearsUntilAge(member, source.unlockAge) - retirementYears) * 12),
            0,
          ),
        });
      }
    }
  }

  const accessibleAtRetirement = spendable
    .filter((entry) => entry.unlockMonth === 0)
    .reduce((sum, entry) => sum + entry.value, 0);
  const locked = spendable.filter((entry) => entry.unlockMonth > 0 && entry.value > 0);
  const lockedAtRetirement = locked.reduce((sum, entry) => sum + entry.value, 0);

  const access: RetirementAccessSummary = {
    accessibleAtRetirement: Math.round(accessibleAtRetirement),
    lockedAtRetirement: Math.round(lockedAtRetirement),
    nextUnlockAge: locked.length > 0 ? Math.min(...locked.map((entry) => entry.unlockAge)) : null,
    bridgeLimited: false,
    unconstrainedMonthlyIncome: 0,
    limitingAge: null,
    accountAnnuityMonthly: Math.round(accountAnnuityMonthly),
    uncategorizedAccounts: household.uncategorizedAccounts,
  };

  const base = {
    retirementAge: primary.retirementAge,
    householdRetirementAge: household.drawdownStartAge,
    netWorthAtRetirement: Math.round(netWorthAtRetirement),
    bituachLeumi: primary.bituachLeumi,
    members: members.map((member) => ({
      role: member.role,
      currentAge: member.currentAge,
      retirementAge: member.retirementAge,
      bituachLeumi: member.bituachLeumi,
    })),
  };

  if (monthsInRetirement <= 0) {
    return { ...base, monthlyIncomeTodayMoney: 0, access };
  }

  /** The largest level monthly spending that is funded through month `months` of retirement. */
  const sustainableSpendingThrough = (months: number) => {
    const unlockedCapital = spendable
      .filter((entry) => entry.unlockMonth < months)
      .reduce((sum, entry) => sum + entry.value, 0);
    const paidStreams = streams
      .filter((stream) => stream.startMonth < months)
      .reduce(
        (sum, stream) =>
          sum +
          stream.monthly *
            (annuityFactor(monthlyRate, Math.min(months, stream.endMonth)) -
              annuityFactor(monthlyRate, stream.startMonth)),
        0,
      );
    return (unlockedCapital + paidStreams) / annuityFactor(monthlyRate, months);
  };

  const checkpoints = new Set<number>();
  for (const entry of spendable) {
    if (entry.value > 0 && entry.unlockMonth > 0 && entry.unlockMonth < monthsInRetirement) {
      checkpoints.add(entry.unlockMonth);
    }
  }
  for (const stream of streams) {
    for (const month of [stream.startMonth, stream.endMonth]) {
      if (month > 0 && month < monthsInRetirement) {
        checkpoints.add(month);
      }
    }
  }

  const unconstrained = sustainableSpendingThrough(monthsInRetirement);
  let monthlyIncome = unconstrained;
  let limitingMonth = monthsInRetirement;
  for (const months of [...checkpoints].sort((a, b) => a - b)) {
    const candidate = sustainableSpendingThrough(months);
    if (candidate < monthlyIncome) {
      monthlyIncome = candidate;
      limitingMonth = months;
    }
  }

  const bridgeLimited = monthlyIncome < unconstrained - 0.5;
  return {
    ...base,
    monthlyIncomeTodayMoney: Math.round(monthlyIncome),
    access: {
      ...access,
      bridgeLimited,
      unconstrainedMonthlyIncome: Math.round(unconstrained),
      limitingAge: bridgeLimited ? household.drawdownStartAge + limitingMonth / 12 : null,
    },
  };
}

/** `estimateHouseholdRetirementIncome` for the given retirement ages. */
export function estimateRetirementIncomeForTiming(
  profile: ProfileData,
  timing: RetirementTiming,
): RetirementIncomeEstimate {
  return estimateHouseholdRetirementIncome(buildHousehold(profile, timing));
}

/**
 * Estimates the sustainable monthly retirement income if the primary user
 * retires at `retirementAge`. For a couple, the spouse retires at the same
 * moment (their age follows from the age gap).
 */
export function estimateRetirementIncomeAtAge(
  profile: ProfileData,
  retirementAge: number,
): RetirementIncomeEstimate {
  return estimateRetirementIncomeForTiming(profile, retirementTimingAtAge(profile, retirementAge));
}

/** Same as `estimateRetirementIncomeForTiming`, at the retirement ages implied by `scenario`. */
export function estimateRetirementIncome(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): RetirementIncomeEstimate {
  return estimateRetirementIncomeForTiming(profile, resolveRetirementTiming(profile, scenario));
}
