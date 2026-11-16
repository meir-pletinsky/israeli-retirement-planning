import {
  averageMonthlyCoverCost,
  buildHousehold,
  resolveRetirementTiming,
  retirementTimingAtAge,
  type Household,
  type HouseholdMember,
  type RetirementTiming,
} from "./household";
import { bridgeIncomeLevels, bridgeWindowEndAge, memberCreditPoints, zeroTaxMonthlyIncome } from "./bridge";
import { futureValueOfMonthlyContributions } from "./contributions";
import {
  BANK_DEPOSITS_SOURCE_ID,
  ORDINARY_STOCK_SOURCE_ID,
  SECTION_102_SOURCE_ID,
  SOURCE_KINDS,
  sourceTraceScope,
  type RetirementSource,
  type SourceKind,
  type SourceLot,
  type TaxTreatment,
} from "./sources";
import {
  fromDerived,
  fromLatestStep,
  fromProfile,
  input,
  isTracing,
  recordStep,
  recordTable,
  withScope,
  type TraceScalar,
} from "./trace";
import {
  WITHDRAWAL_MIX_KEYS,
  type BridgeMode,
  type ProfileData,
  type WithdrawalMix,
  type WithdrawalMixKey,
  type WithdrawalStrategy,
} from "../types";
import type { RetirementScenario } from "./types";

/** Where a fixed monthly payment comes from: an account's annuity (by kind) or the state pension. */
export type PaymentSource = SourceKind | "bituachLeumi";

export const PAYMENT_SOURCES: readonly PaymentSource[] = [...SOURCE_KINDS, "bituachLeumi"];

/**
 * One source's position in a year, kept per owner so taxes can be worked out
 * for each spouse (see `netIncome.ts`).
 */
export interface DrawdownHolding {
  /** Index into `household.members` of the person who owns the source. */
  memberIndex: number;
  treatment: TaxTreatment;
  /** Tax rate on the realised gain (`capitalGains` sources only). */
  capitalGainsTaxRate: number;
  /** Fixed monthly annuity the source pays at this age, in today's money; 0 when none. */
  annuityMonthly: number;
  /** What the source holds before this year's draw, in today's money; 0 once its annuity has started. */
  balance: number;
  /**
   * This source's share of the year's draw from savings. Pro rata (and in any year with no draw)
   * it is its share of the spendable capital before the withdrawal; under an ordered strategy, in
   * a drawing year, it is the part of the draw taken from this source.
   */
  capitalShare: number;
  /** Fraction of a withdrawal that is real gain (`capitalGains` sources only). */
  gainFraction: number;
  /**
   * Fraction of a withdrawal that is ordinary income taxed at the brackets:
   * the Section 102 grant-date layer of a `capitalGains` source, or all of an
   * `ordinaryIncome` source.
   */
  ordinaryFraction: number;
}

/** What a member's Bituach Leumi pays each month `years` from now: their pension and the spouse supplement, in today's money. */
export function bituachLeumiPaymentsAt(
  member: HouseholdMember,
  years: number,
): { pension: number; supplement: number } {
  const age = member.currentAge + years;
  const { claimAge, monthlyPension, spouseSupplement } = member.bituachLeumi;
  const supplementPaid =
    spouseSupplement !== null &&
    age >= spouseSupplement.startAge &&
    (spouseSupplement.endAge === null || age < spouseSupplement.endAge);
  return {
    pension: age >= claimAge ? monthlyPension : 0,
    supplement: supplementPaid ? spouseSupplement.monthly : 0,
  };
}

/** A source whose balance turned into a monthly annuity in a year. */
export interface DrawdownConversion {
  kind: SourceKind;
  /** The balance that left the pot and became the annuity, in today's money. */
  capital: number;
  /** What the annuity pays each month, in today's money. */
  monthly: number;
}

/** One sale of employer shares under the tax-smart strategy, in a year. */
export interface BridgeSale {
  /** Index into `household.members` of the person who owns the shares. */
  memberIndex: number;
  /** The holding's ticker or company name. */
  label: string;
  /** The grant date of the batch, when known. */
  grantDate: string | null;
  /** What is sold, per year in today's money. */
  amount: number;
  /** The part of the sale taxed as ordinary income at the brackets, from 0 to 1. */
  ordinaryShare: number;
}

/** How one member's year looks under the tax-smart strategy. */
export interface BridgeMemberYear {
  memberIndex: number;
  /** True while the member is before their first fixed income (an annuity or the Bituach Leumi pension). */
  inWindow: boolean;
  /** The yearly ordinary income that bears no income tax after the credit points, in today's money. */
  zeroTaxAnnual: number;
  /** The yearly ordinary income from this year's share sales, in today's money. */
  ordinaryAnnual: number;
}

/** What the tax-smart strategy did in a drawing year. */
export interface DrawdownBridgeYear {
  members: BridgeMemberYear[];
  sales: BridgeSale[];
}

