import { WITHDRAWAL_MIX_KEYS, type ProductCategory, type ProfileData, type WithdrawalMixKey } from "../types";
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
  BANK_DEPOSITS_SOURCE_ID,
  ORDINARY_STOCK_SOURCE_ID,
  OTHER_INVESTMENTS_SOURCE_ID,
  SECTION_102_SOURCE_ID,
  investmentParts,
  type DepositTerms,
  type InvestmentPart,
  type RetirementSource,
  type TaxTreatment,
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
      /** The return the clearing house reported for the year so far, in percent; null when none was imported. */
      reportedReturnPct: number | null;
    }
  | { type: "bituachLeumi" }
  | { type: "spouseSupplement" }
  | { type: "otherAssets" }
  | { type: "bankDeposit"; bankName: string }
  /** Employer stock held through a trustee: Section 102 (capital or ordinary income track), as one line. */
  | { type: "esop" }
  /** Every other share holding (ESPP, private stock, Section 3(i) and personal holdings), as one line. */
  | { type: "otherShares" };

/**
 * What bears on drawing money from a source, as the plan holds it. The tax mix is what the
 * projection applies, and so is a deposit's real return, which it grows the deposits at; the
 * currency and the other deposit terms are shown for reference.
 */
export interface WithdrawalFactors {
  treatment: TaxTreatment;
  /** The rate on the realised gain; meaningful for `capitalGains`. */
  capitalGainsTaxRate: number;
  /** The part of a withdrawal that is real gain, taxed at `capitalGainsTaxRate`. */
  gainFraction: number;
  /** The part of a withdrawal taxed as ordinary income. */
  ordinaryFraction: number;
  /** What the source is priced in: the dollar for shares, the shekel for everything else. */
  currency: "ILS" | "USD";
  /** The deposit's own terms; null for any other source. */
  deposit: DepositTerms | null;
}

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
  /** What bears on drawing from the source; null for a payment. */
  factors: WithdrawalFactors | null;
  /**
   * What the source earns over a year at the return the plan grows it at, from its balance before
   * this year's withdrawal, in today's money (above inflation). An estimate; for a deposit it is
   * the interest. Null for a payment.
   */
  profit: number | null;
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
  /** The planned spending the year has to fund, with the cost of survivors' cover; null on the sustainable basis. */
  planned: number | null;
  /** The planned spending nobody pays; null on the sustainable basis. */
  unfunded: number | null;
}

/** Which kind of a custom withdrawal split a source belongs to; null for pension-like money, which the split does not name. */
export function withdrawalMixKindOf(origin: IncomeSourceOrigin): WithdrawalMixKey | null {
  switch (origin.type) {
    case "account":
      return origin.productCategory === "studyFund" ? "studyFund" : null;
    case "bankDeposit":
      return "deposits";
    case "esop":
      return "esop";
    case "otherAssets":
    case "otherShares":
      return "shares";
    default:
      return null;
  }
}

/** Where a year's withdrawals came from, in whole percent adding up to 100; `other` is money the split does not name. */
export type WithdrawalSplit = Record<WithdrawalMixKey | "other", number>;

/** The split of a year's withdrawals by kind; null when nothing is withdrawn. */
export function withdrawalSplit(lines: readonly IncomeSourceLine[]): WithdrawalSplit | null {
  const kinds = [...WITHDRAWAL_MIX_KEYS, "other"] as const;
  const sums = Object.fromEntries(kinds.map((kind) => [kind, 0])) as WithdrawalSplit;
  for (const line of lines) {
    if (line.mode === "withdrawal") sums[withdrawalMixKindOf(line.origin) ?? "other"] += line.monthly;
  }
  const total = kinds.reduce((sum, kind) => sum + sums[kind], 0);
  if (total <= 0) return null;
  const parts = roundToSum(
    kinds.map((kind) => (sums[kind] * 100) / total),
    100,
  );
  return Object.fromEntries(kinds.map((kind, index) => [kind, parts[index]])) as WithdrawalSplit;
}

interface Part {
  origin: IncomeSourceOrigin;
  /** The part's share of its source; the parts of a source add up to 1. */
  weight: number;
  suffix: string;
  /** Names the line apart from its source, so parts of different sources that share it are one line. */
  shared?: string;
  deposit: DepositTerms | null;
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
  planned: number | null;
}

interface Candidate {
  key: string;
  band: IncomeBandKey;
  owner: MemberRole;
  origin: IncomeSourceOrigin;
  mode: IncomeSourceLine["mode"];
  raw: number;
  balance: number | null;
  factors: WithdrawalFactors | null;
  profit: number | null;
}

