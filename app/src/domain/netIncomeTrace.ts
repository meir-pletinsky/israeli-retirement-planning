import { PAYMENT_SOURCES, type DrawdownYear } from "./drawdown";
import type { Household } from "./household";
import {
  memberIncome,
  pastStatutoryAgeIn,
  personTaxInput,
  type YearDraw,
} from "./memberTax";
import type { NetIncomeEstimate, NetIncomeYear } from "./netIncome";
import { sourceTraceScope } from "./sources";
import { calculatePersonTax, recordPersonTaxSteps, type PersonTaxSources } from "./tax";
import { TAX_RATES } from "./taxRates";
import {
  fromConst,
  fromDerived,
  fromLatestStep,
  fromProfile,
  fromStep,
  input,
  recordStep,
  recordTable,
  withMember,
  withScope,
  type TraceStepBody,
} from "./trace";

/** What the net-income loop worked with in one year; collected only while tracing. */
export interface NetYearDetail {
  row: DrawdownYear;
  draws: YearDraw[];
  streamsTotal: number;
  fromSavings: number;
  /** Each member's total tax that year, before rounding. */
  memberTaxes: number[];
}

/**
 * Records how `estimate` was reached: a table of every retirement year, the
 * choice of the year with the lowest net income, and a full replay of that
 * year (the "binding" year) down to each member's tax. A no-op unless tracing.
 */
export function recordNetIncomeTrace(
  household: Household,
  monthlySpending: number,
  years: NetIncomeYear[],
  details: NetYearDetail[],
  estimate: NetIncomeEstimate,
): void {
  withScope("net", () => {
    recordYearsTable(household, years, details);

    const lowestIndex = years.reduce(
      (best, year, index) => (best < 0 || year.netMonthly < years[best].netMonthly ? index : best),
      -1,
    );
    if (lowestIndex < 0 || years[lowestIndex].grossMonthly <= 0) {
      recordNoIncome(estimate);
      return;
    }

    const lowest = years[lowestIndex];
    const detail = details[lowestIndex];
    const lowestId = recordStep("lowestNetMonthly", () => ({
      title: "Lowest net monthly income of any retirement year",
      formula: "the smallest netMonthly in the net/years table",
      expr: `min(${years.map((_year, index) => `net${index}`).join(", ")})`,
      inputs: Object.fromEntries(
        years.map((year, index) => [
          `net${index}`,
          input(year.netMonthly, fromDerived(`net/years table, row ${index}, column netMonthly`)),
        ]),
      ),
      output: lowest.netMonthly,
    }));
    const bindingId = recordStep("bindingYear", () => ({
      title: "The year whose income sets the household's net income",
      formula: "the first year whose net income equals the lowest",
      inputs: { lowestNetMonthly: input(lowest.netMonthly, fromStep(lowestId)) },
      output: detail.row.yearsFromNow,
      note: `The primary user is ${lowest.age} in that year. The steps under net/binding repeat that year's calculation in full.`,
    }));

    const binding = withScope("binding", () =>
      recordBindingYear(household, monthlySpending, lowest, detail, bindingId),
    );

    const grossId = recordStep("grossMonthlyIncome", () => ({
      title: "Gross monthly income in the binding year",
      formula: "the binding year's gross income",
      expr: "grossMonthly",
      inputs: { grossMonthly: input(lowest.grossMonthly, fromStep(binding.grossId)) },
      output: estimate.grossMonthlyIncome,
    }));
    const taxId = recordStep("taxMonthly", () => ({
      title: "Tax and contributions in the binding year, over all members",
      formula: "the binding year's tax",
      expr: "taxMonthly",
      inputs: { taxMonthly: input(lowest.taxMonthly, fromStep(binding.taxId)) },
      output: estimate.taxMonthly,
    }));
    recordStep("netMonthlyIncome", () => ({
      title: "Net monthly income the household can count on every year",
      formula: "gross income − tax in the binding year",
      expr: "grossMonthly - taxMonthly",
      inputs: {
        grossMonthly: input(estimate.grossMonthlyIncome, fromStep(grossId)),
        taxMonthly: input(estimate.taxMonthly, fromStep(taxId)),
      },
      output: estimate.netMonthlyIncome,
    }));
    recordStep("effectiveTaxRate", () => ({
      title: "Share of the gross income that goes to tax",
      formula: "tax / gross income",
      expr: "taxMonthly / grossMonthly",
      inputs: {
        taxMonthly: input(estimate.taxMonthly, fromStep(taxId)),
        grossMonthly: input(estimate.grossMonthlyIncome, fromStep(grossId)),
      },
      output: estimate.effectiveTaxRate,
    }));
    recordStep("lowestNetAge", () => ({
      title: "The primary user's age in the binding year",
      formula: "their age in that row of the net/years table",
      inputs: { yearsFromNow: input(detail.row.yearsFromNow, fromStep(bindingId)) },
      output: estimate.lowestNetAge,
    }));
  });
}