export interface DrawdownYear {
  /** The primary user's age. For a couple, the spouse is `age` minus the age gap. */
  age: number;
  /** Years from now; the row's position on the household clock. */
  yearsFromNow: number;
  /** Total of all sources at the end of this year, in today's money (unrounded). */
  netWorth: number;
  /**
   * The same total by kind, after the year's draw. A source whose annuity has started has no
   * balance: its capital is paid out as monthly income. Capital that is still locked counts.
   */
  balances: Record<SourceKind, number>;
  /** The sources whose balance became an annuity this year; empty in most years. */
  conversions: DrawdownConversion[];
  /** Fixed monthly payments active at this age (state pension and account annuities), by band. */
  streams: Record<PaymentSource, number>;
  /**
   * Each kind's share of the year's draw from savings: the share of the spendable (unlocked, not
   * annuitized) capital before this year's withdrawal when taking pro rata or when nothing is
   * drawn, and the part of the draw taken from the kind under an ordered strategy. Sums to 1, or
   * is all 0 when no capital is accessible at this age.
   */
  capitalShare: Record<SourceKind, number>;
  /** The same position per source and owner, in the order of the household's members and sources. */
  holdings: DrawdownHolding[];
  /**
   * Spending (per year, today's money) that the fixed streams and the unlocked capital could not
   * cover in a drawing year; 0 before drawing starts and whenever the spending is funded.
   */
  unmet: number;
  /**
   * Capital that could be spent this year before the draw (unlocked, not annuitised), in today's
   * money. Every year, not only drawing years.
   */
  spendable: number;
  /** What was drawn from that capital this year (per year, today's money); 0 before drawing starts. */
  drawn: number;
  /** Set in the drawing years of the "taxSmart" strategy: which shares were sold and how the owners' brackets were used. */
  bridge?: DrawdownBridgeYear;
}

/** Ways to run the simulation other than the household's own constant return. */
export interface DrawdownOptions {
  /**
   * The real return of each year from now (index 0 is the first year), earned by every source,
   * bank deposits included. A year beyond the end of the list uses each source's own return.
   * Contributions earn that year's return too.
   */
  yearlyRates?: readonly number[];
  /** Leaves out the shares and holdings the tax layer reads; balances, conversions, streams, `unmet`, `spendable` and `drawn` are still filled. Always draws pro rata, which changes who is drawn on but not how much. */
  lean?: boolean;
  /** Draws in this order instead of the household's own `withdrawalStrategy`; ignored when `lean`. */
  withdrawalStrategy?: WithdrawalStrategy;
  /** The split a "custom" draw follows, instead of the household's own `withdrawalMix`. */
  withdrawalMix?: WithdrawalMix;
  /** How much of the employer shares a "taxSmart" draw sells in the bridge years, instead of the household's own `bridgeMode`. */
  bridgeMode?: BridgeMode;
}

/**
 * A balance below this (in today's money, far below an agora) that a draw leaves behind is
 * rounding residue and counts as empty. Left in, it can be negative, and the shares of the next
 * year's draw (`balance / unlockedTotal`) then come out as noise such as -2 or 4, which made the
 * tax of the last year swing with the clock.
 */
const DRAWDOWN_DUST = 0.005;

const emptyByKind = (): Record<SourceKind, number> => ({
  pensionFund: 0,
  providentFund: 0,
  managersInsurance: 0,
  studyFund: 0,
  otherInvestments: 0,
});

/** One source's running position in the simulation. */
interface SourceState {
  member: HouseholdMember;
  memberIndex: number;
  source: RetirementSource;
  balance: number;
  basis: number;
  ordinaryLayer: number;
  annualContribution: number;
  /** Set once the source's annuity has started and its balance has been paid into it. */
  converted: boolean;
  /** The employer-share batches the balance is made of; tracked only by the "taxSmart" strategy. */
  lots: SourceLot[] | null;
}

/** How a withdrawal from a source is taxed, from its current balance, cost basis and ordinary layer. */
function taxMix(entry: SourceState): { ordinaryFraction: number; gainFraction: number } {
  const capitalGains = entry.source.taxTreatment === "capitalGains" && entry.balance > 0;
  const ordinaryFraction =
    entry.source.taxTreatment === "ordinaryIncome"
      ? 1
      : capitalGains
        ? Math.min(entry.ordinaryLayer / entry.balance, 1)
        : 0;
  return {
    ordinaryFraction,
    gainFraction: capitalGains ? Math.max(1 - entry.basis / entry.balance - ordinaryFraction, 0) : 0,
  };
}

/**
 * Where a source stands in an ordered withdrawal: sources with a lower rank are drawn first, and
 * sources with the same rank share a draw pro rata.
 * - Taxable first: the non-pension investments (including employer shares), then the investment
 *   provident fund, then pension-like money, then the tax-free study fund.
 * - Lowest tax first: the study fund, then capital-gains money by the tax on its gain, then
 *   pension-like money, then money taxed as ordinary income (employer shares and the
 *   ordinary layer of Section 102 shares).
 * The ranks only order the sources; the tax itself comes from the tax layer.
 */
function withdrawalRank(entry: SourceState, strategy: WithdrawalStrategy): number {
  const { taxTreatment, kind, capitalGainsTaxRate } = entry.source;
  if (strategy === "taxableFirst") {
    if (kind === "otherInvestments") return 0;
    if (taxTreatment === "capitalGains") return 1;
    return taxTreatment === "pension" ? 2 : 3;
  }
  if (taxTreatment === "exempt") return 0;
  if (taxTreatment === "pension") return 2;
  const { ordinaryFraction, gainFraction } = taxMix(entry);
  return (ordinaryFraction > 0 ? 3 : 1) + gainFraction * capitalGainsTaxRate;
}