const partKey = (slot: Slot, part: Part) => `${slot.owner}:${part.shared ?? `${slot.source.id}${part.suffix}`}`;

const addNullable = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b);

/** The factors of two draws put into one line: each is weighted by the amount drawn (the tax rate, by the gain). */
function blendFactors(a: WithdrawalFactors, aRaw: number, b: WithdrawalFactors, bRaw: number): WithdrawalFactors {
  const average = (x: number, y: number, xWeight: number, yWeight: number) =>
    xWeight + yWeight > 0 ? (x * xWeight + y * yWeight) / (xWeight + yWeight) : x;
  const aGain = aRaw * a.gainFraction;
  const bGain = bRaw * b.gainFraction;
  return {
    treatment: a.treatment === "ordinaryIncome" && b.treatment === "ordinaryIncome" ? "ordinaryIncome" : "capitalGains",
    capitalGainsTaxRate:
      aGain + bGain > 0
        ? average(a.capitalGainsTaxRate, b.capitalGainsTaxRate, aGain, bGain)
        : average(a.capitalGainsTaxRate, b.capitalGainsTaxRate, aRaw, bRaw),
    gainFraction: average(a.gainFraction, b.gainFraction, aRaw, bRaw),
    ordinaryFraction: average(a.ordinaryFraction, b.ordinaryFraction, aRaw, bRaw),
    currency: a.currency,
    deposit: a.deposit,
  };
}

function mergeCandidates(a: Candidate, b: Candidate): Candidate {
  return {
    ...a,
    raw: a.raw + b.raw,
    balance: addNullable(a.balance, b.balance),
    profit: addNullable(a.profit, b.profit),
    factors: a.factors && b.factors ? blendFactors(a.factors, a.raw, b.factors, b.raw) : a.factors,
  };
}

function pooledOrigin(part: InvestmentPart): IncomeSourceOrigin {
  switch (part.type) {
    case "otherAssets":
      return { type: "otherAssets" };
    case "bankDeposit":
      return { type: "bankDeposit", bankName: part.bankName };
    case "holding":
    case "employerShares":
      return { type: "otherShares" };
  }
}

const currencyOf = (origin: IncomeSourceOrigin): WithdrawalFactors["currency"] =>
  origin.type === "esop" || origin.type === "otherShares" ? "USD" : "ILS";

/**
 * The model draws the non-pension investments as one pool, pro rata, and every part of it earns
 * the same return, so each part's share of the pool is its share of the pool's value. The share
 * holdings (and Section 3(i) shares) are one part, since the pool does not tell them apart. The
 * bank deposits are a source of their own that grows at the blend of their own rates; its parts
 * are shared out by what each deposit is worth at retirement at its own rate (a deposit with no
 * rate grows at `planRate`), so they add up to the source's balance when the drawing starts.
 */
function investmentSlotParts(
  profile: ProfileData,
  retirementAge: number,
  deposits: boolean,
  yearsToRetirement: number,
  planRate: number,
): Part[] {
  const parts = investmentParts(profile, retirementAge)
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => (part.type === "bankDeposit") === deposits)
    .map(({ part, index }) => ({
      part,
      index,
      size:
        part.type === "bankDeposit"
          ? part.value * Math.pow(1 + (part.terms.realReturn ?? planRate), yearsToRetirement)
          : part.value,
    }));
  const total = parts.reduce((sum, { size }) => sum + size, 0);
  if (total <= 0) return [{ origin: { type: "otherAssets" }, weight: 1, suffix: "", deposit: null }];

  const merged = new Map<string, Part>();
  for (const { part, index, size } of parts) {
    const origin = pooledOrigin(part);
    const suffix = origin.type === "otherShares" ? ":shares" : `:${index}`;
    const known = merged.get(suffix);
    if (known) known.weight += size / total;
    else {
      merged.set(suffix, {
        origin,
        weight: size / total,
        suffix,
        deposit: part.type === "bankDeposit" ? part.terms : null,
      });
    }
  }
  return [...merged.values()];
}

