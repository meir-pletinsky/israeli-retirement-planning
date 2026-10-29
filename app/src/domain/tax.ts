import type { Gender } from "../types";
import { TAX_RATES as RATES } from "./taxRates";
import {
  fromConst,
  fromDerived,
  fromStep,
  input,
  recordStep,
  recordTable,
  type TraceSource,
} from "./trace";

/**
 * One person's income tax in retirement, for one year at a steady monthly
 * rhythm (everything is a monthly amount in today's money).
 *
 * What is modelled (see docs/implementation-progress.md, Phases I and L):
 * - Pension income is taxed at the progressive brackets, less credit points.
 *   From the statutory retirement age part of it is exempt (Section 9A
 *   qualifying annuity); the exempt share depends on the tax year.
 * - Before the statutory retirement age, a pension also bears health tax.
 * - Real capital gains are taxed at a flat rate, outside the brackets.
 * - Employer shares sold under Section 102 are split: the grant-date value is
 *   ordinary income, stacked on top of the pension at the brackets (no
 *   pension exemption); the rest is a capital gain. The ordinary part also
 *   bears health tax, and before the statutory retirement age Bituach Leumi
 *   contributions, up to the maximum insured income.
 * - Surtax applies to income above the threshold, with an extra rate on the
 *   capital-income part.
 * - Bituach Leumi pensions and study-fund withdrawals are exempt and never
 *   reach this function.
 *
 * Not modelled: health tax on income other than pension and Section 102
 * shares, contributions being tax-deductible, other credit points (children,
 * new immigrants, ...), tax spreading and coordination between spouses.
 */
export interface PersonTaxInput {
  /** Monthly income taxed as a pension: annuity payments and withdrawals from pension-like accounts. */
  pensionMonthly: number;
  /** True from the statutory retirement age, when the qualifying-annuity exemption applies. */
  exemptionApplies: boolean;
  /**
   * True before the statutory retirement age: a pension bears health tax, and
   * the ordinary part of Section 102 shares bears Bituach Leumi contributions.
   */
  beforeStatutoryAge: boolean;
  /** The calendar year the income falls in; selects the exemption share. */
  taxYear: number;
  /** Real gain realised each month on securities and investment provident funds. */
  capitalGainMonthly: number;
  /** Tax rate on that gain; the statutory rate unless the user entered another for a holding. */
  capitalGainsRate: number;
  /**
   * Monthly proceeds of employer shares that are ordinary income (Section
   * 102 grant-date value, or all of an ordinary-income sale). Taxed at the
   * brackets on top of the pension, with no pension exemption, and bearing
   * health tax and (before the statutory age) Bituach Leumi contributions.
   */
  ordinaryInvestmentMonthly: number;
  creditPoints: number;
  /** Tax-free severance already withdrawn, which shrinks the conditional exemption. */
  pastTaxFreeSeverance: number;
  /** The user's remaining monthly exemption from the rights fixation, when known. */
  monthlyExemptionCap: number | null;
}

export interface PersonTax {
  /** Pension that is exempt under Section 9A. */
  exemptPensionMonthly: number;
  /** Progressive income tax after credit points. */
  incomeTaxMonthly: number;
  capitalGainsTaxMonthly: number;
  surtaxMonthly: number;
  /**
   * Health tax on a pension paid before the statutory retirement age, and on
   * the ordinary part of Section 102 shares at any age.
   */
  healthTaxMonthly: number;
  /** Bituach Leumi contributions on the ordinary part of Section 102 shares, before the statutory age. */
  nationalInsuranceMonthly: number;
  totalMonthly: number;
}

/** Credit points when the user has not entered their own: 2.25 for a man, 2.75 for a woman. */
export function defaultCreditPoints(gender: Gender | null): number {
  return gender === "female" ? RATES.defaultCreditPointsWoman : RATES.defaultCreditPointsMan;
}

