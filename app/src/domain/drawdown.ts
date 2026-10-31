import {
  buildHousehold,
  resolveRetirementTiming,
  retirementTimingAtAge,
  type Household,
  type HouseholdMember,
  type RetirementTiming,
} from "./household";
import { futureValueOfMonthlyContributions } from "./contributions";
import {
  SOURCE_KINDS,
  sourceTraceScope,
  type RetirementSource,
  type SourceKind,
  type TaxTreatment,
} from "./sources";
import {
  fromDerived,
  fromLatestStep,
  input,
  isTracing,
  recordStep,
  recordTable,
  withScope,
  type TraceScalar,
} from "./trace";
import type { ProfileData } from "../types";
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
  /** This source's share of the spendable capital before this year's withdrawal. */
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
}

/** Ways to run the simulation other than the household's own constant return. */
export interface DrawdownOptions {
  /**
   * The real return of each year from now (index 0 is the first year). A year beyond the end of
   * the list uses the household's rate. Contributions earn that year's return too.
   */
  yearlyRates?: readonly number[];
  /** Leaves out the shares and holdings the tax layer reads; balances, streams, `unmet`, `spendable` and `drawn` are still filled. */
  lean?: boolean;
}

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
}

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
): void {
  const { rate, retirementYears, horizonYears } = household;
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
    note: "realRate drives every balance; retirementYears is when withdrawals start (year index >= retirementYears).",
  }));

  for (const entry of state) {
    withScope(entry.member.role, () =>
      withScope(sourceTraceScope(entry.source), () =>
        recordStep("annualContribution", () => {
          const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
          const common = {
            title: "Deposits added in each year before the owner retires (today's money)",
            inputs: {
              monthlyContribution: input(
                entry.source.monthlyContribution,
                fromDerived("the source's monthlyContribution in the sources table"),
              ),
              rate: input(rate, fromLatestStep("realRate", rate)),
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
    ]),
    note: "costBasis and ordinaryLayer are capped as the simulation caps them: costBasis at the balance, ordinaryLayer at balance minus costBasis.",
  }));
}

function simulate(
  household: Household,
  monthlySpending: number,
  options: DrawdownOptions,
): DrawdownYear[] {
  const { rate, members, retirementYears, horizonYears } = household;
  const { yearlyRates, lean = false } = options;
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
      annualContribution: futureValueOfMonthlyContributions(source.monthlyContribution, rate, 1),
    })),
  );
  if (isTracing()) {
    recordDrawdownStart(household, monthlySpending, state);
  }
  const traceRows: TraceScalar[][] | null = isTracing() ? [] : null;

  const rows: DrawdownYear[] = [];
  for (let years = 0; years <= horizonYears; years += 1) {
    if (years > 0) {
      const yearRate = yearlyRates?.[years - 1] ?? rate;
      for (const entry of state) {
        const age = entry.member.currentAge + years;
        entry.balance *= 1 + yearRate;
        if (age <= entry.member.retirementAge) {
          entry.balance +=
            yearRate === rate
              ? entry.annualContribution
              : futureValueOfMonthlyContributions(entry.source.monthlyContribution, yearRate, 1);
          entry.basis += entry.source.monthlyContribution * 12;
        }
        if (entry.source.annuity && age >= entry.source.annuity.startAge) {
          entry.balance = 0;
          entry.basis = 0;
          entry.ordinaryLayer = 0;
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
    if (!lean && unlockedTotal > 0) {
      for (const entry of unlocked) {
        capitalShare[entry.source.kind] += entry.balance / unlockedTotal;
      }
    }
    const unlockedSet = new Set(unlocked);
    const holdings: DrawdownHolding[] = lean
      ? []
      : state.map((entry) => {
          const { annuity, taxTreatment } = entry.source;
          const capitalGains = taxTreatment === "capitalGains" && entry.balance > 0;
          const ordinaryFraction =
            taxTreatment === "ordinaryIncome"
              ? 1
              : capitalGains
                ? Math.min(entry.ordinaryLayer / entry.balance, 1)
                : 0;
          return {
            memberIndex: entry.memberIndex,
            treatment: taxTreatment,
            capitalGainsTaxRate: entry.source.capitalGainsTaxRate,
            annuityMonthly:
              annuity && entry.member.currentAge + years >= annuity.startAge ? annuity.monthly : 0,
            capitalShare:
              unlockedTotal > 0 && unlockedSet.has(entry) ? entry.balance / unlockedTotal : 0,
            gainFraction: capitalGains
              ? Math.max(1 - entry.basis / entry.balance - ordinaryFraction, 0)
              : 0,
            ordinaryFraction,
          };
        });

    let drawn = 0;
    let unmet = 0;
    if (years > 0 && years >= retirementYears) {
      const streamsAnnual = PAYMENT_SOURCES.reduce((sum, band) => sum + streams[band], 0) * 12;
      const needed = Math.max(annualSpending - streamsAnnual, 0);
      const draw = Math.min(needed, unlockedTotal);
      drawn = draw;
      unmet = needed - draw;
      if (unlockedTotal > 0) {
        for (const entry of unlocked) {
          if (entry.balance <= 0) continue;
          const taken = (draw * entry.balance) / unlockedTotal;
          entry.basis -= (entry.basis * taken) / entry.balance;
          entry.ordinaryLayer -= (entry.ordinaryLayer * taken) / entry.balance;
          entry.balance -= taken;
        }
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
    rows.push({
      age: primary.currentAge + years,
      yearsFromNow: years,
      netWorth: state.reduce((sum, entry) => sum + entry.balance, 0),
      streams,
      capitalShare,
      holdings,
      unmet,
      spendable: unlockedTotal,
      drawn,
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
        "retirementYears and unlockedTotal > 0, annualDraw = min(max(annualSpending - 12 × the monthly streams, 0), " +
        "unlockedTotal), taken from the unlocked sources in proportion to their balances. The end: columns " +
        "are balances after the draw.",
    }));
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