function buildSlots(household: Household): Slot[] {
  return household.members.flatMap((member, memberIndex) =>
    member.sources.map((source): Slot => {
      const owner = member.role;
      if (source.id === OTHER_INVESTMENTS_SOURCE_ID || source.id === BANK_DEPOSITS_SOURCE_ID) {
        const parts = investmentSlotParts(
          member.profile,
          member.retirementAge,
          source.id === BANK_DEPOSITS_SOURCE_ID,
          Math.max(member.retirementAge - member.currentAge, 0),
          household.rate,
        );
        return { memberIndex, owner, source, parts };
      }
      if (source.id === SECTION_102_SOURCE_ID || source.id === ORDINARY_STOCK_SOURCE_ID) {
        return {
          memberIndex,
          owner,
          source,
          parts: [{ origin: { type: "esop" }, weight: 1, suffix: "", shared: "esop", deposit: null }],
        };
      }
      const account = member.profile.pensionSavings.accounts.find(({ id }) => id === source.id);
      const origin: IncomeSourceOrigin = {
        type: "account",
        accountId: source.id,
        providerName: account?.providerName ?? "",
        policyNumber: account?.policyNumber ?? "",
        fundId: account?.fundId ?? "",
        productCategory: account?.productCategory ?? null,
        reportedReturnPct: account?.investmentAndFees.reportedYtdReturnPercent ?? null,
      };
      return { memberIndex, owner, source, parts: [{ origin, weight: 1, suffix: "", deposit: null }] };
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
  { point, row, shareRow, planned }: YearPick,
): IncomeYearDetail {
  const payments = new Map<string, Candidate[]>();
  const withdrawals = new Map<string, Candidate[]>();
  const add = (groups: Map<string, Candidate[]>, candidate: Candidate) => {
    const group = groups.get(candidate.band);
    if (!group) {
      groups.set(candidate.band, [candidate]);
      return;
    }
    const sameLine = group.findIndex(({ key }) => key === candidate.key);
    if (sameLine >= 0) group[sameLine] = mergeCandidates(group[sameLine], candidate);
    else group.push(candidate);
  };
  const active = new Set<number>();
  const lineKeys = new Set<string>();

  slots.forEach((slot, index) => {
    const holding = row.holdings[index];
    const shareHolding = shareRow.holdings[index];
    const share = shareHolding.capitalShare;
    const band = BAND_FOR_KIND[slot.source.kind];
    for (const part of slot.parts) {
      const key = partKey(slot, part);
      if (holding.annuityMonthly > 0) {
        add(payments, {
          key: `${key}:payment`,
          band,
          owner: slot.owner,
          origin: part.origin,
          mode: "payment",
          raw: holding.annuityMonthly * part.weight,
          balance: null,
          factors: null,
          profit: null,
        });
        lineKeys.add(key);
        active.add(index);
      }
      if (share > 0) {
        const balance = holding.balance * part.weight;
        add(withdrawals, {
          key: `${key}:withdrawal`,
          band,
          owner: slot.owner,
          origin: part.origin,
          mode: "withdrawal",
          raw: share * part.weight,
          balance,
          profit: balance * (part.deposit ? (part.deposit.realReturn ?? household.rate) : slot.source.realReturn),
          factors: {
            treatment: shareHolding.treatment,
            capitalGainsTaxRate: shareHolding.capitalGainsTaxRate,
            gainFraction: shareHolding.gainFraction,
            ordinaryFraction: shareHolding.ordinaryFraction,
            currency: currencyOf(part.origin),
            deposit: part.deposit,
          },
        });
        lineKeys.add(key);
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
          factors: null,
          profit: null,
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
        const key = partKey(slot, part);
        if (lineKeys.has(key)) continue;
        const known = idle.find((entry) => entry.key === key);
        if (known) {
          known.balance = (known.balance ?? 0) + balance * part.weight;
          continue;
        }
        idle.push({
          key,
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
    planned,
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
 *   non-pension investments as one pool, so its parts (cash and other assets, and the share
 *   holdings together) share the pool's draw in proportion to their value; the employer stock
 *   held through a trustee is one line however many sources it spans; the bank deposits are a
 *   source of their own, and each deposit shares its draw in proportion to its value.
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
      return row ? [{ point, row, shareRow: row, planned: point.spending + point.cover }] : [];
    });
  } else {
    const run = runIncomeBreakdown(profile, timing);
    household = run.household;
    const rows = rowsByAge(run.rows);
    picks = run.points.flatMap((point, index) => {
      const row = rows.get(point.age);
      return row ? [{ point, row, shareRow: run.shareRows[index], planned: null }] : [];
    });
  }

  const slots = buildSlots(household);
  const aligned = picks.every(
    ({ row, shareRow }) =>
      row.holdings.length === slots.length && shareRow.holdings.length === slots.length,
  );
  return aligned ? picks.map((pick) => yearDetail(household, slots, pick)) : [];
}
