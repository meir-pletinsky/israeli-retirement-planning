import type { BridgeMode, ProfileData, WithdrawalStrategy } from "../types";
import { bridgeWindowEnd } from "./bridge";
import { simulateHouseholdDrawdown } from "./drawdown";
import { buildHousehold, resolveRetirementTiming, type MemberRole } from "./household";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import type { RetirementScenario } from "./types";
import {
  compareWithdrawalStrategies,
  hasEmployerShares,
  type WithdrawalStrategyComparison,
} from "./withdrawalStrategies";

/** One batch of employer shares the tax-smart order sells in a person's bridge window. */
export interface BridgeWindowBatch {
  label: string;
  grantDate: string | null;
  /** The part of a sale taxed as ordinary (salary) income, from 0 to 1. */
  ordinaryShare: number;
  /** Everything sold from the batch in the window, in today's money. */
  total: number;
  /** The person's own age in the first year the batch is sold. */
  firstAge: number;
}

/** One person's low-tax window: the years before their first annuity or Bituach Leumi payment. */
export interface BridgeWindowMember {
  owner: MemberRole;
  /** The person's own age in the first and last year of the window in which shares are sold. */
  fromAge: number;
  toAge: number;
  /** The age the window ends at, with the income that ends it; null when there is nothing to wait for. */
  endsAtAge: number | null;
  endsWith: "annuity" | "bituachLeumi" | null;
  /** Ordinary income that bears no income tax after the credit points, per month. */
  roomMonthly: number;
  /** The ordinary income from share sales, per month, averaged over the years shares are sold. */
  soldMonthly: number;
  /** The batches in the order they are sold. */
  batches: BridgeWindowBatch[];
}

/** What the tax-smart order does with the years before the pension starts, for the Projections page. */
export interface BridgeWindow {
  mode: BridgeMode;
  lumpSumSales: boolean;
  members: BridgeWindowMember[];
  /** The order the tax-smart total is compared with: the plan's own, or "proRata" when the plan already is tax-smart. */
  comparedWith: WithdrawalStrategy;
  /** Total tax of that order minus the tax-smart total, today's money; negative when tax-smart costs more. */
  taxSaved: number;
}

interface MemberTally {
  years: number;
  fromAge: number;
  toAge: number;
  roomMonthly: number;
  ordinaryAnnual: number;
  batches: Map<string, BridgeWindowBatch>;
}

/**
 * Runs the tax-smart order over the plan and reports, for each person with employer shares to sell
 * before their first fixed income, the years it covers, the tax-free room, which batches go first
 * and what the order saves in tax compared with the plan's own. Null when nobody sells shares in
 * such a window. The sums come from the same simulation as the withdrawal comparison, so the saving
 * matches its "Total tax" row.
 */
export function buildBridgeWindow(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
  comparison: WithdrawalStrategyComparison = compareWithdrawalStrategies(profile, scenario),
): BridgeWindow | null {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  if (!hasEmployerShares(household)) return null;
  const comparedWith: WithdrawalStrategy = comparison.current === "taxSmart" ? "proRata" : comparison.current;
  const smart = comparison.results.find(({ strategy }) => strategy === "taxSmart");
  const against = comparison.results.find(({ strategy }) => strategy === comparedWith);
  if (!smart || !against) return null;

  const { monthlyIncomeTodayMoney } = estimateHouseholdRetirementIncome(household);
  const rows = simulateHouseholdDrawdown({ ...household, withdrawalStrategy: "taxSmart" }, monthlyIncomeTodayMoney);

  const tallies = new Map<number, MemberTally>();
  for (const row of rows) {
    if (!row.bridge) continue;
    for (const entry of row.bridge.members) {
      if (!entry.inWindow) continue;
      const sales = row.bridge.sales.filter((sale) => sale.memberIndex === entry.memberIndex && sale.amount > 0);
      if (sales.length === 0) continue;
      const age = household.members[entry.memberIndex].currentAge + row.yearsFromNow;
      const tally = tallies.get(entry.memberIndex) ?? {
        years: 0,
        fromAge: age,
        toAge: age,
        roomMonthly: entry.zeroTaxAnnual / 12,
        ordinaryAnnual: 0,
        batches: new Map<string, BridgeWindowBatch>(),
      };
      tally.years += 1;
      tally.toAge = age;
      tally.ordinaryAnnual += entry.ordinaryAnnual;
      for (const sale of sales) {
        const key = `${sale.label}|${sale.grantDate ?? ""}`;
        const batch = tally.batches.get(key);
        if (batch) batch.total += sale.amount;
        else {
          tally.batches.set(key, {
            label: sale.label,
            grantDate: sale.grantDate,
            ordinaryShare: sale.ordinaryShare,
            total: sale.amount,
            firstAge: age,
          });
        }
      }
      tallies.set(entry.memberIndex, tally);
    }
  }
  if (tallies.size === 0) return null;

  const members = [...tallies].map(([memberIndex, tally]): BridgeWindowMember => {
    const member = household.members[memberIndex];
    const end = bridgeWindowEnd(member);
    return {
      owner: member.role,
      fromAge: tally.fromAge,
      toAge: tally.toAge,
      endsAtAge: Number.isFinite(end.age) ? end.age : null,
      endsWith: end.source,
      roomMonthly: tally.roomMonthly,
      soldMonthly: tally.ordinaryAnnual / tally.years / 12,
      batches: [...tally.batches.values()].sort(
        (a, b) => a.firstAge - b.firstAge || b.ordinaryShare - a.ordinaryShare || b.total - a.total,
      ),
    };
  });
  return {
    mode: household.bridgeMode,
    lumpSumSales: household.lumpSumSales,
    members,
    comparedWith,
    taxSaved: against.totalTax - smart.totalTax,
  };
}