/** The unlocked sources in the order they are drawn: groups that share a draw pro rata, first group first. */
function withdrawalTiers(unlocked: SourceState[], strategy: WithdrawalStrategy): SourceState[][] {
  if (strategy === "proRata") return [unlocked];
  const ranked = unlocked
    .map((entry) => ({ entry, rank: withdrawalRank(entry, strategy) }))
    .sort((a, b) => a.rank - b.rank);
  const tiers: SourceState[][] = [];
  let tierRank = Number.NaN;
  for (const { entry, rank } of ranked) {
    if (tiers.length === 0 || rank - tierRank > 1e-9) {
      tiers.push([]);
      tierRank = rank;
    }
    tiers[tiers.length - 1].push(entry);
  }
  return tiers;
}

/** Which kind of a custom split a source belongs to; null for pension-like money, which a custom split does not name. */
export function mixKeyOfSource(source: RetirementSource): WithdrawalMixKey | null {
  if (source.kind === "studyFund") return "studyFund";
  if (source.kind !== "otherInvestments") return null;
  if (source.id === SECTION_102_SOURCE_ID || source.id === ORDINARY_STOCK_SOURCE_ID) return "esop";
  return source.id === BANK_DEPOSITS_SOURCE_ID ? "deposits" : "shares";
}

function mixKeyOf({ source }: SourceState): WithdrawalMixKey | null {
  return mixKeyOfSource(source);
}

/**
 * A draw that follows the user's split: each kind is asked for its percent of what is still to be
 * drawn, a kind that cannot cover its ask gives all it has, and the shortfall is asked of the
 * other kinds by their percents. Inside a kind the draw is pro rata by balance. If every named
 * kind is empty and money is still owed, the rest comes pro rata from what remains unlocked
 * (kinds set to 0 and pension-like money), so the draw is never smaller than under pro rata.
 */
function allocateCustomDraw(unlocked: SourceState[], draw: number, mix: WithdrawalMix): number[] {
  const keys = unlocked.map(mixKeyOf);
  const kindBalance = (key: WithdrawalMixKey): number =>
    unlocked.reduce((sum, entry, index) => (keys[index] === key ? sum + Math.max(entry.balance, 0) : sum), 0);
  const kindTaken = Object.fromEntries(WITHDRAWAL_MIX_KEYS.map((key) => [key, 0])) as Record<WithdrawalMixKey, number>;
  const open = new Set(WITHDRAWAL_MIX_KEYS.filter((key) => mix[key] > 0 && kindBalance(key) > 0));
  let remaining = draw;
  while (remaining > 0 && open.size > 0) {
    const weight = [...open].reduce((sum, key) => sum + mix[key], 0);
    const capped = [...open].filter((key) => (remaining * mix[key]) / weight >= kindBalance(key));
    if (capped.length === 0) {
      for (const key of open) kindTaken[key] = (remaining * mix[key]) / weight;
      remaining = 0;
      break;
    }
    for (const key of capped) {
      kindTaken[key] = kindBalance(key);
      remaining -= kindBalance(key);
      open.delete(key);
    }
  }
  const taken = unlocked.map((entry, index) => {
    const key = keys[index];
    const total = key ? kindBalance(key) : 0;
    return key && total > 0 && entry.balance > 0 ? (kindTaken[key] * entry.balance) / total : 0;
  });
  if (remaining > 0) {
    const left = unlocked.map((entry, index) => Math.max(entry.balance - taken[index], 0));
    const leftTotal = left.reduce((sum, value) => sum + value, 0);
    if (leftTotal > 0) {
      left.forEach((value, index) => {
        taken[index] += Math.min((remaining * value) / leftTotal, value);
      });
    }
  }
  return taken;
}

/**
 * How much of `draw` comes out of each unlocked source, in the order of `unlocked`. Pro rata takes
 * the same share of every balance; an ordered strategy empties each group before starting on the
 * next, and shares the draw pro rata inside the group it ends in; a custom one follows the split
 * set by the user (see `allocateCustomDraw`).
 */
function allocateDraw(
  unlocked: SourceState[],
  unlockedTotal: number,
  draw: number,
  strategy: WithdrawalStrategy,
  mix: WithdrawalMix,
): number[] {
  if (strategy === "proRata") {
    return unlocked.map((entry) => (entry.balance > 0 ? (draw * entry.balance) / unlockedTotal : 0));
  }
  if (strategy === "custom") return allocateCustomDraw(unlocked, draw, mix);
  const taken = new Map<SourceState, number>();
  let remaining = draw;
  for (const tier of withdrawalTiers(unlocked, strategy)) {
    if (remaining <= 0) break;
    const tierTotal = tier.reduce((sum, entry) => sum + Math.max(entry.balance, 0), 0);
    if (tierTotal <= 0) continue;
    const take = Math.min(remaining, tierTotal);
    for (const entry of tier) {
      if (entry.balance > 0) taken.set(entry, Math.min((take * entry.balance) / tierTotal, entry.balance));
    }
    remaining -= take;
  }
  return unlocked.map((entry) => taken.get(entry) ?? 0);
}