/** Tax on a monthly income at the progressive brackets, before credit points. */
export function progressiveTax(monthlyIncome: number): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of RATES.monthlyBrackets) {
    if (monthlyIncome <= lower) break;
    tax += (Math.min(monthlyIncome, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** The first and last year of the exemption schedule, for the notes shown to the user. */
export const FIRST_EXEMPTION_YEAR = RATES.qualifyingAnnuityFixedExemptionSchedule[0].fromYear;
export const FINAL_EXEMPTION_YEAR =
  RATES.qualifyingAnnuityFixedExemptionSchedule[
    RATES.qualifyingAnnuityFixedExemptionSchedule.length - 1
  ].fromYear;

/** The fixed share of the qualifying-annuity exemption in `taxYear`. */
export function fixedExemptionRate(taxYear: number): number {
  const schedule = RATES.qualifyingAnnuityFixedExemptionSchedule;
  let rate: number = schedule[0].rate;
  for (const step of schedule) {
    if (taxYear >= step.fromYear) rate = step.rate;
  }
  return rate;
}

/** Fixed plus conditional share: the exempt part of a pension up to the ceiling, before any severance offset. */
export function totalExemptionRate(taxYear: number): number {
  return fixedExemptionRate(taxYear) + RATES.qualifyingAnnuityConditionalExemptionRate;
}

/**
 * The exempt part of a monthly qualifying annuity: the fixed share and the
 * conditional share (less the severance offset) of the pension up to the
 * ceiling, limited by the user's remaining allowance when they entered one.
 * The allowance is used as entered in every year, even though the shares
 * grow after 2026.
 */
export function qualifyingAnnuityExemption(
  pensionMonthly: number,
  pastTaxFreeSeverance: number,
  monthlyExemptionCap: number | null,
  taxYear: number,
): number {
  const covered = Math.min(Math.max(pensionMonthly, 0), RATES.qualifyingAnnuityMonthlyCeiling);
  const severanceOffset =
    (Math.max(pastTaxFreeSeverance, 0) * RATES.severanceExemptionFactor) /
    RATES.severanceExemptionMonths;
  const exempt =
    covered * fixedExemptionRate(taxYear) +
    Math.max(covered * RATES.qualifyingAnnuityConditionalExemptionRate - severanceOffset, 0);
  return monthlyExemptionCap === null ? exempt : Math.min(exempt, Math.max(monthlyExemptionCap, 0));
}

/** Health tax on a monthly pension paid before the statutory retirement age. */
export function earlyPensionHealthTax(pensionMonthly: number): number {
  const pension = Math.max(pensionMonthly, 0);
  const reduced = Math.min(pension, RATES.healthTaxReducedBracketMonthly);
  const full = pension - reduced;
  return reduced * RATES.healthTaxReducedRate + full * RATES.healthTaxFullRate;
}

/**
 * Health tax and Bituach Leumi contributions on `ordinaryMonthly` of Section
 * 102 income that sits above `startMonthly` of other contribution-bearing
 * income. Only the slice below the maximum insured income pays, and the
 * reduced rates apply to the part of the stack up to the reduced bracket.
 * Health tax is due at any age; Bituach Leumi only before the statutory
 * retirement age.
 */
export function employerShareContributions(
  startMonthly: number,
  ordinaryMonthly: number,
  beforeStatutoryAge: boolean,
): { nationalInsurance: number; health: number } {
  const ceiling = RATES.contributionCeilingMonthly;
  const bracket = RATES.healthTaxReducedBracketMonthly;
  const lower = Math.min(Math.max(startMonthly, 0), ceiling);
  const upper = Math.min(lower + Math.max(ordinaryMonthly, 0), ceiling);
  const reduced = Math.max(Math.min(upper, bracket) - Math.min(lower, bracket), 0);
  const full = upper - lower - reduced;
  return {
    nationalInsurance: beforeStatutoryAge
      ? reduced * RATES.nationalInsuranceReducedRate + full * RATES.nationalInsuranceFullRate
      : 0,
    health: reduced * RATES.healthTaxReducedRate + full * RATES.healthTaxFullRate,
  };
}

export function calculatePersonTax(input: PersonTaxInput): PersonTax {
  const pension = Math.max(input.pensionMonthly, 0);
  const capitalGain = Math.max(input.capitalGainMonthly, 0);
  const ordinaryInvestment = Math.max(input.ordinaryInvestmentMonthly, 0);

  const exemptPensionMonthly = input.exemptionApplies
    ? qualifyingAnnuityExemption(
        pension,
        input.pastTaxFreeSeverance,
        input.monthlyExemptionCap,
        input.taxYear,
      )
    : 0;
  const taxablePension = pension - exemptPensionMonthly;

  const credits = Math.max(input.creditPoints, 0) * RATES.creditPointMonthlyValue;
  const incomeTaxMonthly = Math.max(
    progressiveTax(taxablePension + ordinaryInvestment) - credits,
    0,
  );
  const capitalGainsTaxMonthly = capitalGain * Math.max(input.capitalGainsRate, 0);
  const pensionHealthTax = input.beforeStatutoryAge ? earlyPensionHealthTax(pension) : 0;
  const shareContributions = employerShareContributions(
    input.beforeStatutoryAge ? pension : 0,
    ordinaryInvestment,
    input.beforeStatutoryAge,
  );
  const healthTaxMonthly = pensionHealthTax + shareContributions.health;
  const nationalInsuranceMonthly = shareContributions.nationalInsurance;

  const surtaxExcess = Math.max(
    taxablePension + ordinaryInvestment + capitalGain - RATES.surtaxAnnualThreshold / 12,
    0,
  );
  const surtaxMonthly =
    surtaxExcess * RATES.surtaxRate +
    Math.min(capitalGain, surtaxExcess) * RATES.surtaxCapitalIncomeExtraRate;

  return {
    exemptPensionMonthly,
    incomeTaxMonthly,
    capitalGainsTaxMonthly,
    surtaxMonthly,
    healthTaxMonthly,
    nationalInsuranceMonthly,
    totalMonthly:
      incomeTaxMonthly +
      capitalGainsTaxMonthly +
      surtaxMonthly +
      healthTaxMonthly +
      nationalInsuranceMonthly,
  };
}

/** Where each field of a `PersonTaxInput` came from, for the trace; unlisted fields are recorded as derived. */
export type PersonTaxSources = Partial<Record<keyof PersonTaxInput, TraceSource>>;

/**
 * Records, as trace steps in the current scope, how `result` (the output of
 * `calculatePersonTax(taxInput)`) comes about. Every step's `output` is taken
 * from the real helpers or from `result`, while its `expr` restates the rule
 * independently, so a reader (or the trace self-check) can tell when the code
 * and the documented formula disagree. Returns the id of the total-tax step.
 */
export function recordPersonTaxSteps(
  taxInput: PersonTaxInput,
  result: PersonTax,
  sources: PersonTaxSources = {},
): string {
  const from = (key: keyof PersonTaxInput): TraceSource =>
    sources[key] ?? fromDerived(`the person-tax input ${key}`);
  const rate = (name: keyof typeof RATES): TraceSource => fromConst(`TAX_RATES.${name}`);

  const pension = Math.max(taxInput.pensionMonthly, 0);
  const ordinaryInvestment = Math.max(taxInput.ordinaryInvestmentMonthly, 0);
  const capitalGain = Math.max(taxInput.capitalGainMonthly, 0);

  const pensionId = recordStep("pension", () => ({
    title: "Pension income taxed as a pension (monthly)",
    formula: "pension income, never below 0",
    expr: "max(pensionMonthly, 0)",
    inputs: { pensionMonthly: input(taxInput.pensionMonthly, from("pensionMonthly")) },
    output: pension,
  }));

  let exemptId: string;
  if (taxInput.exemptionApplies) {
    const ceiling = RATES.qualifyingAnnuityMonthlyCeiling;
    const covered = Math.min(pension, ceiling);
    const coveredId = recordStep("coveredPension", () => ({
      title: "Pension up to the qualifying-annuity ceiling",
      formula: "the pension, capped at the ceiling",
      expr: "min(pension, ceiling)",
      inputs: {
        pension: input(pension, fromStep(pensionId)),
        ceiling: input(ceiling, rate("qualifyingAnnuityMonthlyCeiling")),
      },
      output: covered,
    }));
    const fixedRate = fixedExemptionRate(taxInput.taxYear);
    const fixedId = recordStep("fixedExemptionRate", () => ({
      title: "Fixed exempt share of a qualifying annuity in the tax year",
      formula: "the last schedule entry whose year is not after the tax year",
      inputs: { taxYear: input(taxInput.taxYear, from("taxYear")) },
      output: fixedRate,
      note:
        "schedule (from year: share): " +
        RATES.qualifyingAnnuityFixedExemptionSchedule
          .map((entry) => `${entry.fromYear}: ${entry.rate}`)
          .join(", "),
    }));
    const severanceOffset =
      (Math.max(taxInput.pastTaxFreeSeverance, 0) * RATES.severanceExemptionFactor) /
      RATES.severanceExemptionMonths;
    const offsetId = recordStep("severanceOffset", () => ({
      title: "Monthly exemption used up by tax-free severance already withdrawn",
      formula: "tax-free severance × factor / months",
      expr: "max(pastTaxFreeSeverance, 0) * factor / months",
      inputs: {
        pastTaxFreeSeverance: input(taxInput.pastTaxFreeSeverance, from("pastTaxFreeSeverance")),
        factor: input(RATES.severanceExemptionFactor, rate("severanceExemptionFactor")),
        months: input(RATES.severanceExemptionMonths, rate("severanceExemptionMonths")),
      },
      output: severanceOffset,
    }));
    const uncapped =
      covered * fixedRate +
      Math.max(covered * RATES.qualifyingAnnuityConditionalExemptionRate - severanceOffset, 0);
    const uncappedId = recordStep("exemptBeforeCap", () => ({
      title: "Exempt pension before any personal allowance",
      formula: "covered × fixed share + max(covered × conditional share − severance offset, 0)",
      expr: "covered * fixedRate + max(covered * conditionalRate - severanceOffset, 0)",
      inputs: {
        covered: input(covered, fromStep(coveredId)),
        fixedRate: input(fixedRate, fromStep(fixedId)),
        conditionalRate: input(
          RATES.qualifyingAnnuityConditionalExemptionRate,
          rate("qualifyingAnnuityConditionalExemptionRate"),
        ),
        severanceOffset: input(severanceOffset, fromStep(offsetId)),
      },
      output: uncapped,
    }));
    exemptId = recordStep("exemptPension", () => ({
      title: "Pension exempt from tax (Section 9A)",
      formula:
        taxInput.monthlyExemptionCap === null
          ? "no personal allowance entered: the exempt amount as computed"
          : "the smaller of the computed exemption and the user's remaining monthly allowance",
      ...(taxInput.monthlyExemptionCap === null
        ? { expr: "exemptBeforeCap" }
        : { expr: "min(exemptBeforeCap, max(allowance, 0))" }),
      inputs: {
        exemptBeforeCap: input(uncapped, fromStep(uncappedId)),
        ...(taxInput.monthlyExemptionCap === null
          ? {}
          : { allowance: input(taxInput.monthlyExemptionCap, from("monthlyExemptionCap")) }),
      },
      output: result.exemptPensionMonthly,
    }));
  } else {
    exemptId = recordStep("exemptPension", () => ({
      title: "Pension exempt from tax (Section 9A)",
      formula: "0 before the statutory retirement age",
      inputs: { exemptionApplies: input(false, from("exemptionApplies")) },
      output: result.exemptPensionMonthly,
    }));
  }

  const taxablePension = pension - result.exemptPensionMonthly;
  const taxablePensionId = recordStep("taxablePension", () => ({
    title: "Pension that is taxed at the brackets",
    formula: "pension − exempt pension",
    expr: "pension - exemptPension",
    inputs: {
      pension: input(pension, fromStep(pensionId)),
      exemptPension: input(result.exemptPensionMonthly, fromStep(exemptId)),
    },
    output: taxablePension,
  }));
  const ordinaryId = recordStep("ordinaryInvestment", () => ({
    title: "Investment income taxed as ordinary income (monthly)",
    formula: "ordinary-income part of withdrawals, never below 0",
    expr: "max(ordinaryInvestmentMonthly, 0)",
    inputs: {
      ordinaryInvestmentMonthly: input(
        taxInput.ordinaryInvestmentMonthly,
        from("ordinaryInvestmentMonthly"),
      ),
    },
    output: ordinaryInvestment,
  }));
  const gainId = recordStep("capitalGain", () => ({
    title: "Real capital gain realised (monthly)",
    formula: "capital gain, never below 0",
    expr: "max(capitalGainMonthly, 0)",
    inputs: { capitalGainMonthly: input(taxInput.capitalGainMonthly, from("capitalGainMonthly")) },
    output: capitalGain,
  }));
  const taxableIncome = taxablePension + ordinaryInvestment;
  const taxableIncomeId = recordStep("taxableIncome", () => ({
    title: "Income taxed at the brackets",
    formula: "taxable pension + ordinary investment income",
    expr: "taxablePension + ordinaryInvestment",
    inputs: {
      taxablePension: input(taxablePension, fromStep(taxablePensionId)),
      ordinaryInvestment: input(ordinaryInvestment, fromStep(ordinaryId)),
    },
    output: taxableIncome,
  }));

  const bracketRows: [number, number, number, number, number][] = [];
  let lower = 0;
  for (const bracket of RATES.monthlyBrackets) {
    if (taxableIncome <= lower) {
      bracketRows.push([lower, bracket.upTo, bracket.rate, 0, 0]);
    } else {
      const inBracket = Math.min(taxableIncome, bracket.upTo) - lower;
      bracketRows.push([lower, bracket.upTo, bracket.rate, inBracket, inBracket * bracket.rate]);
    }
    lower = bracket.upTo;
  }
  recordTable("brackets", () => ({
    title: "Progressive brackets applied to the taxable income (monthly)",
    columns: ["from", "upTo", "rate", "incomeInBracket", "tax"],
    rows: bracketRows,
    note: "Brackets come from TAX_RATES.monthlyBrackets; the last bracket is open-ended.",
  }));
  const bracketTax = progressiveTax(taxableIncome);
  const bracketInputs = Object.fromEntries(
    bracketRows.map((row, index) => [
      `bracket${index}`,
      input(row[4], fromDerived(`row ${index} of the brackets table, column tax`)),
    ]),
  );
  const bracketTaxId = recordStep("bracketTax", () => ({
    title: "Tax at the progressive brackets, before credit points",
    formula: "the sum of the tax column of the brackets table",
    expr: bracketRows.map((_row, index) => `bracket${index}`).join(" + "),
    inputs: {
      taxableIncome: input(taxableIncome, fromStep(taxableIncomeId)),
      ...bracketInputs,
    },
    output: bracketTax,
  }));
  const credits = Math.max(taxInput.creditPoints, 0) * RATES.creditPointMonthlyValue;
  const creditsId = recordStep("credits", () => ({
    title: "Value of the credit points (monthly)",
    formula: "credit points × value of one point",
    expr: "max(creditPoints, 0) * pointValue",
    inputs: {
      creditPoints: input(taxInput.creditPoints, from("creditPoints")),
      pointValue: input(RATES.creditPointMonthlyValue, rate("creditPointMonthlyValue")),
    },
    output: credits,
  }));
  const incomeTaxId = recordStep("incomeTax", () => ({
    title: "Income tax after credit points",
    formula: "max(bracket tax − credits, 0)",
    expr: "max(bracketTax - credits, 0)",
    inputs: {
      bracketTax: input(bracketTax, fromStep(bracketTaxId)),
      credits: input(credits, fromStep(creditsId)),
    },
    output: result.incomeTaxMonthly,
  }));
  const capitalGainsTaxId = recordStep("capitalGainsTax", () => ({
    title: "Tax on the capital gain (flat rate)",
    formula: "capital gain × rate",
    expr: "capitalGain * max(rate, 0)",
    inputs: {
      capitalGain: input(capitalGain, fromStep(gainId)),
      rate: input(taxInput.capitalGainsRate, from("capitalGainsRate")),
    },
    output: result.capitalGainsTaxMonthly,
  }));

  const pensionHealthTax = taxInput.beforeStatutoryAge ? earlyPensionHealthTax(pension) : 0;
  const pensionHealthTaxId = taxInput.beforeStatutoryAge
    ? recordStep("pensionHealthTax", () => ({
        title: "Health tax on a pension paid before the statutory retirement age",
        formula: "reduced rate up to the reduced bracket, full rate above it",
        expr: "min(pension, bracket) * reducedRate + (pension - min(pension, bracket)) * fullRate",
        inputs: {
          pension: input(pension, fromStep(pensionId)),
          bracket: input(
            RATES.healthTaxReducedBracketMonthly,
            rate("healthTaxReducedBracketMonthly"),
          ),
          reducedRate: input(RATES.healthTaxReducedRate, rate("healthTaxReducedRate")),
          fullRate: input(RATES.healthTaxFullRate, rate("healthTaxFullRate")),
        },
        output: pensionHealthTax,
      }))
    : recordStep("pensionHealthTax", () => ({
        title: "Health tax on a pension paid before the statutory retirement age",
        formula: "0 from the statutory retirement age",
        inputs: { beforeStatutoryAge: input(false, from("beforeStatutoryAge")) },
        output: pensionHealthTax,
      }));

  const shares = employerShareContributions(
    taxInput.beforeStatutoryAge ? pension : 0,
    ordinaryInvestment,
    taxInput.beforeStatutoryAge,
  );
  let shareHealthId: string;
  let shareInsuranceId: string;
  if (ordinaryInvestment > 0) {
    const ceiling = RATES.contributionCeilingMonthly;
    const bracket = RATES.healthTaxReducedBracketMonthly;
    const start = taxInput.beforeStatutoryAge ? pension : 0;
    const shareLower = Math.min(Math.max(start, 0), ceiling);
    const shareUpper = Math.min(shareLower + ordinaryInvestment, ceiling);
    const shareReduced = Math.max(Math.min(shareUpper, bracket) - Math.min(shareLower, bracket), 0);
    const shareFull = shareUpper - shareLower - shareReduced;
    const lowerId = recordStep("shareContributionStart", () => ({
      title: "Where the ordinary-income shares start in the contribution stack",
      formula: "other contribution-bearing income (the pension, before the statutory age), capped at the ceiling",
      expr: "min(max(start, 0), ceiling)",
      inputs: {
        start: input(start, fromStep(pensionId)),
        ceiling: input(ceiling, rate("contributionCeilingMonthly")),
      },
      output: shareLower,
      note: start === 0 ? "From the statutory age the pension adds no contributions, so the stack starts at 0." : undefined,
    }));
    const upperId = recordStep("shareContributionTop", () => ({
      title: "Where the ordinary-income shares end in the contribution stack",
      formula: "start + ordinary income, capped at the ceiling",
      expr: "min(start + ordinaryInvestment, ceiling)",
      inputs: {
        start: input(shareLower, fromStep(lowerId)),
        ordinaryInvestment: input(ordinaryInvestment, fromStep(ordinaryId)),
        ceiling: input(ceiling, rate("contributionCeilingMonthly")),
      },
      output: shareUpper,
    }));
    const reducedId = recordStep("shareAtReducedRate", () => ({
      title: "Part of the shares' slice that bears the reduced rates",
      formula: "the overlap of the slice with the reduced bracket",
      expr: "max(min(top, bracket) - min(start, bracket), 0)",
      inputs: {
        top: input(shareUpper, fromStep(upperId)),
        start: input(shareLower, fromStep(lowerId)),
        bracket: input(bracket, rate("healthTaxReducedBracketMonthly")),
      },
      output: shareReduced,
    }));
    const fullId = recordStep("shareAtFullRate", () => ({
      title: "Part of the shares' slice that bears the full rates",
      formula: "slice − reduced part",
      expr: "top - start - reduced",
      inputs: {
        top: input(shareUpper, fromStep(upperId)),
        start: input(shareLower, fromStep(lowerId)),
        reduced: input(shareReduced, fromStep(reducedId)),
      },
      output: shareFull,
    }));
    shareHealthId = recordStep("shareHealthTax", () => ({
      title: "Health tax on the ordinary-income shares",
      formula: "reduced part × reduced rate + full part × full rate",
      expr: "reduced * reducedRate + full * fullRate",
      inputs: {
        reduced: input(shareReduced, fromStep(reducedId)),
        full: input(shareFull, fromStep(fullId)),
        reducedRate: input(RATES.healthTaxReducedRate, rate("healthTaxReducedRate")),
        fullRate: input(RATES.healthTaxFullRate, rate("healthTaxFullRate")),
      },
      output: shares.health,
    }));
    shareInsuranceId = recordStep("shareNationalInsurance", () => {
      const common = {
        title: "Bituach Leumi contributions on the ordinary-income shares",
        inputs: {
          reduced: input(shareReduced, fromStep(reducedId)),
          full: input(shareFull, fromStep(fullId)),
          reducedRate: input(
            RATES.nationalInsuranceReducedRate,
            rate("nationalInsuranceReducedRate"),
          ),
          fullRate: input(RATES.nationalInsuranceFullRate, rate("nationalInsuranceFullRate")),
        },
        output: shares.nationalInsurance,
      };
      return taxInput.beforeStatutoryAge
        ? {
            ...common,
            formula: "reduced part × reduced rate + full part × full rate (before the statutory age only)",
            expr: "reduced * reducedRate + full * fullRate",
          }
        : { ...common, formula: "0 from the statutory retirement age" };
    });
  } else {
    shareHealthId = recordStep("shareHealthTax", () => ({
      title: "Health tax on the ordinary-income shares",
      formula: "0 when no ordinary-income shares are sold",
      inputs: { ordinaryInvestment: input(ordinaryInvestment, fromStep(ordinaryId)) },
      output: shares.health,
    }));
    shareInsuranceId = recordStep("shareNationalInsurance", () => ({
      title: "Bituach Leumi contributions on the ordinary-income shares",
      formula: "0 when no ordinary-income shares are sold",
      inputs: { ordinaryInvestment: input(ordinaryInvestment, fromStep(ordinaryId)) },
      output: shares.nationalInsurance,
    }));
  }

  const healthId = recordStep("healthTax", () => ({
    title: "Health tax",
    formula: "pension health tax + health tax on the ordinary-income shares",
    expr: "pensionHealthTax + shareHealthTax",
    inputs: {
      pensionHealthTax: input(pensionHealthTax, fromStep(pensionHealthTaxId)),
      shareHealthTax: input(shares.health, fromStep(shareHealthId)),
    },
    output: result.healthTaxMonthly,
  }));
  const insuranceId = recordStep("nationalInsurance", () => ({
    title: "Bituach Leumi contributions",
    formula: "contributions on the ordinary-income shares",
    expr: "shareNationalInsurance",
    inputs: { shareNationalInsurance: input(shares.nationalInsurance, fromStep(shareInsuranceId)) },
    output: result.nationalInsuranceMonthly,
  }));

  const surtaxExcess = Math.max(
    taxablePension + ordinaryInvestment + capitalGain - RATES.surtaxAnnualThreshold / 12,
    0,
  );
  const excessId = recordStep("surtaxExcess", () => ({
    title: "Income above the surtax threshold (monthly)",
    formula: "taxable pension + ordinary investment income + capital gain − threshold / 12, never below 0",
    expr: "max(taxablePension + ordinaryInvestment + capitalGain - threshold / 12, 0)",
    inputs: {
      taxablePension: input(taxablePension, fromStep(taxablePensionId)),
      ordinaryInvestment: input(ordinaryInvestment, fromStep(ordinaryId)),
      capitalGain: input(capitalGain, fromStep(gainId)),
      threshold: input(RATES.surtaxAnnualThreshold, rate("surtaxAnnualThreshold")),
    },
    output: surtaxExcess,
  }));
  const surtaxId = recordStep("surtax", () => ({
    title: "Surtax",
    formula: "excess × surtax rate + the capital-gain part of the excess × the extra capital-income rate",
    expr: "excess * rate + min(capitalGain, excess) * extraRate",
    inputs: {
      excess: input(surtaxExcess, fromStep(excessId)),
      rate: input(RATES.surtaxRate, rate("surtaxRate")),
      capitalGain: input(capitalGain, fromStep(gainId)),
      extraRate: input(RATES.surtaxCapitalIncomeExtraRate, rate("surtaxCapitalIncomeExtraRate")),
    },
    output: result.surtaxMonthly,
  }));

  return recordStep("totalTax", () => ({
    title: "Total tax and contributions (monthly)",
    formula: "income tax + capital gains tax + surtax + health tax + Bituach Leumi contributions",
    expr: "incomeTax + capitalGainsTax + surtax + healthTax + nationalInsurance",
    inputs: {
      incomeTax: input(result.incomeTaxMonthly, fromStep(incomeTaxId)),
      capitalGainsTax: input(result.capitalGainsTaxMonthly, fromStep(capitalGainsTaxId)),
      surtax: input(result.surtaxMonthly, fromStep(surtaxId)),
      healthTax: input(result.healthTaxMonthly, fromStep(healthId)),
      nationalInsurance: input(result.nationalInsuranceMonthly, fromStep(insuranceId)),
    },
    output: result.totalMonthly,
  }));
}
