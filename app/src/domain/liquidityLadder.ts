import type { ProfileData } from "../types";
import {
  buildHousehold,
  resolveRetirementTiming,
  yearsUntilAge,
  type Household,
  type HouseholdMember,
  type MemberRole,
} from "./household";
import { usdToIlsRate } from "./profileBasics";
import { SOURCE_KINDS, type SourceKind } from "./sources";
import { engineNowMs } from "./trace";
import type { RetirementScenario } from "./types";
import { employerShareBatches, isEmployerGrant, momentAfterYears } from "./vesting";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** What a rung of the ladder opens up: a pot of capital, or a monthly payment that starts. */
export type LadderItemKind = SourceKind | "annuity" | "bituachLeumi" | "spouseSupplement";

export interface LadderItem {
  kind: LadderItemKind;
  member: MemberRole;
  /** Capital: its value when the household retires. Income: the monthly payment. Today's money. */
  amount: number;
  type: "capital" | "income";
}

/** One step of the staircase: everything that becomes usable at the same moment. */
export interface LadderRung {
  /** Months after the household retires; 0 means usable from retirement. */
  month: number;
  /** The primary user's age at that moment. */
  age: number;
  /** The calendar year it falls in. */
  year: number;
  items: LadderItem[];
  /** Capital that becomes usable at this rung. */
  capital: number;
  /** All the capital usable up to and including this rung. */
  usableTotal: number;
}

/** Employer shares that vest after the household retires, which the plan counts as usable at retirement because the grant keeps vesting after leaving. */
export interface LateVestingShares {
  /** What they are worth at today's share price, in ILS. */
  value: number;
  /** ISO date of the first batch to vest after retirement. */
  firstVestDate: string;
}

export interface LiquidityLadder {
  /** The primary user's age when the household starts drawing. */
  retirementAge: number;
  retirementYear: number;
  rungs: LadderRung[];
  lateVesting: LateVestingShares | null;
}

/** Same growth the income estimate gives an earlier retiree's pot until the household retires. */
function catchUpGrowth(household: Household, member: HouseholdMember): number {
  const ownYears = Math.max(member.retirementAge - member.currentAge, 0);
  return Math.pow(1 + household.rate, household.retirementYears - ownYears);
}

/** Month after household retirement at which `age` of `member` falls, never before retirement. */
function monthAfterRetirement(household: Household, member: HouseholdMember, age: number): number {
  return Math.max(Math.round((yearsUntilAge(member, age) - household.retirementYears) * 12), 0);
}

function yearOfMonth(household: Household, month: number): number {
  const yearsFromNow = household.retirementYears + month / 12;
  return new Date(engineNowMs() + yearsFromNow * MS_PER_YEAR).getFullYear();
}

/**
 * Employer shares that vest after the household retires and that the owner
 * keeps because the grant keeps vesting after leaving. Shares that would be
 * lost are not counted by the plan, so they are not listed here.
 */
function lateVestingShares(profile: ProfileData, household: Household): LateVestingShares | null {
  const retirementMs = momentAfterYears(engineNowMs(), household.retirementYears);
  const fxRate = usdToIlsRate(profile);
  let value = 0;
  let first: { time: number; iso: string } | null = null;
  for (const holding of profile.equity.holdings) {
    if (!isEmployerGrant(holding) || !holding.employerGrantDetails.keepsVestingAfterLeaving) continue;
    const shareValue = (holding.currentMarketPriceUSD ?? 0) * fxRate;
    for (const batch of employerShareBatches(holding)) {
      if (batch.vestMs === null || batch.vestDate === null || batch.vestMs <= retirementMs) continue;
      value += batch.quantity * shareValue;
      if (first === null || batch.vestMs < first.time) first = { time: batch.vestMs, iso: batch.vestDate };
    }
  }
  return first !== null && value > 0 ? { value: Math.round(value), firstVestDate: first.iso } : null;
}