/** The part of a lot's value taxed as ordinary income when it is sold. */
function lotOrdinaryShare(entry: SourceState, lot: SourceLot): number {
  if (entry.source.taxTreatment === "ordinaryIncome") return 1;
  return lot.balance > 0 ? Math.min(lot.ordinaryLayer / lot.balance, 1) : 0;
}

/** The part of a lot's value that is neither ordinary income nor a taxable gain when it is sold. */
function lotExemptShare(entry: SourceState, lot: SourceLot): number {
  if (entry.source.taxTreatment !== "capitalGains" || lot.balance <= 0) return 0;
  return Math.min(lot.exempt / lot.balance, 1 - lotOrdinaryShare(entry, lot));
}

/** What the tax-smart draw takes from each source, down to the share batch, and how it used the owners' brackets. */
interface TaxSmartAllocation {
  /** In the order of `unlocked`. */
  takenBy: number[];
  /** Per source that tracks lots: what is sold of each of its lots. */
  lotTaken: Map<SourceState, number[]>;
  bridge: DrawdownBridgeYear;
}

/**
 * The tax-smart draw. While an owner is in the bridge window (before their first annuity or
 * Bituach Leumi pension) their employer shares are sold first, the batches with the largest
 * ordinary-income part first, so that the sale is taxed at the low brackets of the window. The
 * mode sets how far that goes: up to the level of income it names for each owner, or, matching
 * the spending, up to the whole draw, filling the cheapest bracket of each owner before the
 * next. Whatever is left of the draw comes out of the other money in the lowest-tax order, and
 * only if that runs out are more shares sold. The total drawn never changes, only who pays it.
 * Outside the window the shares are drawn like the other money, and the batches of a source
 * in proportion to what is left of each.
 */
function allocateTaxSmartDraw(
  unlocked: SourceState[],
  draw: number,
  years: number,
  mode: BridgeMode,
  members: HouseholdMember[],
  windowEnds: readonly number[],
  mix: WithdrawalMix,
): TaxSmartAllocation {
  const lotTaken = new Map<SourceState, number[]>();
  for (const entry of unlocked) {
    if (entry.lots) lotTaken.set(entry, entry.lots.map(() => 0));
  }
  const inWindow = (entry: SourceState): boolean => entry.member.currentAge + years < windowEnds[entry.memberIndex];
  const windowed = unlocked.filter((entry) => entry.lots && entry.balance > 0 && inWindow(entry));
  const ordinaryByMember = members.map(() => 0);

  /** Sells up to `limit` of one member's windowed shares, largest ordinary part first, adding at most `room` of ordinary income. */
  const sellFor = (memberIndex: number, limit: number, room: number): number => {
    const candidates = windowed
      .filter((entry) => entry.memberIndex === memberIndex)
      .flatMap((entry) =>
        entry.lots!.map((lot, index) => ({ entry, index, lot, share: lotOrdinaryShare(entry, lot) })),
      )
      .sort((a, b) => b.share - a.share);
    const capped = Number.isFinite(room);
    let sold = 0;
    let roomLeft = room;
    for (const { entry, index, lot, share } of candidates) {
      if (limit - sold <= 1e-9 || roomLeft <= 1e-9) break;
      if (capped && share <= 0) break;
      const taken = lotTaken.get(entry)!;
      const amount = Math.min(lot.balance - taken[index], limit - sold, share > 0 ? roomLeft / share : Infinity);
      if (amount <= 0) continue;
      taken[index] += amount;
      sold += amount;
      roomLeft -= amount * share;
      ordinaryByMember[memberIndex] += amount * share;
    }
    return sold;
  };

  let remaining = draw;
  const windowMembers = [...new Set(windowed.map((entry) => entry.memberIndex))];
  const levels = new Map(
    windowMembers.map((index) => [index, bridgeIncomeLevels(mode, memberCreditPoints(members[index]))]),
  );
  const layerCount = Math.max(0, ...[...levels.values()].map((list) => list.length));
  for (let layer = 0; layer < layerCount && remaining > 1e-9; layer += 1) {
    const byIncome = [...windowMembers].sort((a, b) => ordinaryByMember[a] - ordinaryByMember[b]);
    for (const memberIndex of byIncome) {
      if (remaining <= 1e-9) break;
      const level = levels.get(memberIndex)![layer];
      if (level === undefined) continue;
      const room = level * 12 - ordinaryByMember[memberIndex];
      if (room > 0) remaining -= sellFor(memberIndex, remaining, room);
    }
  }

  const windowedSet = new Set(windowed);
  const others = unlocked.filter((entry) => !windowedSet.has(entry));
  const othersTotal = others.reduce((sum, entry) => sum + Math.max(entry.balance, 0), 0);
  const othersDraw = Math.min(Math.max(remaining, 0), othersTotal);
  const takenOthers =
    othersDraw > 0 ? allocateDraw(others, othersTotal, othersDraw, "lowestTaxFirst", mix) : others.map(() => 0);
  remaining -= othersDraw;
  for (const memberIndex of windowMembers) {
    if (remaining <= 1e-9) break;
    remaining -= sellFor(memberIndex, remaining, Number.POSITIVE_INFINITY);
  }

  others.forEach((entry, position) => {
    const lots = entry.lots;
    const amount = takenOthers[position];
    if (!lots || amount <= 0) return;
    const taken = lotTaken.get(entry)!;
    const total = lots.reduce((sum, lot) => sum + lot.balance, 0);
    lots.forEach((lot, index) => {
      taken[index] = total > 0 ? Math.min((amount * lot.balance) / total, lot.balance) : 0;
    });
  });

  const takenByEntry = new Map<SourceState, number>();
  others.forEach((entry, position) => takenByEntry.set(entry, takenOthers[position]));
  const sales: BridgeSale[] = [];
  const ordinaryAnnual = members.map(() => 0);
  const takenBy = unlocked.map((entry) => {
    const taken = lotTaken.get(entry);
    if (!entry.lots || !taken) return takenByEntry.get(entry) ?? 0;
    let total = 0;
    entry.lots.forEach((lot, index) => {
      if (taken[index] <= 0) return;
      const share = lotOrdinaryShare(entry, lot);
      total += taken[index];
      ordinaryAnnual[entry.memberIndex] += taken[index] * share;
      sales.push({
        memberIndex: entry.memberIndex,
        label: lot.label,
        grantDate: lot.grantDate,
        amount: taken[index],
        ordinaryShare: share,
      });
    });
    return total;
  });

  return {
    takenBy,
    lotTaken,
    bridge: {
      members: members.map((member, memberIndex) => ({
        memberIndex,
        inWindow: member.currentAge + years < windowEnds[memberIndex],
        zeroTaxAnnual: zeroTaxMonthlyIncome(memberCreditPoints(member)) * 12,
        ordinaryAnnual: ordinaryAnnual[memberIndex],
      })),
      sales,
    },
  };
}