function recordNoIncome(estimate: NetIncomeEstimate): void {
  const outputs: [string, number | null][] = [
    ["grossMonthlyIncome", estimate.grossMonthlyIncome],
    ["taxMonthly", estimate.taxMonthly],
    ["netMonthlyIncome", estimate.netMonthlyIncome],
    ["effectiveTaxRate", estimate.effectiveTaxRate],
    ["lowestNetAge", estimate.lowestNetAge],
  ];
  for (const [localId, output] of outputs) {
    recordStep(localId, () => ({
      title: `${localId} when there is no retirement income`,
      formula: "no retirement year has any income, so there is nothing to tax",
      inputs: {},
      output,
    }));
  }
}

function recordYearsTable(
  household: Household,
  years: NetIncomeYear[],
  details: NetYearDetail[],
): void {
  recordTable("years", () => ({
    title: "Income and tax in every retirement year (monthly, today's money)",
    columns: [
      "yearsFromNow",
      "primaryAge",
      "taxYear",
      "streamsTotal",
      "fromSavings",
      "grossMonthly",
      ...household.members.map((member) => `tax:${member.role}`),
      "taxMonthly",
      "netMonthly",
    ],
    rows: years.map((year, index) => {
      const detail = details[index];
      return [
        detail.row.yearsFromNow,
        year.age,
        household.baseYear + detail.row.yearsFromNow,
        detail.streamsTotal,
        detail.fromSavings,
        year.grossMonthly,
        ...detail.memberTaxes,
        year.taxMonthly,
        year.netMonthly,
      ];
    }),
    note:
      "One row per year from the household's retirement to the planning horizon. streamsTotal is the sum " +
      "of the fixed monthly streams in that year (drawdown/years table); fromSavings = max(monthlySpending - " +
      "streamsTotal, 0); grossMonthly = round(streamsTotal + fromSavings); taxMonthly = round(sum of the " +
      "members' tax columns); netMonthly = grossMonthly - taxMonthly. The household can count on the lowest " +
      "netMonthly. The tax columns are the unrounded totals; their steps are under net/binding for the " +
      "year that sets the result.",
  }));
}

