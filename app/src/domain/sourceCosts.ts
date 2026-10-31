import type { ProfileData } from "../types";
import { simulateHouseholdDrawdown, type DrawdownHolding } from "./drawdown";
import {
  buildHousehold,
  resolveRetirementTiming,
  type Household,
  type HouseholdMember,
  type MemberRole,
} from "./household";
import { memberTax, type YearDraw } from "./memberTax";
import { retirementPlanYears } from "./netIncome";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import {
  ORDINARY_STOCK_SOURCE_ID,
  SECTION_102_SOURCE_ID,
  type RetirementSource,
} from "./sources";
import type { RetirementScenario } from "./types";

/** The net monthly amount the table asks what it costs to raise, in today's money. */
export const SOURCE_COST_NET_STEP = 100;

/**
 * The kinds of money the table tells apart. An investment provident fund is its own group
 * because, unlike the other provident funds, only its gain is taxed; employer shares are split by
 * how their sale is taxed.
 */
export const SOURCE_COST_GROUPS = [
  "studyFund",
  "investments",
  "investmentProvidentFund",
  "section102Shares",
  "ordinaryIncomeShares",
  "providentFund",
  "managersInsurance",
  "pensionFund",
] as const;

export type SourceCostGroup = (typeof SOURCE_COST_GROUPS)[number];

/** One kind of money of one person, and what raising `SOURCE_COST_NET_STEP` a month from it costs in tax. */
export interface SourceCostRow {
  group: SourceCostGroup;
  member: MemberRole;
  /** The person's age in the year the tax is worked out for: the first year the money can be drawn. */
  age: number;
  /** The calendar year of that age. */
  year: number;
  /** Extra monthly tax when the draw is raised just enough to leave `SOURCE_COST_NET_STEP` more, in today's money. */
  taxPerStep: number;
  /** That draw, before tax: `SOURCE_COST_NET_STEP` plus `taxPerStep`. */
  drawPerStep: number;
  /** Management fee from the balance, in percent a year, averaged over the accounts of this group that state one; null when none do. */
  managementFeePercent: number | null;
}

function groupOf(source: RetirementSource): SourceCostGroup {
  switch (source.kind) {
    case "pensionFund":
      return "pensionFund";
    case "managersInsurance":
      return "managersInsurance";
    case "studyFund":
      return "studyFund";
    case "providentFund":
      return source.taxTreatment === "capitalGains" ? "investmentProvidentFund" : "providentFund";
    case "otherInvestments":
      if (source.id === SECTION_102_SOURCE_ID) return "section102Shares";
      if (source.id === ORDINARY_STOCK_SOURCE_ID) return "ordinaryIncomeShares";
      return "investments";
  }
}

interface GroupEntry {
  source: RetirementSource;
  /** Position of the source among all the household's sources, which is where its holding sits in a year's row. */
  holdingIndex: number;
}

/** The draw, before tax, that leaves `net` more after the extra tax `taxOnDraw` reports for a draw. */
function drawLeaving(net: number, taxOnDraw: (draw: number) => number): number {
  const baseline = taxOnDraw(0);
  const netOf = (draw: number) => draw - (taxOnDraw(draw) - baseline);
  let high = net;
  for (let step = 0; step < 30 && netOf(high) < net; step += 1) high *= 2;
  let low = net;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (netOf(middle) < net) low = middle;
    else high = middle;
  }
  return high;
}

const weightedAverage = (items: { weight: number; value: number }[]): number => {
  const total = items.reduce((sum, { weight }) => sum + weight, 0);
  return total > 0 ? items.reduce((sum, { weight, value }) => sum + weight * value, 0) / total : 0;
};

/** The management fee of a group's accounts, weighted by value; null when no account states one. */
function groupFeePercent(member: HouseholdMember, entries: GroupEntry[]): number | null {
  const fees = entries.flatMap(({ source }) => {
    const account = member.profile.pensionSavings.accounts.find(({ id }) => id === source.id);
    const fee = account?.investmentAndFees.feeFromAccumulationPercent ?? null;
    return fee === null ? [] : [{ weight: source.valueAtRetirement, value: fee }];
  });
  return fees.length === 0 ? null : weightedAverage(fees);
}