/**
 * Year-by-year simulation of every source of a household, entirely in
 * today's money:
 * - Every balance grows at its source's real return: the plan's, except for the bank
 *   deposits, which earn their own (see `RetirementSource.realReturn`). Until its
 *   owner's retirement age, ongoing deposits are added each year.
 * - From the moment the later spouse retires, `monthlySpending` is withdrawn
 *   each year, less the fixed streams (Bituach Leumi, the spouse supplement
 *   and account annuities) once they start. It is taken from the capital that
 *   is unlocked at that point, in the order of the household's withdrawal
 *   strategy: pro rata by default, or one group of sources after another (see
 *   `withdrawalRank`). The order changes who pays the tax, not how much is
 *   drawn each year; sources with different returns can still leave different
 *   balances behind. Locked capital cannot fund spending, so a shortfall is not
 *   covered from it.
 * - An account that pays an annuity leaves the spendable pool; its capital
 *   stops counting toward net worth once the annuity starts.
 * - Balances never go negative.
 * - Capital-gains sources also track their cost basis (in today's money), so
 *   each year's `holdings` say how much of a withdrawal is taxable gain; a
 *   source with an ordinary-income layer (Section 102 shares) tracks that
 *   layer the same way and reports its share as `ordinaryFraction`.
 *
 * The first row is today (no growth or withdrawal), so it equals today's net
 * worth. Row ages are the primary user's.
 */
export function simulateHouseholdDrawdown(
  household: Household,
  monthlySpending: number,
  options: DrawdownOptions = {},
): DrawdownYear[] {
  return withScope("drawdown", () => simulate(household, monthlySpending, options));
}