/** Replays the year that sets the net income, step by step. Returns the ids of its gross and tax steps. */
function recordBindingYear(
  household: Household,
  monthlySpending: number,
  lowest: NetIncomeYear,
  detail: NetYearDetail,
  bindingId: string,
): { grossId: string; taxId: string } {
  const { row, draws } = detail;
  const yearsFromNow = row.yearsFromNow;

  const taxYear = household.baseYear + yearsFromNow;
  const taxYearId = recordStep("taxYear", () => ({
    title: "Calendar year of the binding year (selects the year-dependent tax rules)",
    formula: "base year + years from now",
    expr: "baseYear + yearsFromNow",
    inputs: {
      baseYear: input(household.baseYear, fromLatestStep("baseYear", household.baseYear)),
      yearsFromNow: input(yearsFromNow, fromStep(bindingId)),
    },
    output: taxYear,
  }));
  const streamsId = recordStep("streamsTotal", () => ({
    title: "Fixed monthly streams in the binding year",
    formula: "Bituach Leumi pensions + the annuities of every account kind",
    expr: PAYMENT_SOURCES.map((_band, index) => `band${index}`).join(" + "),
    inputs: Object.fromEntries(
      PAYMENT_SOURCES.map((band, index) => [
        `band${index}`,
        input(
          row.streams[band],
          fromDerived(`drawdown/years table, row ${yearsFromNow}, column monthly:${band}`),
        ),
      ]),
    ),
    output: detail.streamsTotal,
  }));
  const savingsId = recordStep("fromSavings", () => ({
    title: "Monthly amount drawn from savings in the binding year",
    formula: "max(monthly spending − streams, 0)",
    expr: "max(monthlySpending - streamsTotal, 0)",
    inputs: {
      monthlySpending: input(
        monthlySpending,
        fromLatestStep("income/monthlyIncomeTodayMoney", monthlySpending),
      ),
      streamsTotal: input(detail.streamsTotal, fromStep(streamsId)),
    },
    output: detail.fromSavings,
  }));
  const grossId = recordStep("grossMonthly", () => ({
    title: "Gross monthly income in the binding year",
    formula: "streams + draw from savings, rounded to a whole shekel",
    expr: "round(streamsTotal + fromSavings)",
    inputs: {
      streamsTotal: input(detail.streamsTotal, fromStep(streamsId)),
      fromSavings: input(detail.fromSavings, fromStep(savingsId)),
    },
    output: lowest.grossMonthly,
  }));

  const labels = household.members.flatMap((member) =>
    member.sources.map((source) => [member.role, sourceTraceScope(source)] as const),
  );
  recordTable("holdings", () => ({
    title: "How each holding's income is taxed in the binding year",
    columns: [
      "member",
      "source",
      "treatment",
      "annuityMonthly",
      "drawCapitalShare",
      "drawAmount",
      "gainFraction",
      "ordinaryFraction",
      "capitalGainsTaxRate",
    ],
    rows: row.holdings.map((holding, index) => {
      const draw = draws[index];
      return [
        labels[index][0],
        labels[index][1],
        holding.treatment,
        holding.annuityMonthly,
        draw.holding.capitalShare,
        draw.amount,
        draw.holding.gainFraction,
        draw.holding.ordinaryFraction,
        draw.holding.capitalGainsTaxRate,
      ];
    }),
    note:
      "annuityMonthly is the account's annuity in the binding year. The draw is split over the holdings by " +
      "drawCapitalShare (the last year that had unlocked capital, when it is used up): drawAmount = " +
      "fromSavings × drawCapitalShare. For a capital-gains holding, drawAmount × ordinaryFraction is " +
      "ordinary income, drawAmount × gainFraction is a taxed capital gain at capitalGainsTaxRate, and the " +
      "rest is a return of the cost basis, which is not taxed.",
  }));

  const members = household.members.map((_member, memberIndex) =>
    recordMemberTax(household, memberIndex, detail, taxYearId, bindingId),
  );
  const taxId = recordStep("taxMonthly", () => ({
    title: "Tax and contributions in the binding year, over all members",
    formula: "the members' total tax, rounded to a whole shekel",
    expr: `round(${members.map((_member, index) => `tax${index}`).join(" + ")})`,
    inputs: Object.fromEntries(
      members.map((member, index) => [`tax${index}`, input(member.total, fromStep(member.totalId))]),
    ),
    output: lowest.taxMonthly,
  }));
  return { grossId, taxId };
}

