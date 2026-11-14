import type { ProductCategory, ProfileData } from "../types";
import { projectCashFlow } from "./cashFlow";
import { bituachLeumiPaymentsAt, simulateHouseholdDrawdown, type DrawdownYear } from "./drawdown";
import {
  buildHousehold,
  resolveRetirementTiming,
  type Household,
  type MemberRole,
} from "./household";
import {
  BAND_FOR_KIND,
  INCOME_BAND_KEYS,
  recurringAmount,
  runIncomeBreakdown,
  type IncomeBandKey,
  type IncomeBreakdownPoint,
} from "./incomeBreakdown";
import { roundToSum } from "./rounding";
import {
  ORDINARY_STOCK_SOURCE_ID,
  OTHER_INVESTMENTS_SOURCE_ID,
  SECTION_102_SOURCE_ID,
  investmentParts,
  type InvestmentPart,
  type RetirementSource,
} from "./sources";
import type { RetirementScenario } from "./types";

/** Which chart the detail belongs to: the planned spending, or the income the savings can sustain. */
export type IncomeBasis = "planned" | "sustainable";

/** What a line of income comes from, without any display text. */
export type IncomeSourceOrigin =
  | {
      type: "account";
      accountId: string;
      providerName: string;
      policyNumber: string;
      fundId: string;
      productCategory: ProductCategory | null;
    }
  | { type: "bituachLeumi" }
  | { type: "spouseSupplement" }
  | { type: "otherAssets" }
  | { type: "bankDeposit"; bankName: string }
  | { type: "holding"; company: string; ticker: string }
  | { type: "employerShares"; route: "section102" | "ordinaryIncome" | "nonTrustee" };

export interface IncomeSourceLine {
  /** Stable across years, so a source keeps its identity when the year changes. */
  key: string;
  band: IncomeBandKey;
  owner: MemberRole;
  origin: IncomeSourceOrigin;
  /** A payment that arrives by itself (an annuity or Bituach Leumi), or money taken out of savings. */
  mode: "payment" | "withdrawal";
  /** Per month, today's money. */
  monthly: number;
  /** What the source holds before this year's withdrawal; null for a payment. */
  balance: number | null;
}

export type IdleReason =
  | { type: "locked"; age: number }
  | { type: "startsLater"; age: number }
  | { type: "notDrawn" };

/** A source that pays nothing this year, and why. The ages are the owner's. */
export interface IdleSource {
  key: string;
  band: IncomeBandKey;
  owner: MemberRole;
  origin: IncomeSourceOrigin;
  balance: number | null;
  reason: IdleReason;
}

/** One year of the income chart traced to the funds, policies and savings behind it. */
export interface IncomeYearDetail {
  /** The primary user's age; the chart's year. */
  age: number;
  spouseAge: number | null;
  /** Payments first, then withdrawals; each by band in chart order, largest first. Adds up to `total`. */
  lines: IncomeSourceLine[];
  idle: IdleSource[];
  /** What the chart shows for the year, before tax. */
  total: number;
  /** The planned spending nobody pays; null on the sustainable basis. */
  unfunded: number | null;
}

interface Part {
  origin: IncomeSourceOrigin;
  /** The part's share of its source; the parts of a source add up to 1. */
  weight: number;
  suffix: string;
}

interface Slot {
  memberIndex: number;
  owner: MemberRole;
  source: RetirementSource;
  parts: Part[];
}

interface YearPick {
  point: IncomeBreakdownPoint;
  row: DrawdownYear;
  /** The row whose draw shares split the point's withdrawals. */
  shareRow: DrawdownYear;
}

interface Candidate {
  key: string;
  band: IncomeBandKey;
  owner: MemberRole;
  origin: IncomeSourceOrigin;
  mode: IncomeSourceLine["mode"];
  raw: number;
  balance: number | null;
}

function pooledOrigin(part: InvestmentPart): IncomeSourceOrigin {
  switch (part.type) {
    case "otherAssets":
      return { type: "otherAssets" };
    case "bankDeposit":
      return { type: "bankDeposit", bankName: part.bankName };
    case "holding":
      return { type: "holding", company: part.company, ticker: part.ticker };
    case "employerShares":
      return { type: "employerShares", route: "nonTrustee" };
  }
}

/**
 * The model draws the non-pension investments as one pool, pro rata, and every part of it earns
 * the same return, so each part's share of the pool is its share of the pool's value.
 */