/** Records the starting state of the simulation: the spending, the yearly deposits and one row per source. */
function recordDrawdownStart(
  household: Household,
  monthlySpending: number,
  state: SourceState[],
  strategy: WithdrawalStrategy,
  bridgeMode: BridgeMode,
): void {
  const { rate, retirementYears, horizonYears } = household;
  if (strategy !== "proRata") {
    recordStep("withdrawalStrategy", () => ({
      title: "Order in which the unlocked sources are drawn on",
      formula: "the withdrawal strategy chosen in the assumptions; pro rata when none is chosen",
      inputs: {
        strategy: input(strategy, fromProfile("assumptions.withdrawalStrategy")),
        ...(strategy === "taxSmart" ? { bridgeMode: input(bridgeMode, fromProfile("assumptions.bridgeMode")) } : {}),
      },
      output: strategy,
      note: "The strategy changes which source pays each year's draw, and so the tax. Each year the same gross amount is drawn as with pro rata, while the money lasts; sources that earn different returns can still leave different balances behind.",
    }));
  }
  recordStep("annualSpending", () => ({
    title: "Spending the simulation must fund each year (today's money)",
    formula: "monthly spending × 12",
    expr: "monthlySpending * 12",
    inputs: {
      monthlySpending: input(
        monthlySpending,
        fromLatestStep("income/monthlyIncomeTodayMoney", monthlySpending),
      ),
    },
    output: monthlySpending * 12,
  }));
  recordStep("rows", () => ({
    title: "Rows simulated: today, then one per year to the horizon",
    formula: "horizon years + 1",
    expr: "horizonYears + 1",
    inputs: {
      horizonYears: input(horizonYears, fromLatestStep("horizonYears", horizonYears)),
      realRate: input(rate, fromLatestStep("realRate", rate)),
      retirementYears: input(retirementYears, fromLatestStep("retirementYears", retirementYears)),
    },
    output: horizonYears + 1,
    note: "realRate is the plan's return; each source grows at its own realReturn (the sources table), which differs only for the bank deposits. retirementYears is when withdrawals start (year index >= retirementYears).",
  }));

  for (const entry of state) {
    withScope(entry.member.role, () =>
      withScope(sourceTraceScope(entry.source), () =>
        recordStep("annualContribution", () => {
          const sourceRate = entry.source.realReturn;
          const monthlyRate = Math.pow(1 + sourceRate, 1 / 12) - 1;
          const common = {
            title: "Deposits added in each year before the owner retires (today's money)",
            inputs: {
              monthlyContribution: input(
                entry.source.monthlyContribution,
                fromDerived("the source's monthlyContribution in the sources table"),
              ),
              rate: input(
                sourceRate,
                sourceRate === rate
                  ? fromLatestStep("realRate", rate)
                  : fromDerived("the source's realReturn in the sources table"),
              ),
              monthlyRate: input(monthlyRate, fromDerived("(1 + rate)^(1/12) - 1")),
            },
            output: entry.annualContribution,
          };
          if (entry.source.monthlyContribution <= 0) {
            return { ...common, formula: "0 when the source takes no deposits" };
          }
          if (Math.abs(monthlyRate) < 1e-9) {
            return {
              ...common,
              formula: "zero real rate: monthly deposit × 12",
              expr: "monthlyContribution * 12",
            };
          }
          return {
            ...common,
            formula: "monthly deposit × ((1 + rate) - 1) / monthly rate (one year of end-of-month deposits)",
            expr: "monthlyContribution * ((1 + rate) - 1) / monthlyRate",
          };
        }),
      ),
    );
  }

  recordTable("sources", () => ({
    title: "Sources at the start of the simulation (today's money)",
    columns: [
      "source",
      "kind",
      "taxTreatment",
      "balance",
      "costBasis",
      "ordinaryLayer",
      "monthlyContribution",
      "annualContribution",
      "unlockAge",
      "ownerCurrentAge",
      "ownerRetirementAge",
      "annuityStartAge",
      "annuityMonthly",
      "realReturn",
    ],
    rows: state.map(({ member, source, basis, ordinaryLayer, annualContribution }) => [
      `${member.role}: ${sourceTraceScope(source)}`,
      source.kind,
      source.taxTreatment,
      source.balance,
      basis,
      ordinaryLayer,
      source.monthlyContribution,
      annualContribution,
      source.unlockAge,
      member.currentAge,
      member.retirementAge,
      source.annuity?.startAge ?? null,
      source.annuity?.monthly ?? null,
      source.realReturn,
    ]),
    note: "costBasis and ordinaryLayer are capped as the simulation caps them: costBasis at the balance, ordinaryLayer at balance minus costBasis.",
  }));
}

/**
 * A copy of the share batches of a source for the tax-smart draw to sell from, or null when the
 * source has none or they do not add up to its balance (a source made by hand).
 */
function copyLots(source: RetirementSource): SourceLot[] | null {
  if (!source.lots || source.lots.length === 0) return null;
  const total = source.lots.reduce((sum, lot) => sum + lot.balance, 0);
  if (Math.abs(total - source.balance) > 1e-6 * Math.max(1, source.balance)) return null;
  return source.lots.map((lot) => ({ ...lot }));
}