/** Replays one member's tax in the binding year, from their income parts down to the total. */
function recordMemberTax(
  household: Household,
  memberIndex: number,
  detail: NetYearDetail,
  taxYearId: string,
  bindingId: string,
): { totalId: string; total: number } {
  const member = household.members[memberIndex];
  const { role } = member;
  const yearsFromNow = detail.row.yearsFromNow;
  const income = memberIncome(memberIndex, detail.row.holdings, detail.draws);
  const taxInput = personTaxInput(household, memberIndex, yearsFromNow, income);
  const result = calculatePersonTax(taxInput);
  const { personal, taxExemptionBasket } = member.profile;
  const basketNote = "the spouse's view carries no tax-exemption entries";

  return withMember(role, () => {
    const age = member.currentAge + yearsFromNow;
    const ageId = recordStep("age", () => ({
      title: "The member's age in the binding year",
      formula: "current age + years from now",
      expr: "currentAge + yearsFromNow",
      inputs: {
        currentAge: input(
          member.currentAge,
          fromLatestStep(`${role}/bituachLeumi/currentAge`, member.currentAge),
        ),
        yearsFromNow: input(yearsFromNow, fromStep(bindingId)),
      },
      output: age,
    }));
    const statutoryAge = member.bituachLeumi.statutoryRetirementAge;
    const pastId = recordStep("pastStatutoryAge", () => ({
      title: "Whether the member has reached the statutory retirement age",
      formula: "age >= statutory retirement age (true: the pension exemption applies; false: the pension bears health tax)",
      inputs: {
        age: input(age, fromStep(ageId)),
        statutoryAge: input(
          statutoryAge,
          fromLatestStep(`${role}/bituachLeumi/statutoryAge`, statutoryAge),
        ),
      },
      output: pastStatutoryAgeIn(household, memberIndex, yearsFromNow),
    }));

    const parts = withScope("incomeParts", () => {
      const where = (treatment: string, column: string) =>
        fromDerived(`net/binding/holdings table, member ${role}, treatment ${treatment}, sum of ${column}`);
      const pensionId = recordStep("pension", () => ({
        title: "Pension income: account annuities plus withdrawals from pension-like accounts",
        formula: "annuity payments + pension-type draws",
        expr: "annuities + draws",
        inputs: {
          annuities: input(income.annuityPension, where("pension", "annuityMonthly")),
          draws: input(income.pensionDraws, where("pension", "drawAmount")),
        },
        output: income.pensionMonthly,
      }));
      const ordinaryId = recordStep("ordinaryInvestment", () => ({
        title: "Investment income taxed as ordinary income",
        formula: "ordinary-income draws + the grant-date part of employer-share draws",
        expr: "ordinaryIncomeDraws + shareOrdinaryPart",
        inputs: {
          ordinaryIncomeDraws: input(income.ordinaryDraws, where("ordinaryIncome", "drawAmount")),
          shareOrdinaryPart: input(
            income.shareOrdinary,
            fromDerived(
              `net/binding/holdings table, member ${role}, treatment capitalGains, sum of drawAmount × ordinaryFraction`,
            ),
          ),
        },
        output: income.ordinaryInvestmentMonthly,
      }));
      const gainId = recordStep("capitalGain", () => ({
        title: "Real capital gain realised",
        formula: "sum over the capital-gains holdings of drawAmount × gainFraction",
        inputs: {},
        output: income.capitalGainMonthly,
        note: "Taken from the net/binding/holdings table.",
      }));
      const rateId = recordStep("capitalGainsRate", (): TraceStepBody =>
        income.capitalGainMonthly > 0
          ? {
              title: "Capital gains tax rate: the gain-weighted rate of the holdings",
              formula: "tax on the gain / gain",
              expr: "gainsTax / gain",
              inputs: {
                gainsTax: input(
                  income.capitalGainsTax,
                  fromDerived(
                    `net/binding/holdings table, member ${role}, treatment capitalGains, sum of drawAmount × gainFraction × capitalGainsTaxRate`,
                  ),
                ),
                gain: input(income.capitalGainMonthly, fromStep(gainId)),
              },
              output: taxInput.capitalGainsRate,
            }
          : {
              title: "Capital gains tax rate: the statutory rate, as there is no gain",
              formula: "the statutory rate",
              expr: "statutoryRate",
              inputs: {
                statutoryRate: input(
                  TAX_RATES.capitalGainsRate,
                  fromConst("TAX_RATES.capitalGainsRate"),
                ),
              },
              output: taxInput.capitalGainsRate,
            },
      );
      return { pensionId, ordinaryId, gainId, rateId };
    });

    const spouseView = role === "spouse";
    const sources: PersonTaxSources = {
      pensionMonthly: fromStep(parts.pensionId),
      ordinaryInvestmentMonthly: fromStep(parts.ordinaryId),
      capitalGainMonthly: fromStep(parts.gainId),
      capitalGainsRate: fromStep(parts.rateId),
      exemptionApplies: fromStep(pastId),
      beforeStatutoryAge: fromDerived(`the opposite of step ${pastId}`),
      taxYear: fromStep(taxYearId),
      creditPoints:
        personal.creditPoints !== null
          ? fromProfile("personal.creditPoints")
          : fromConst(
              personal.gender === "female"
                ? "TAX_RATES.defaultCreditPointsWoman"
                : "TAX_RATES.defaultCreditPointsMan",
            ),
      pastTaxFreeSeverance:
        !spouseView && taxExemptionBasket.pastTaxFreeSeveranceWithdrawn !== null
          ? fromProfile("taxExemptionBasket.pastTaxFreeSeveranceWithdrawn")
          : fromDerived(spouseView ? basketNote : "not entered, counted as 0"),
      monthlyExemptionCap:
        !spouseView && taxExemptionBasket.remainingMonthlyExemptionCap !== null
          ? fromProfile("taxExemptionBasket.remainingMonthlyExemptionCap")
          : fromDerived(spouseView ? basketNote : "not entered, so no allowance limit"),
    };
    const totalId = withScope("tax", () => recordPersonTaxSteps(taxInput, result, sources));
    return { totalId, total: result.totalMonthly };
  });
}