/**
 * When each pot of savings becomes usable, and when each monthly payment
 * starts, as a staircase from the household's retirement onward. It reads the
 * same sources, unlock ages and values as the income estimate (so what opens
 * at retirement equals `access.accessibleAtRetirement`), and changes no
 * number in the plan.
 *
 * Capital is shown at its value when the household retires, in today's money;
 * a locked pot keeps growing until it opens. Items that open at the same
 * moment are merged per person and kind. Anything opening after the planning
 * horizon is left out, as the plan never reaches it.
 */
export function buildLiquidityLadder(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): LiquidityLadder {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const horizonMonths = Math.max(Math.round((household.horizonYears - household.retirementYears) * 12), 0);

  const byRung = new Map<number, Map<string, LadderItem>>();
  const add = (month: number, item: LadderItem) => {
    const items = byRung.get(month) ?? new Map<string, LadderItem>();
    const key = `${item.member}|${item.kind}`;
    const existing = items.get(key);
    items.set(key, existing ? { ...existing, amount: existing.amount + item.amount } : item);
    byRung.set(month, items);
  };
  const streamMonth = (member: HouseholdMember, age: number) =>
    monthAfterRetirement(household, member, age);

  for (const member of household.members) {
    const growth = catchUpGrowth(household, member);
    const { monthlyPension, claimAge, spouseSupplement } = member.bituachLeumi;

    if (monthlyPension > 0) {
      const month = streamMonth(member, claimAge);
      if (month < horizonMonths) {
        add(month, { kind: "bituachLeumi", member: member.role, amount: monthlyPension, type: "income" });
      }
    }
    if (spouseSupplement) {
      const start = streamMonth(member, spouseSupplement.startAge);
      const end =
        spouseSupplement.endAge === null ? horizonMonths : streamMonth(member, spouseSupplement.endAge);
      if (end > start && start < horizonMonths) {
        add(start, {
          kind: "spouseSupplement",
          member: member.role,
          amount: spouseSupplement.monthly,
          type: "income",
        });
      }
    }

    for (const source of member.sources) {
      if (source.annuity) {
        const month = streamMonth(member, source.annuity.startAge);
        if (month < horizonMonths) {
          add(month, {
            kind: "annuity",
            member: member.role,
            amount: source.annuity.monthly,
            type: "income",
          });
        }
        continue;
      }
      const amount = source.valueAtRetirement * growth;
      const month = monthAfterRetirement(household, member, source.unlockAge);
      if (Math.round(amount) > 0 && month < horizonMonths) {
        add(month, { kind: source.kind, member: member.role, amount, type: "capital" });
      }
    }
  }

  const kindOrder = (item: LadderItem) =>
    item.type === "capital" ? SOURCE_KINDS.indexOf(item.kind as SourceKind) : SOURCE_KINDS.length;
  const memberOrder = (item: LadderItem) => (item.member === "self" ? 0 : 1);

  let usableExact = 0;
  const rungs = [...byRung.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, entries]): LadderRung => {
      const exact = [...entries.values()].sort(
        (a, b) =>
          Number(a.type === "income") - Number(b.type === "income") ||
          kindOrder(a) - kindOrder(b) ||
          memberOrder(a) - memberOrder(b),
      );
      // Rounded once, like the access summary, so the totals match it to the shekel.
      const capitalExact = exact
        .filter((item) => item.type === "capital")
        .reduce((sum, item) => sum + item.amount, 0);
      usableExact += capitalExact;
      const memberAge = household.drawdownStartAge + month / 12;
      return {
        month,
        age: Math.round(memberAge * 12) / 12,
        year: yearOfMonth(household, month),
        items: exact.map((item) => ({ ...item, amount: Math.round(item.amount) })),
        capital: Math.round(capitalExact),
        usableTotal: Math.round(usableExact),
      };
    });

  return {
    retirementAge: household.drawdownStartAge,
    retirementYear: yearOfMonth(household, 0),
    rungs,
    lateVesting: lateVestingShares(profile, household),
  };
}
