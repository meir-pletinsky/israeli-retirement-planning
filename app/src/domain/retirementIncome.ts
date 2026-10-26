import type { ProfileData } from "../types";
import { estimateBituachLeumiPension } from "./bituachLeumi";
import { MAX_PLANNING_AGE } from "./constants";
import { realAnnualReturnRate, resolveRetirementAge } from "./profileBasics";
import { buildSources, countUncategorizedAccounts } from "./sources";
import type { RetirementAccessSummary, RetirementIncomeEstimate, RetirementScenario } from "./types";

/** Present value of 1 paid at the end of each of `months` months, at `monthlyRate`. */
function annuityFactor(monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (Math.abs(monthlyRate) < 1e-9) return months;
  return (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
}

interface Stream {
  monthly: number;
  /** Months after retirement until the payments start. */
  startMonth: number;
}

interface Spendable {
  value: number;
  unlockAge: number;
  /** Months after retirement until the capital can be spent (0 = already accessible). */
  unlockMonth: number;
}

/**
 * Estimates the sustainable monthly retirement income (in today's money)
 * that the projected savings at `retirementAge` can provide, fully
 * amortized from that age through `MAX_PLANNING_AGE`. This is independent
 * of the user's desired expenses — see `fundingGap.ts` for the comparison
 * against `expenses.retirementMonthly`.
 *
 * Uses the standard annuity/amortization formula so the balance reaches
 * (approximately) zero at the end of the planning horizon, rather than a
 * naive balance-divided-by-months estimate that ignores ongoing growth.
 *
 * Two things shape the level S a person can spend every month:
 * - Fixed streams (the Bituach Leumi pension, and accounts converted to an
 *   annuity) pay from their start month `m`, so savings only fund S before
 *   they start and S minus the stream after.
 * - Locked capital (e.g. a pension fund before age 60) cannot fund spending
 *   before it unlocks.
 *
 * For every month `t` at which something changes (the horizon `M`, each
 * unlock, each stream start), the spending needed through `t` must be
 * covered by the capital unlocked before `t` plus the streams paid so far:
 * `S * A(t) - sum(stream * (A(t) - A(m))) <= unlocked capital`, where A is
 * the annuity factor. S is the largest value meeting all of them. With
 * nothing locked and no streams, only the horizon constraint remains: the
 * plain amortization.
 */
export function estimateRetirementIncomeAtAge(
  profile: ProfileData,
  retirementAge: number,
): RetirementIncomeEstimate {
  const annualRate = realAnnualReturnRate(profile.assumptions);
  const sources = buildSources(profile, retirementAge);
  const bituachLeumi = estimateBituachLeumiPension(profile, retirementAge);
  const netWorthAtRetirement = sources.reduce((sum, source) => sum + source.valueAtRetirement, 0);

  const monthsInRetirement = Math.round((MAX_PLANNING_AGE - retirementAge) * 12);
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const monthsAfterRetirement = (age: number) =>
    Math.min(Math.max(Math.round((age - retirementAge) * 12), 0), Math.max(monthsInRetirement, 0));

  const streams: Stream[] = [];
  if (bituachLeumi.monthlyPension > 0) {
    streams.push({
      monthly: bituachLeumi.monthlyPension,
      startMonth: monthsAfterRetirement(bituachLeumi.claimAge),
    });
  }
  const spendable: Spendable[] = [];
  let accountAnnuityMonthly = 0;
  for (const source of sources) {
    if (source.annuity) {
      accountAnnuityMonthly += source.annuity.monthly;
      streams.push({
        monthly: source.annuity.monthly,
        startMonth: monthsAfterRetirement(source.annuity.startAge),
      });
    } else {
      spendable.push({
        value: source.valueAtRetirement,
        unlockAge: source.unlockAge,
        unlockMonth: Math.max(Math.round((source.unlockAge - retirementAge) * 12), 0),
      });
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
    uncategorizedAccounts: countUncategorizedAccounts(profile),
  };

  if (monthsInRetirement <= 0) {
    return {
      monthlyIncomeTodayMoney: 0,
      retirementAge,
      netWorthAtRetirement: Math.round(netWorthAtRetirement),
      bituachLeumi,
      access,
    };
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
            (annuityFactor(monthlyRate, months) - annuityFactor(monthlyRate, stream.startMonth)),
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
    if (stream.startMonth > 0 && stream.startMonth < monthsInRetirement) {
      checkpoints.add(stream.startMonth);
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
    monthlyIncomeTodayMoney: Math.round(monthlyIncome),
    retirementAge,
    netWorthAtRetirement: Math.round(netWorthAtRetirement),
    bituachLeumi,
    access: {
      ...access,
      bridgeLimited,
      unconstrainedMonthlyIncome: Math.round(unconstrained),
      limitingAge: bridgeLimited ? retirementAge + limitingMonth / 12 : null,
    },
  };
}

/** Same as `estimateRetirementIncomeAtAge`, at the retirement age implied by `scenario`. */
export function estimateRetirementIncome(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): RetirementIncomeEstimate {
  return estimateRetirementIncomeAtAge(profile, resolveRetirementAge(profile, scenario));
}