function poolParts(profile: ProfileData, retirementAge: number): Part[] {
  const parts = investmentParts(profile, retirementAge);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total <= 0) return [{ origin: { type: "otherAssets" }, weight: 1, suffix: "" }];
  return parts.map((part, index) => ({
    origin: pooledOrigin(part),
    weight: part.value / total,
    suffix: `:${index}`,
  }));
}

function buildSlots(household: Household): Slot[] {
  return household.members.flatMap((member, memberIndex) =>
    member.sources.map((source): Slot => {
      const owner = member.role;
      if (source.id === OTHER_INVESTMENTS_SOURCE_ID) {
        return { memberIndex, owner, source, parts: poolParts(member.profile, member.retirementAge) };
      }
      let origin: IncomeSourceOrigin;
      if (source.id === SECTION_102_SOURCE_ID) {
        origin = { type: "employerShares", route: "section102" };
      } else if (source.id === ORDINARY_STOCK_SOURCE_ID) {
        origin = { type: "employerShares", route: "ordinaryIncome" };
      } else {
        const account = member.profile.pensionSavings.accounts.find(({ id }) => id === source.id);
        origin = {
          type: "account",
          accountId: source.id,
          providerName: account?.providerName ?? "",
          policyNumber: account?.policyNumber ?? "",
          fundId: account?.fundId ?? "",
          productCategory: account?.productCategory ?? null,
        };
      }
      return { memberIndex, owner, source, parts: [{ origin, weight: 1, suffix: "" }] };
    }),
  );
}

/** Scales `raw` amounts to whole numbers that add up to `target`; the amounts that round to nothing are dropped. */
function allocate(candidates: Candidate[], target: number): IncomeSourceLine[] {
  const rawTotal = candidates.reduce((sum, candidate) => sum + candidate.raw, 0);
  if (target <= 0 || rawTotal <= 0) return [];
  const amounts = roundToSum(
    candidates.map((candidate) => (candidate.raw * target) / rawTotal),
    target,
  );
  return candidates.flatMap(({ raw: _raw, ...rest }, index) =>
    amounts[index] > 0 ? [{ ...rest, monthly: amounts[index] }] : [],
  );
}

const rowsByAge = (rows: DrawdownYear[]) =>
  new Map(rows.map((row): [number, DrawdownYear] => [row.age, row]));