/** The row for one group of one person, or null when none of it can be drawn before the planning horizon. */
function buildRow(
  household: Household,
  memberIndex: number,
  holdingOffset: number,
  group: SourceCostGroup,
  entries: GroupEntry[],
  plan: ReturnType<typeof retirementPlanYears>,
): SourceCostRow | null {
  const member = household.members[memberIndex];
  for (const { row, draws } of plan) {
    const unlocked = entries.filter(
      ({ source }) => member.currentAge + row.yearsFromNow >= source.unlockAge,
    );
    if (unlocked.length === 0) continue;

    const mix = unlocked.map(({ source, holdingIndex }) => ({
      weight: source.valueAtRetirement,
      holding: row.holdings[holdingOffset + holdingIndex],
    }));
    const holding: DrawdownHolding = {
      memberIndex,
      treatment: mix[0].holding.treatment,
      capitalGainsTaxRate: weightedAverage(
        mix.map(({ weight, holding: h }) => ({ weight, value: h.capitalGainsTaxRate })),
      ),
      annuityMonthly: 0,
      capitalShare: 0,
      gainFraction: weightedAverage(
        mix.map(({ weight, holding: h }) => ({ weight, value: h.gainFraction })),
      ),
      ordinaryFraction: weightedAverage(
        mix.map(({ weight, holding: h }) => ({ weight, value: h.ordinaryFraction })),
      ),
    };
    const taxOnDraw = (extra: number): number => {
      const withExtra: YearDraw[] = extra > 0 ? [...draws, { holding, amount: extra }] : draws;
      return memberTax(household, memberIndex, row.yearsFromNow, row.holdings, withExtra)
        .totalMonthly;
    };
    const drawPerStep = drawLeaving(SOURCE_COST_NET_STEP, taxOnDraw);
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const fee = groupFeePercent(member, entries);
    return {
      group,
      member: member.role,
      age: member.currentAge + row.yearsFromNow,
      year: household.baseYear + row.yearsFromNow,
      taxPerStep: round2(drawPerStep - SOURCE_COST_NET_STEP),
      drawPerStep: round2(drawPerStep),
      managementFeePercent: fee === null ? null : round2(fee),
    };
  }
  return null;
}

/**
 * What it costs, in tax, to take another `SOURCE_COST_NET_STEP` a month out of each kind of
 * savings. The household's plan is left as it is: the table adds the extra draw to the plan's own
 * draw in one year and reports the extra tax, so it is the tax on the last shekels, not an
 * average. The year is the first one in which the person can draw that money after the household
 * retires, and the plan's own tax that year (which sources it draws on, the pension exemption,
 * credit points, health tax, Bituach Leumi and the surtax) is the starting point.
 *
 * A group is one kind of money of one person. The tax mix of a group is that of its accounts that
 * can be drawn in that year, weighted by their value. Annuities are fixed payments rather than
 * savings, so they are not listed. Every source earns the same return in the plan, so the table
 * shows tax only; what a source gives up besides tax (a tax-free shelter, a lower rate on gains)
 * is described in words by the card. Nothing here changes a number in the plan.
 */
export function buildSourceCostTable(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): SourceCostRow[] {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const { monthlyIncomeTodayMoney } = estimateHouseholdRetirementIncome(household);
  const rows = simulateHouseholdDrawdown(household, monthlyIncomeTodayMoney);
  const plan = retirementPlanYears(household, monthlyIncomeTodayMoney, rows);

  const table: SourceCostRow[] = [];
  let holdingOffset = 0;
  household.members.forEach((member, memberIndex) => {
    const groups = new Map<SourceCostGroup, GroupEntry[]>();
    member.sources.forEach((source, holdingIndex) => {
      if (source.annuity || source.valueAtRetirement < 0.5) return;
      const group = groupOf(source);
      groups.set(group, [...(groups.get(group) ?? []), { source, holdingIndex }]);
    });
    for (const group of SOURCE_COST_GROUPS) {
      const entries = groups.get(group);
      const row = entries ? buildRow(household, memberIndex, holdingOffset, group, entries, plan) : null;
      if (row) table.push(row);
    }
    holdingOffset += member.sources.length;
  });

  const rank = (row: SourceCostRow) => SOURCE_COST_GROUPS.indexOf(row.group);
  return table.sort(
    (a, b) => rank(a) - rank(b) || Number(a.member === "spouse") - Number(b.member === "spouse"),
  );
}
