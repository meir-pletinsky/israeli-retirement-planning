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
import { sourceTraceScope } from "./sources";
import {
  fromConst,
  fromDerived,
  fromLatestStep,
  fromStep,
  input,
  isTracing,
  recordStep,
  recordTable,
  withScope,
  type TraceInput,
} from "./trace";
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
  /** For the trace: what pays this stream. */
  label: string;
}

interface Spendable {
  value: number;
  /** The primary user's age at which the capital can be spent. */
  unlockAge: number;
  /** Months after household retirement until the capital can be spent (0 = already accessible). */
  unlockMonth: number;
  /** For the trace: which source this is. */
  label: string;
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
  return withScope("income", () => estimateIncome(household));
}

function estimateIncome(household: Household): RetirementIncomeEstimate {
  const { members, rate: annualRate, retirementYears, horizonYears } = household;
  const primary = members[0];

  const monthsInRetirement = Math.round((horizonYears - retirementYears) * 12);
  const horizonMonths = Math.max(monthsInRetirement, 0);
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const monthsAfterRetirement = (yearsFromNow: number) =>
    Math.min(Math.max(Math.round((yearsFromNow - retirementYears) * 12), 0), horizonMonths);

  const retirementYearsRef = fromLatestStep("retirementYears");
  const monthsInRetirementId = recordStep("monthsInRetirement", () => ({
    title: "Months from household retirement to the planning horizon",
    formula: "round((horizon years - years until household retirement) × 12)",
    expr: "round((horizonYears - retirementYears) * 12)",
    inputs: {
      horizonYears: input(horizonYears, fromLatestStep("horizonYears")),
      retirementYears: input(retirementYears, retirementYearsRef),
    },
    output: monthsInRetirement,
  }));
  const horizonMonthsId = recordStep("horizonMonths", () => ({
    title: "Length of the drawing period in months (never negative)",
    formula: "max(months in retirement, 0)",
    expr: "max(monthsInRetirement, 0)",
    inputs: { monthsInRetirement: input(monthsInRetirement, fromStep(monthsInRetirementId)) },
    output: horizonMonths,
  }));
  const monthlyRateId = recordStep("monthlyRate", () => ({
    title: "Equivalent monthly real rate",
    formula: "(1 + real rate) ^ (1/12) - 1",
    expr: "(1 + annualRate) ^ (1 / 12) - 1",
    inputs: { annualRate: input(annualRate, fromLatestStep("realRate")) },
    output: monthlyRate,
  }));

  const streams: Stream[] = [];
  const spendable: Spendable[] = [];
  let accountAnnuityMonthly = 0;
  let netWorthAtRetirement = 0;

  for (const member of members) {
    withScope(member.role, () => {
      const monthsFromAge = (age: number) => monthsAfterRetirement(yearsUntilAge(member, age));
      const ownRetirementYears = Math.max(member.retirementAge - member.currentAge, 0);
      // An earlier retiree's pot keeps growing until the household retires.
      const catchUpGrowth = Math.pow(1 + annualRate, retirementYears - ownRetirementYears);

      const currentAgeRef = fromLatestStep(`${member.role}/currentAge`);
      const ownYearsId = recordStep("ownRetirementYears", () => ({
        title: "Years until this member retires",
        formula: "max(retirement age - current age, 0)",
        expr: "max(retirementAge - currentAge, 0)",
        inputs: {
          retirementAge: input(member.retirementAge, fromLatestStep(`${member.role}/retirementAge`)),
          currentAge: input(member.currentAge, currentAgeRef),
        },
        output: ownRetirementYears,
      }));
      const catchUpId = recordStep("catchUpGrowth", () => ({
        title: "Extra growth of this member's pots between their retirement and the household's",
        formula:
          "(1 + real rate) ^ (household years to retirement - this member's years to retirement)",
        expr: "(1 + annualRate) ^ (retirementYears - ownRetirementYears)",
        inputs: {
          annualRate: input(annualRate, fromLatestStep("realRate")),
          retirementYears: input(retirementYears, retirementYearsRef),
          ownRetirementYears: input(ownRetirementYears, fromStep(ownYearsId)),
        },
        output: catchUpGrowth,
      }));
      const recordStreamMonth = (
        localId: string,
        title: string,
        age: number,
        ageFrom: string,
        output: number,
      ) =>
        recordStep(localId, () => ({
          title,
          formula:
            "months after household retirement: round((age - current age - years until household retirement) × 12), kept between 0 and the drawing period",
          expr: "min(max(round((age - currentAge - retirementYears) * 12), 0), horizonMonths)",
          inputs: {
            age: input(age, ageFrom),
            currentAge: input(member.currentAge, currentAgeRef),
            retirementYears: input(retirementYears, retirementYearsRef),
            horizonMonths: input(horizonMonths, fromStep(horizonMonthsId)),
          },
          output,
        }));

      const { monthlyPension, claimAge, spouseSupplement } = member.bituachLeumi;
      if (monthlyPension > 0) {
        const startMonth = monthsFromAge(claimAge);
        streams.push({
          monthly: monthlyPension,
          startMonth,
          endMonth: horizonMonths,
          label: `${member.role}: Bituach Leumi pension`,
        });
        recordStreamMonth(
          "bituachLeumiStartMonth",
          "Month the Bituach Leumi pension starts",
          claimAge,
          fromLatestStep(`${member.role}/bituachLeumi/claimAge`),
          startMonth,
        );
      }
      if (spouseSupplement) {
        const startMonth = monthsFromAge(spouseSupplement.startAge);
        const endMonth =
          spouseSupplement.endAge === null ? horizonMonths : monthsFromAge(spouseSupplement.endAge);
        if (endMonth > startMonth) {
          streams.push({
            monthly: spouseSupplement.monthly,
            startMonth,
            endMonth,
            label: `${member.role}: spouse supplement`,
          });
        }
        recordStreamMonth(
          "spouseSupplementStartMonth",
          "Month the spouse supplement starts",
          spouseSupplement.startAge,
          fromDerived("members table: spouseSupplementStartAge"),
          startMonth,
        );
        if (spouseSupplement.endAge !== null) {
          recordStreamMonth(
            "spouseSupplementEndMonth",
            "Month the spouse supplement ends",
            spouseSupplement.endAge,
            fromDerived("members table: spouseSupplementEndAge"),
            endMonth,
          );
        }
      }

      for (const source of member.sources) {
        const sourceScope = sourceTraceScope(source);
        const value = source.valueAtRetirement * catchUpGrowth;
        netWorthAtRetirement += value;
        withScope(sourceScope, () => {
          recordStep("valueAtHouseholdRetirement", () => ({
            title: "Value when the household retires (today's money)",
            formula: "value at the member's own retirement × catch-up growth",
            expr: "valueAtRetirement * catchUpGrowth",
            inputs: {
              valueAtRetirement: input(
                source.valueAtRetirement,
                fromLatestStep(`${member.role}/${sourceScope}/valueAtRetirement`),
              ),
              catchUpGrowth: input(catchUpGrowth, fromStep(catchUpId)),
            },
            output: value,
          }));
          if (source.annuity) {
            accountAnnuityMonthly += source.annuity.monthly;
            const startMonth = monthsFromAge(source.annuity.startAge);
            streams.push({
              monthly: source.annuity.monthly,
              startMonth,
              endMonth: horizonMonths,
              label: `${member.role}: annuity from ${sourceScope}`,
            });
            recordStreamMonth(
              "annuityStartMonth",
              "Month the annuity starts",
              source.annuity.startAge,
              fromLatestStep(`${member.role}/${sourceScope}/annuityStartAge`),
              startMonth,
            );
          } else {
            const unlockMonth = Math.max(
              Math.round((yearsUntilAge(member, source.unlockAge) - retirementYears) * 12),
              0,
            );
            spendable.push({
              value,
              unlockAge: primaryAgeAtMemberAge(household, member, source.unlockAge),
              unlockMonth,
              label: `${member.role}: ${sourceScope}`,
            });
            recordStep("unlockMonth", () => ({
              title: "Month the capital can be spent (0 = already accessible)",
              formula:
                "max(round((unlock age - current age - years until household retirement) × 12), 0)",
              expr: "max(round((unlockAge - currentAge - retirementYears) * 12), 0)",
              inputs: {
                unlockAge: input(
                  source.unlockAge,
                  source.kind === "otherInvestments"
                    ? fromConst("ACCESS_RULES.alwaysAccessibleAge")
                    : fromLatestStep(`${member.role}/${sourceScope}/unlockAge`),
                ),
                currentAge: input(member.currentAge, currentAgeRef),
                retirementYears: input(retirementYears, retirementYearsRef),
              },
              output: unlockMonth,
            }));
          }
        });
      }
    });
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

  if (isTracing()) {
    recordIncomeInputs({
      streams,
      spendable,
      netWorthAtRetirement,
      accessibleAtRetirement,
      lockedAtRetirement,
      accountAnnuityMonthly,
      access,
    });
  }

  if (monthsInRetirement <= 0) {
    recordStep("monthlyIncomeTodayMoney", () => ({
      title: "Sustainable monthly income (today's money)",
      formula: "0 when the planning horizon is not after retirement",
      inputs: { monthsInRetirement: input(monthsInRetirement, fromStep(monthsInRetirementId)) },
      output: 0,
    }));
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
    const factor = annuityFactor(monthlyRate, months);
    return {
      unlockedCapital,
      paidStreams,
      factor,
      spending: (unlockedCapital + paidStreams) / factor,
    };
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

  const unconstrained = sustainableSpendingThrough(monthsInRetirement).spending;
  let monthlyIncome = unconstrained;
  let limitingMonth = monthsInRetirement;
  const orderedCheckpoints = [...checkpoints].sort((a, b) => a - b);
  for (const months of orderedCheckpoints) {
    const candidate = sustainableSpendingThrough(months).spending;
    if (candidate < monthlyIncome) {
      monthlyIncome = candidate;
      limitingMonth = months;
    }
  }

  const bridgeLimited = monthlyIncome < unconstrained - 0.5;
  const limitingAge = bridgeLimited ? household.drawdownStartAge + limitingMonth / 12 : null;
  if (isTracing()) {
    recordSolverSteps({
      checkpointMonths: orderedCheckpoints,
      monthsInRetirement,
      monthlyRate,
      monthlyRateId,
      spendable,
      streams,
      solve: sustainableSpendingThrough,
      monthlyIncome,
      unconstrained,
      limitingMonth,
      bridgeLimited,
      limitingAge,
      drawdownStartAge: household.drawdownStartAge,
    });
  }
  return {
    ...base,
    monthlyIncomeTodayMoney: Math.round(monthlyIncome),
    access: {
      ...access,
      bridgeLimited,
      unconstrainedMonthlyIncome: Math.round(unconstrained),
      limitingAge,
    },
  };
}

interface IncomeInputsTrace {
  streams: Stream[];
  spendable: Spendable[];
  netWorthAtRetirement: number;
  accessibleAtRetirement: number;
  lockedAtRetirement: number;
  accountAnnuityMonthly: number;
  access: RetirementAccessSummary;
}

/** Records the streams and spendable tables and the rounded totals derived from them. */
function recordIncomeInputs(trace: IncomeInputsTrace): void {
  recordTable("streams", () => ({
    title: "Fixed income streams the household receives in retirement",
    columns: ["label", "monthly", "startMonth", "endMonth"],
    rows: trace.streams.map((stream) => [
      stream.label,
      stream.monthly,
      stream.startMonth,
      stream.endMonth,
    ]),
    note: "Months are counted from the household's retirement. Amounts are monthly, in today's money.",
  }));
  recordTable("spendable", () => ({
    title: "Capital that can be spent, and when it unlocks",
    columns: ["label", "value", "unlockAgeOfPrimary", "unlockMonth"],
    rows: trace.spendable.map((entry) => [
      entry.label,
      entry.value,
      entry.unlockAge,
      entry.unlockMonth,
    ]),
    note: "Value is in today's money at the moment the household retires. Annuity accounts are streams, not capital.",
  }));
  const rounded = (localId: string, title: string, sum: number, from: string, output: number) =>
    recordStep(localId, () => ({
      title,
      formula: "round(sum)",
      expr: "round(sum)",
      inputs: { sum: input(sum, fromDerived(from)) },
      output,
    }));
  rounded(
    "netWorthAtRetirement",
    "Total savings when the household retires (today's money)",
    trace.netWorthAtRetirement,
    "sum of the valueAtHouseholdRetirement steps of all sources",
    Math.round(trace.netWorthAtRetirement),
  );
  rounded(
    "accessibleAtRetirement",
    "Capital that can be spent from the first day",
    trace.accessibleAtRetirement,
    "spendable table: sum of value where unlockMonth = 0",
    trace.access.accessibleAtRetirement,
  );
  rounded(
    "lockedAtRetirement",
    "Capital still locked on the first day",
    trace.lockedAtRetirement,
    "spendable table: sum of value where unlockMonth > 0 and value > 0",
    trace.access.lockedAtRetirement,
  );
  rounded(
    "accountAnnuityMonthly",
    "Monthly annuities from accounts",
    trace.accountAnnuityMonthly,
    "sum of the annuityMonthly steps of all sources",
    trace.access.accountAnnuityMonthly,
  );
  recordStep("nextUnlockAge", () => ({
    title: "Primary user's age when the next locked capital unlocks",
    formula: "the smallest unlockAgeOfPrimary among locked entries of the spendable table, or none",
    inputs: {},
    output: trace.access.nextUnlockAge,
  }));
}

interface SolverTrace {
  checkpointMonths: number[];
  monthsInRetirement: number;
  monthlyRate: number;
  monthlyRateId: string;
  spendable: Spendable[];
  streams: Stream[];
  solve: (months: number) => {
    unlockedCapital: number;
    paidStreams: number;
    factor: number;
    spending: number;
  };
  monthlyIncome: number;
  unconstrained: number;
  limitingMonth: number;
  bridgeLimited: boolean;
  limitingAge: number | null;
  drawdownStartAge: number;
}

/** Records, for every checkpoint of the solver, the capital, payments and level of spending it allows. */
function recordSolverSteps(trace: SolverTrace): void {
  const months = [...trace.checkpointMonths, trace.monthsInRetirement];
  const reasonsFor = (month: number): string => {
    const parts: string[] = [];
    if (month === trace.monthsInRetirement) parts.push("planning horizon");
    for (const entry of trace.spendable) {
      if (entry.value > 0 && entry.unlockMonth === month) parts.push(`unlock ${entry.label}`);
    }
    for (const stream of trace.streams) {
      if (stream.startMonth === month) parts.push(`start ${stream.label}`);
      if (stream.endMonth === month) parts.push(`end ${stream.label}`);
    }
    return parts.join("; ");
  };

  const zeroRate = Math.abs(trace.monthlyRate) < 1e-9;
  const spendingInputs: Record<string, TraceInput> = {};
  const rows: (number | string | boolean)[][] = [];
  let horizonSpendingId = "";
  months.forEach((month, index) => {
    const result = trace.solve(month);
    withScope(`solver/m${month}`, () => {
      const factorId = recordStep("annuityFactor", () => ({
        title: "Present value of 1 paid each month through this month",
        formula: zeroRate
          ? "the number of months (the rate is zero)"
          : "(1 - (1 + monthly rate) ^ -months) / monthly rate",
        expr: zeroRate ? "months" : "(1 - (1 + monthlyRate) ^ (-months)) / monthlyRate",
        inputs: {
          months: input(month, fromDerived("checkpoint month")),
          monthlyRate: input(trace.monthlyRate, fromStep(trace.monthlyRateId)),
        },
        output: result.factor,
      }));
      const spendingId = recordStep("spending", () => ({
        title: "Largest level monthly spending funded through this month",
        formula:
          "(capital unlocked before this month + the streams paid so far, valued today) / annuity factor",
        expr: "(unlockedCapital + paidStreams) / annuityFactor",
        inputs: {
          unlockedCapital: input(
            result.unlockedCapital,
            fromDerived("spendable table: sum of value where unlockMonth < months"),
          ),
          paidStreams: input(
            result.paidStreams,
            fromDerived(
              "streams table: sum over streams with startMonth < months of monthly × (A(min(months, endMonth)) - A(startMonth)), A = annuity factor",
            ),
          ),
          annuityFactor: input(result.factor, fromStep(factorId)),
        },
        output: result.spending,
      }));
      spendingInputs[`s${index}`] = input(result.spending, fromStep(spendingId));
      if (month === trace.monthsInRetirement) horizonSpendingId = spendingId;
    });
    rows.push([
      month,
      reasonsFor(month),
      result.unlockedCapital,
      result.paidStreams,
      result.factor,
      result.spending,
      month === trace.limitingMonth,
    ]);
  });

  recordTable("solver", () => ({
    title: "Retirement-income solver: one row per checkpoint",
    columns: [
      "month",
      "why",
      "unlockedCapital",
      "paidStreams",
      "annuityFactor",
      "spending",
      "binding",
    ],
    rows,
    note: "The sustainable income is the smallest 'spending' value, so the capital lasts through every checkpoint.",
  }));

  const incomeId = recordStep("monthlyIncome", () => ({
    title: "Sustainable monthly income before rounding (today's money)",
    formula: "the smallest spending level over all checkpoints",
    expr: `min(${Object.keys(spendingInputs).join(", ")})`,
    inputs: spendingInputs,
    output: trace.monthlyIncome,
    note: `binding checkpoint: month ${trace.limitingMonth} after household retirement`,
  }));
  recordStep("monthlyIncomeTodayMoney", () => ({
    title: "Sustainable monthly income (today's money), rounded",
    formula: "round(monthly income)",
    expr: "round(monthlyIncome)",
    inputs: { monthlyIncome: input(trace.monthlyIncome, fromStep(incomeId)) },
    output: Math.round(trace.monthlyIncome),
  }));
  recordStep("unconstrainedMonthlyIncome", () => ({
    title: "Income if nothing were locked (the planning-horizon level), rounded",
    formula: "round(spending at the planning horizon)",
    expr: "round(horizonSpending)",
    inputs: {
      horizonSpending: input(trace.unconstrained, fromStep(horizonSpendingId)),
    },
    output: Math.round(trace.unconstrained),
  }));
  recordStep("bridgeLimited", () => ({
    title: "Whether locked money or payment timing lowers the income",
    formula: "monthly income < unconstrained income - 0.5",
    inputs: {
      monthlyIncome: input(trace.monthlyIncome, fromStep(incomeId)),
      unconstrained: input(trace.unconstrained, fromStep(horizonSpendingId)),
    },
    output: trace.bridgeLimited,
  }));
  if (trace.bridgeLimited) {
    recordStep("limitingAge", () => ({
      title: "Primary user's age at the binding checkpoint",
      formula: "household drawing start age + binding month / 12",
      expr: "drawdownStartAge + limitingMonth / 12",
      inputs: {
        drawdownStartAge: input(trace.drawdownStartAge, fromLatestStep("drawdownStartAge")),
        limitingMonth: input(trace.limitingMonth, fromDerived("solver table: the row marked binding")),
      },
      output: trace.limitingAge,
    }));
  }
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
