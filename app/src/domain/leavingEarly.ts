import type { ProfileData } from "../types";
import { resolveRetirementTiming, selfProfileView } from "./household";
import { estimateNetIncomeForTiming } from "./netIncome";
import { resolveCurrentAge, usdToIlsRate } from "./profileBasics";
import { engineNowMs } from "./trace";
import type { RetirementScenario } from "./types";
import {
  batchStatusAtRetirement,
  employerShareBatches,
  isEmployerGrant,
  momentAfterYears,
} from "./vesting";

const MS_PER_MONTH = (365.25 * 24 * 60 * 60 * 1000) / 12;

/** What staying until the next batch vests would add. */
export interface NextVestGain {
  /** ISO date of the next batch to vest after the owner leaves. */
  vestDate: string;
  /** Whole months from the retirement date to that date, rounded up. */
  monthsLater: number;
  /** Shares that vest on that date and so would be kept. */
  shares: number;
  /** What they are worth at today's share price, before tax, in ILS. */
  value: number;
  /** How much the household's lowest net monthly retirement income would rise, after tax, in today's money. */
  monthlyNetGain: number;
}

/** The employer shares an early departure would lose, and what waiting for the next vest would earn back. */
export interface LeavingEarlyCost {
  /** ISO date the primary user retires in the scenario. */
  retirementDate: string;
  /** Shares of employer grants that have not vested by then and are lost. */
  lostShares: number;
  /** Their worth at today's share price, before tax, in ILS. */
  lostValue: number;
  next: NextVestGain | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** An unvested batch that would be lost, valued at today's share price. */
interface LostBatch {
  vestDate: string;
  vestMs: number;
  quantity: number;
  value: number;
}

/** A copy of `profile` where the batches that vest after `fromMs` and by `untilMs` count as already vested. */
function withBatchesVestedBy(profile: ProfileData, fromMs: number, untilMs: number): ProfileData {
  return {
    ...profile,
    equity: {
      ...profile.equity,
      holdings: profile.equity.holdings.map((holding) => {
        if (!isEmployerGrant(holding)) return holding;
        const details = holding.employerGrantDetails;
        return {
          ...holding,
          employerGrantDetails: {
            ...details,
            vestingTranches: details.vestingTranches.map((tranche) => {
              const time = tranche.vestDate ? Date.parse(tranche.vestDate) : Number.NaN;
              return time > fromMs && time <= untilMs ? { ...tranche, vestDate: null } : tranche;
            }),
          },
        };
      }),
    },
  };
}

/**
 * The cost of leaving the employer at the scenario's retirement date: the
 * unvested shares that are lost and, for the next batch to vest after that
 * date, how many more months it would take, how many shares it keeps and how
 * much after-tax monthly income they add. Returns null when nothing would be
 * lost (every share has vested, the grant keeps vesting after leaving, or the
 * lost shares have no price).
 *
 * The monthly gain is the difference between two income estimates that differ
 * only in that batch counting as vested, so the retirement age and the
 * contributions do not move. It is not part of the plan's figures.
 */
export function buildLeavingEarlyCost(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): LeavingEarlyCost | null {
  const timing = resolveRetirementTiming(profile, scenario);
  const yearsToLeave = Math.max(timing.selfAge - resolveCurrentAge(selfProfileView(profile)), 0);
  const retirementMs = momentAfterYears(engineNowMs(), yearsToLeave);
  const fxRate = usdToIlsRate(profile);

  const lost: LostBatch[] = [];
  for (const holding of profile.equity.holdings) {
    if (!isEmployerGrant(holding)) continue;
    const shareValue = (holding.currentMarketPriceUSD ?? 0) * fxRate;
    for (const batch of employerShareBatches(holding)) {
      if (batch.vestMs === null || batch.vestDate === null) continue;
      if (batchStatusAtRetirement(holding, batch, retirementMs) !== "forfeited") continue;
      lost.push({
        vestDate: batch.vestDate,
        vestMs: batch.vestMs,
        quantity: batch.quantity,
        value: batch.quantity * shareValue,
      });
    }
  }
  const sum = (batches: LostBatch[], pick: (batch: LostBatch) => number) =>
    batches.reduce((total, batch) => total + pick(batch), 0);
  const lostValue = sum(lost, (batch) => batch.value);
  if (lost.length === 0 || lostValue <= 0) return null;

  const base = {
    retirementDate: new Date(retirementMs).toISOString().slice(0, 10),
    lostShares: round2(sum(lost, (batch) => batch.quantity)),
    lostValue: Math.round(lostValue),
  };

  const first = lost.reduce((earliest, batch) => (batch.vestMs < earliest.vestMs ? batch : earliest));
  const nextBatches = lost.filter((batch) => batch.vestMs <= first.vestMs);
  const baseline = estimateNetIncomeForTiming(profile, timing).netMonthlyIncome;
  const staying = estimateNetIncomeForTiming(
    withBatchesVestedBy(profile, retirementMs, first.vestMs),
    timing,
  ).netMonthlyIncome;
  return {
    ...base,
    next: {
      vestDate: first.vestDate,
      monthsLater: Math.max(Math.ceil((first.vestMs - retirementMs) / MS_PER_MONTH), 1),
      shares: round2(sum(nextBatches, (batch) => batch.quantity)),
      value: Math.round(sum(nextBatches, (batch) => batch.value)),
      monthlyNetGain: Math.max(Math.round(staying - baseline), 0),
    },
  };
}