function simulate(
  household: Household,
  monthlySpending: number,
  options: DrawdownOptions,
): DrawdownYear[] {
  const { members, retirementYears, horizonYears } = household;
  const { yearlyRates, lean = false } = options;
  const strategy = lean ? "proRata" : (options.withdrawalStrategy ?? household.withdrawalStrategy);
  const mix = options.withdrawalMix ?? household.withdrawalMix;
  const bridgeMode = options.bridgeMode ?? household.bridgeMode;
  const windowEnds = members.map(bridgeWindowEndAge);
  const annualSpending = monthlySpending * 12;
  const primary = members[0];

  const state: SourceState[] = members.flatMap((member, memberIndex) =>
    member.sources.map((source) => ({
      member,
      memberIndex,
      source,
      balance: source.balance,
      basis: Math.min(source.costBasis, source.balance),
      ordinaryLayer: Math.min(source.ordinaryLayer, Math.max(source.balance - source.costBasis, 0)),
      annualContribution: futureValueOfMonthlyContributions(source.monthlyContribution, source.realReturn, 1),
      converted: false,
      lots: strategy === "taxSmart" ? copyLots(source) : null,
    })),
  );
  if (isTracing()) {
    recordDrawdownStart(household, monthlySpending, state, strategy, bridgeMode);
  }
  const traceRows: TraceScalar[][] | null = isTracing() ? [] : null;
  const traceCover: TraceScalar[][] | null = isTracing() ? [] : null;
  const traceDraws: TraceScalar[][] | null = isTracing() && strategy !== "proRata" ? [] : null;

  const rows: DrawdownYear[] = [];
  for (let years = 0; years <= horizonYears; years += 1) {
    const conversions: DrawdownConversion[] = [];
    if (years > 0) {
      const shockedRate = yearlyRates?.[years - 1];
      for (const entry of state) {
        const age = entry.member.currentAge + years;
        const yearRate = shockedRate ?? entry.source.realReturn;
        entry.balance *= 1 + yearRate;
        entry.lots?.forEach((lot) => {
          lot.balance *= 1 + yearRate;
        });
        if (age <= entry.member.retirementAge) {
          entry.balance +=
            shockedRate === undefined
              ? entry.annualContribution
              : futureValueOfMonthlyContributions(entry.source.monthlyContribution, yearRate, 1);
          entry.basis += entry.source.monthlyContribution * 12;
        }
        if (entry.source.annuity && age >= entry.source.annuity.startAge) {
          if (!entry.converted) {
            entry.converted = true;
            conversions.push({
              kind: entry.source.kind,
              capital: entry.balance,
              monthly: entry.source.annuity.monthly,
            });
          }
          entry.balance = 0;
          entry.basis = 0;
          entry.ordinaryLayer = 0;
          entry.lots = null;
        }
      }
    }

    const streams = { ...emptyByKind(), bituachLeumi: 0 };
    for (const member of members) {
      const { pension, supplement } = bituachLeumiPaymentsAt(member, years);
      streams.bituachLeumi += pension;
      streams.bituachLeumi += supplement;
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

    let drawn = 0;
    let unmet = 0;
    let takenBy: number[] | null = null;
    let lotTaken: Map<SourceState, number[]> | null = null;
    let bridge: DrawdownBridgeYear | undefined;
    if (years > 0 && years >= retirementYears) {
      const streamsAnnual = PAYMENT_SOURCES.reduce((sum, band) => sum + streams[band], 0) * 12;
      const coverAnnual = averageMonthlyCoverCost(household, years) * 12;
      if (coverAnnual > 0) traceCover?.push([years, coverAnnual]);
      const needed = Math.max(annualSpending + coverAnnual - streamsAnnual, 0);
      const draw = Math.min(needed, unlockedTotal);
      drawn = draw;
      unmet = needed - draw;
      if (unlockedTotal > 0) {
        if (strategy === "taxSmart") {
          const allocation = allocateTaxSmartDraw(unlocked, draw, years, bridgeMode, members, windowEnds, mix);
          takenBy = allocation.takenBy;
          lotTaken = allocation.lotTaken;
          bridge = allocation.bridge;
        } else {
          takenBy = allocateDraw(unlocked, unlockedTotal, draw, strategy, mix);
        }
      }
    }

    // Under an ordered strategy the share of a drawing year is what the draw actually takes.
    const shareOfDraw = (entry: SourceState): number => {
      if (unlockedTotal <= 0) return 0;
      if (strategy !== "proRata" && takenBy && drawn > 0) {
        return takenBy[unlocked.indexOf(entry)] / drawn;
      }
      return entry.balance / unlockedTotal;
    };
    const capitalShare = emptyByKind();
    if (!lean && unlockedTotal > 0) {
      for (const entry of unlocked) {
        capitalShare[entry.source.kind] += shareOfDraw(entry);
      }
    }
    const unlockedSet = new Set(unlocked);
    // A source whose share batches were sold is taxed on the mix of those batches, not on its average.
    const soldMix = (entry: SourceState): { ordinaryFraction: number; gainFraction: number } => {
      const taken = lotTaken?.get(entry);
      const total = taken?.reduce((sum, part) => sum + part, 0) ?? 0;
      if (!entry.lots || !taken || total <= 0) return taxMix(entry);
      const ordinary = entry.lots.reduce((sum, lot, index) => sum + taken[index] * lotOrdinaryShare(entry, lot), 0);
      const exempt = entry.lots.reduce((sum, lot, index) => sum + taken[index] * lotExemptShare(entry, lot), 0);
      const ordinaryFraction = Math.min(ordinary / total, 1);
      return {
        ordinaryFraction,
        gainFraction:
          entry.source.taxTreatment === "capitalGains" ? Math.max(1 - exempt / total - ordinaryFraction, 0) : 0,
      };
    };
    const holdings: DrawdownHolding[] = lean
      ? []
      : state.map((entry) => {
          const { annuity, taxTreatment } = entry.source;
          const { ordinaryFraction, gainFraction } = soldMix(entry);
          return {
            memberIndex: entry.memberIndex,
            treatment: taxTreatment,
            capitalGainsTaxRate: entry.source.capitalGainsTaxRate,
            annuityMonthly:
              annuity && entry.member.currentAge + years >= annuity.startAge ? annuity.monthly : 0,
            balance: entry.balance,
            capitalShare: unlockedSet.has(entry) ? shareOfDraw(entry) : 0,
            gainFraction,
            ordinaryFraction,
          };
        });

    if (takenBy) {
      unlocked.forEach((entry, index) => {
        if (entry.balance <= 0) return;
        const taken = takenBy[index];
        entry.basis -= (entry.basis * taken) / entry.balance;
        entry.ordinaryLayer -= (entry.ordinaryLayer * taken) / entry.balance;
        entry.balance -= taken;
        const soldLots = lotTaken?.get(entry);
        if (entry.lots && soldLots) {
          entry.lots.forEach((lot, lotIndex) => {
            const part = soldLots[lotIndex];
            if (part <= 0 || lot.balance <= 0) return;
            lot.ordinaryLayer -= (lot.ordinaryLayer * part) / lot.balance;
            lot.exempt -= (lot.exempt * part) / lot.balance;
            lot.balance -= part;
            if (lot.balance < DRAWDOWN_DUST) {
              lot.balance = 0;
              lot.ordinaryLayer = 0;
              lot.exempt = 0;
            }
          });
          entry.balance = entry.lots.reduce((sum, lot) => sum + lot.balance, 0);
          entry.ordinaryLayer = entry.lots.reduce((sum, lot) => sum + lot.ordinaryLayer, 0);
          entry.basis = entry.lots.reduce((sum, lot) => sum + lot.exempt, 0);
        }
        if (entry.balance < DRAWDOWN_DUST) {
          entry.balance = 0;
          entry.basis = 0;
          entry.ordinaryLayer = 0;
          entry.lots?.forEach((lot) => {
            lot.balance = 0;
            lot.ordinaryLayer = 0;
            lot.exempt = 0;
          });
        }
      });
      if (traceDraws && drawn > 0) {
        traceDraws.push([years, ...state.map((entry) => takenBy[unlocked.indexOf(entry)] ?? 0)]);
      }
    }

    traceRows?.push([
      years,
      primary.currentAge + years,
      unlockedTotal,
      drawn,
      ...PAYMENT_SOURCES.map((band) => streams[band]),
      ...state.map((entry) => entry.balance),
    ]);
    const balances = emptyByKind();
    for (const entry of state) balances[entry.source.kind] += entry.balance;
    rows.push({
      age: primary.currentAge + years,
      yearsFromNow: years,
      netWorth: state.reduce((sum, entry) => sum + entry.balance, 0),
      balances,
      conversions,
      streams,
      capitalShare,
      holdings,
      unmet,
      spendable: unlockedTotal,
      drawn,
      ...(bridge ? { bridge } : {}),
    });
  }

  if (traceRows) {
    recordTable("years", () => ({
      title: "Year-by-year simulation (today's money)",
      columns: [
        "yearsFromNow",
        "primaryAge",
        "unlockedTotal",
        "annualDraw",
        ...PAYMENT_SOURCES.map((band) => `monthly:${band}`),
        ...state.map((entry) => `end:${entry.member.role}: ${sourceTraceScope(entry.source)}`),
      ],
      rows: traceRows,
      note:
        "Row 0 is today. For each later row, every source first becomes balance × (1 + realRate); " +
        "while the owner's age is at most their retirement age, annualContribution is added; a source " +
        "whose annuity has started goes to 0. Monthly streams are the Bituach Leumi pensions (and the spouse " +
        "supplement) and the account annuities active at that age. unlockedTotal is the sum of balances of " +
        "sources with no annuity whose unlockAge has been reached, before the draw. When yearsFromNow >= " +
        "retirementYears and unlockedTotal > 0, annualDraw = min(max(annualSpending + annualCoverCost - 12 × the monthly streams, 0), " +
        "unlockedTotal), where annualCoverCost is the yearly cost of survivors' cover from the coverCost table (0 when there is none), " +
        (strategy === "proRata"
          ? "taken from the unlocked sources in proportion to their balances. "
          : "taken from the unlocked sources in the order of the withdrawal strategy (see the withdrawalOrder table). ") +
        "The end: columns are balances after the draw.",
    }));
    if (traceCover && traceCover.length > 0) {
      recordTable("coverCost", () => ({
        title: "Yearly cost of survivors' cover paid out of pocket (today's money)",
        columns: ["yearsFromNow", "annualCoverCost"],
        rows: traceCover,
        note:
          "For each drawing year, the sum over the members who pay for cover of monthly cost × 12 × the part of " +
          "the year [yearsFromNow, yearsFromNow + 1] in which they pay (see each member's cover steps for the ages). " +
          "Years without a cost are left out.",
      }));
    }
    if (traceDraws) {
      recordTable("withdrawalOrder", () => ({
        title: "What each source paid of the annual draw (today's money)",
        columns: [
          "yearsFromNow",
          ...state.map((entry) => `draw:${entry.member.role}: ${sourceTraceScope(entry.source)}`),
        ],
        rows: traceDraws,
        note:
          strategy === "custom"
            ? `Your mix: study fund ${mix.studyFund}%, ESOP ${mix.esop}%, other shares ${mix.shares}%, bank deposits ${mix.deposits}% of each year's draw. A kind that has run out (or is still locked) gives what it has and the rest is asked of the other kinds by their percents; inside a kind the draw is shared in proportion to balances. If every named kind is empty, the rest comes pro rata from the other unlocked money.`
            : strategy === "taxSmart"
            ? `Tax-smart bridge (mode ${bridgeMode}): while an owner is before their first annuity or Bituach Leumi pension, their employer shares are sold first, the batches with the most ordinary income first, up to the income level of the mode (or the whole draw when matching the spending); the rest comes from the other sources in the lowest-tax order. After that window the shares are sold with the least ordinary income first, in the lowest-tax order. The total drawn is the same as under the other strategies.`
            : strategy === "taxableFirst"
            ? "Taxable first: the non-pension investments (employer shares included) are used up first, then the investment provident fund, then pension-like money, and the tax-free study fund last. Sources in the same group share the draw in proportion to their balances."
            : "Lowest tax first: the study fund first, then capital-gains money by the tax on its gain (gain share × tax rate), then pension-like money, and money taxed as ordinary income last. Sources in the same group share the draw in proportion to their balances. The order only ranks the sources; the tax itself comes from the tax step.",
      }));
    }
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