function yearDetail(
  household: Household,
  slots: Slot[],
  { point, row, shareRow }: YearPick,
): IncomeYearDetail {
  const payments = new Map<string, Candidate[]>();
  const withdrawals = new Map<string, Candidate[]>();
  const add = (groups: Map<string, Candidate[]>, candidate: Candidate) => {
    const group = groups.get(candidate.band);
    if (group) group.push(candidate);
    else groups.set(candidate.band, [candidate]);
  };
  const active = new Set<number>();

  slots.forEach((slot, index) => {
    const holding = row.holdings[index];
    const share = shareRow.holdings[index].capitalShare;
    const band = BAND_FOR_KIND[slot.source.kind];
    for (const part of slot.parts) {
      const key = `${slot.owner}:${slot.source.id}${part.suffix}`;
      if (holding.annuityMonthly > 0) {
        add(payments, {
          key: `${key}:payment`,
          band,
          owner: slot.owner,
          origin: part.origin,
          mode: "payment",
          raw: holding.annuityMonthly * part.weight,
          balance: null,
        });
        active.add(index);
      }
      if (share > 0) {
        add(withdrawals, {
          key: `${key}:withdrawal`,
          band,
          owner: slot.owner,
          origin: part.origin,
          mode: "withdrawal",
          raw: share * part.weight,
          balance: holding.balance * part.weight,
        });
        active.add(index);
      }
    }
  });

  const idle: IdleSource[] = [];
  household.members.forEach((member, memberIndex) => {
    const ownerAge = member.currentAge + row.yearsFromNow;
    const { pension, supplement } = bituachLeumiPaymentsAt(member, row.yearsFromNow);
    const { claimAge, monthlyPension, spouseSupplement } = member.bituachLeumi;
    const stateParts = [
      { type: "bituachLeumi", amount: pension, scheduled: monthlyPension, startAge: claimAge },
      {
        type: "spouseSupplement",
        amount: supplement,
        scheduled: spouseSupplement?.monthly ?? 0,
        startAge: spouseSupplement?.startAge ?? 0,
      },
    ] as const;
    for (const { type, amount, scheduled, startAge } of stateParts) {
      const key = `${member.role}:${type}`;
      if (amount > 0) {
        add(payments, {
          key: `${key}:payment`,
          band: "bituachLeumi",
          owner: member.role,
          origin: { type },
          mode: "payment",
          raw: amount,
          balance: null,
        });
      } else if (scheduled > 0 && ownerAge < startAge) {
        idle.push({
          key,
          band: "bituachLeumi",
          owner: member.role,
          origin: { type },
          balance: null,
          reason: { type: "startsLater", age: startAge },
        });
      }
    }

    slots.forEach((slot, index) => {
      if (slot.memberIndex !== memberIndex || active.has(index)) return;
      const { balance } = row.holdings[index];
      if (balance <= 0) return;
      const { annuity, unlockAge } = slot.source;
      let reason: IdleReason = { type: "notDrawn" };
      if (annuity && ownerAge < annuity.startAge) reason = { type: "startsLater", age: annuity.startAge };
      else if (!annuity && ownerAge < unlockAge) reason = { type: "locked", age: unlockAge };
      for (const part of slot.parts) {
        idle.push({
          key: `${slot.owner}:${slot.source.id}${part.suffix}`,
          band: BAND_FOR_KIND[slot.source.kind],
          owner: slot.owner,
          origin: part.origin,
          balance: balance * part.weight,
          reason,
        });
      }
    });
  });

  const lines = [
    { groups: payments, target: (band: IncomeBandKey) => recurringAmount(point, band) },
    { groups: withdrawals, target: (band: IncomeBandKey) => point.withdrawn[band] },
  ].flatMap(({ groups, target }) =>
    INCOME_BAND_KEYS.flatMap((band) =>
      allocate(groups.get(band) ?? [], target(band)).sort((a, b) => b.monthly - a.monthly),
    ),
  );

  const second = household.members[1];
  return {
    age: point.age,
    spouseAge: second ? second.currentAge + row.yearsFromNow : null,
    lines,
    idle: idle.sort(
      (a, b) => INCOME_BAND_KEYS.indexOf(a.band) - INCOME_BAND_KEYS.indexOf(b.band) || (b.balance ?? 0) - (a.balance ?? 0),
    ),
    total: INCOME_BAND_KEYS.reduce((sum, band) => sum + point[band], 0),
    unfunded: point.unfunded ?? null,
  };
}

/**
 * Every year of an income chart traced to the sources behind it, by the identifiable fund, policy,
 * deposit or holding. Each line is a share of the chart's own figure for its band, so the lines of
 * a year add up to the bar the chart draws.
 *
 * - Payments are the annuities that have started and Bituach Leumi (with the spouse supplement),
 *   each as the plan models it.
 * - Withdrawals split a band by each source's share of the year's draw. The model draws the
 *   non-pension investments as one pool, so its parts (cash and other assets, each deposit, each
 *   holding, Section 3(i) shares) share the pool's draw in proportion to their value.
 * - A source that holds money but pays nothing is listed as idle with the reason.
 *
 * The planned basis falls back to the sustainable one when no spending is entered.
 */
export function incomeYearDetails(
  profile: ProfileData,
  basis: IncomeBasis,
  scenario: RetirementScenario = "standard",
): IncomeYearDetail[] {
  const timing = resolveRetirementTiming(profile, scenario);
  const plan = basis === "planned" ? projectCashFlow(profile, scenario) : null;
  let household: Household;
  let picks: YearPick[];

  if (plan) {
    household = buildHousehold(profile, timing);
    const rows = rowsByAge(simulateHouseholdDrawdown(household, plan.monthlySpending));
    picks = plan.years.flatMap((point) => {
      const row = rows.get(point.age);
      return row ? [{ point, row, shareRow: row }] : [];
    });
  } else {
    const run = runIncomeBreakdown(profile, timing);
    household = run.household;
    const rows = rowsByAge(run.rows);
    picks = run.points.flatMap((point, index) => {
      const row = rows.get(point.age);
      return row ? [{ point, row, shareRow: run.shareRows[index] }] : [];
    });
  }

  const slots = buildSlots(household);
  const aligned = picks.every(
    ({ row, shareRow }) =>
      row.holdings.length === slots.length && shareRow.holdings.length === slots.length,
  );
  return aligned ? picks.map((pick) => yearDetail(household, slots, pick)) : [];
}
