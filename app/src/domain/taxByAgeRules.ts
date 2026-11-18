import type { BalanceBreakdown, ProductCategory } from "../types";
import { TAX_RATES } from "./taxRates";

/**
 * How each kind of pension or savings money is taxed at the ages where the rules change.
 * Read-only reference for the "tax by age" view: nothing here feeds the calculation engine,
 * which treats every account as one pension-like or capital-gains balance (see `sources.ts`).
 *
 * Reviewed against the supplied Income Tax Ordinance, the Harel 2026 limits and BTL guidance
 * (rule W in `docs/constants-to-verify.md`). Unresolved withdrawal conditions remain explicit.
 * Shared rates come from `TAX_RATES`; the reference does not change the calculation engine.
 */
export const TAX_BY_AGE_RULES = {
  asOf: "2026-11-18",
  /** General unlawful-withdrawal floor; historical and other exceptions must be checked separately. */
  unlawfulWithdrawalPercent: 35,
  /** Amendment 190: tax on the nominal gain of a lump sum taken from 60 once a minimum recognised annuity is secured (rule U, point 8). */
  amendment190GainPercent: 15,
  minimumAnnuityMonthly: 5306,
  severanceExemptionPerServiceYear: 13750,
  studyFundEmployeeSalaryMonthly: 15712,
  studyFundEmployeeAnnualDeposits: 18854,
  studyFundSelfEmployedAnnualDeposits: 20566,
  studyFundSelfEmployedDeduction: 13203,
  earlyPensionNationalInsuranceReducedRate: 0.0102,
  earlyPensionNationalInsuranceFullRate: 0.0679,
} as const;

/** A rate as a percentage with at most two decimals, so 0.0323 reads 3.23 and 0.67 reads 67. */
export const ratePercent = (rate: number): number => Math.round(rate * 10_000) / 100;

const brackets = TAX_RATES.monthlyBrackets;
export const MARGINAL_RATE_RANGE = {
  minPercent: ratePercent(brackets[0].rate),
  maxPercent: ratePercent(brackets[brackets.length - 1].rate),
} as const;

export const HEALTH_TAX_PERCENT = {
  reduced: ratePercent(TAX_RATES.healthTaxReducedRate),
  full: ratePercent(TAX_RATES.healthTaxFullRate),
} as const;

export const CAPITAL_GAINS_PERCENT = ratePercent(TAX_RATES.capitalGainsRate);

/** The ages that split the rules: the earliest annuity age (60) and the person's own statutory retirement age. */
export const TAX_AGE_BANDS = ["before60", "from60", "fromStatutory"] as const;
export type TaxAgeBand = (typeof TAX_AGE_BANDS)[number];

/** One piece of an account that is taxed by its own rule. */
export type TaxPartId =
  | "pensionMoney"
  | "annuityMoney"
  | "recognizedMoney"
  | "oldCapital"
  | "severance"
  | "studyFundWithinCeiling"
  | "studyFundAboveCeiling"
  | "wholeBalance";

export type TaxOption = "annuity" | "lumpSum";

/** A condition that decides which of a cell's lines applies. */
export type TaxCondition =
  | "afterLeavingEmployer"
  | "minimumAnnuity"
  | "partialCommutation"
  | "lawfulOldCapital"
  | "recognizedAnnuity"
  | "investmentAnnuity"
  | "studyFundSixYears"
  | "studyFundThreeYearsFromStatutory"
  | "studyFundEarlier";

export type AgeTaxTreatment =
  | { kind: "unavailable" }
  | { kind: "penalty"; ratePercent: number }
  | { kind: "exempt" }
  | { kind: "marginal"; minPercent: number; maxPercent: number; healthTax: boolean }
  | { kind: "partlyExempt"; exemptPercent: number; taxYear: number; minPercent: number; maxPercent: number }
  | { kind: "commutation"; minPercent: number; maxPercent: number }
  | { kind: "studyFundEarly"; minPercent: number; maxPercent: number }
  | { kind: "exemptUpToCap"; minPercent: number; maxPercent: number }
  | { kind: "flatGain"; ratePercent: number; gain: "real" | "nominal" }
  | { kind: "unknown" };

export type RuleConfidence = "medium" | "low";

export interface TaxLine {
  treatment: AgeTaxTreatment;
  confidence: RuleConfidence;
  condition?: TaxCondition;
}

export type TaxCells = Record<TaxAgeBand, TaxLine[]>;

export interface TaxOptionRule {
  option: TaxOption;
  cells: TaxCells;
}

export interface TaxPartRule {
  id: TaxPartId;
  /** The balance-breakdown fields that hold this part; empty when the part cannot be told apart. */
  breakdownFields: (keyof BalanceBreakdown)[];
  options: TaxOptionRule[];
}

export interface TaxRuleContext {
  /** Maximum share of the qualifying-annuity ceiling in the first illustrated payment year. */
  exemptPercent: number;
  taxYear: number;
}

const line = (treatment: AgeTaxTreatment, confidence: RuleConfidence = "medium", condition?: TaxCondition): TaxLine =>
  condition ? { treatment, confidence, condition } : { treatment, confidence };

const marginal = (healthTax: boolean): AgeTaxTreatment => ({ kind: "marginal", ...MARGINAL_RATE_RANGE, healthTax });

const unavailable = (): TaxLine[] => [line({ kind: "unavailable" })];
const penalty = (confidence: RuleConfidence = "medium"): TaxLine[] => [
  line({ kind: "penalty", ratePercent: TAX_BY_AGE_RULES.unlawfulWithdrawalPercent }, confidence),
];

/**
 * A pension taken as a monthly annuity: not before 60; from 60 fully taxed at the brackets with
 * health tax (rules A and I); from the statutory age partly exempt and without health tax (rules A
 * and J).
 */
function annuityCells({ exemptPercent, taxYear }: TaxRuleContext, confidence: RuleConfidence = "medium"): TaxCells {
  return {
    before60: unavailable(),
    from60: [line(marginal(true), confidence)],
    fromStatutory: [
      line({ kind: "partlyExempt", exemptPercent, taxYear, ...MARGINAL_RATE_RANGE }, confidence),
    ],
  };
}

const sameFrom60 = (lines: TaxLine[]): Pick<TaxCells, "from60" | "fromStatutory"> => ({
  from60: lines,
  fromStatutory: lines,
});

const annuityOption = (context: TaxRuleContext, confidence?: RuleConfidence): TaxOptionRule => ({
  option: "annuity",
  cells: annuityCells(context, confidence),
});

/** Severance deposits taken as a lump sum once the job has ended: exempt up to a cap per year of service, the rest at the brackets. */
const severancePart = (context: TaxRuleContext): TaxPartRule => ({
  id: "severance",
  breakdownFields: ["severanceBalance"],
  options: [
    {
      option: "lumpSum",
      cells: {
        before60: [line({ kind: "exemptUpToCap", ...MARGINAL_RATE_RANGE }, "medium", "afterLeavingEmployer")],
        ...sameFrom60([line({ kind: "exemptUpToCap", ...MARGINAL_RATE_RANGE }, "medium", "afterLeavingEmployer")]),
      },
    },
    annuityOption(context),
  ],
});

/** Qualifying pension savings: annuity or lawful commutation, subject to access and exemption rules. */
const pensionMoneyPart = (context: TaxRuleContext): TaxPartRule => ({
  id: "pensionMoney",
  breakdownFields: ["pre2008CapitalBalance", "post2008AnnuityBalance"],
  options: [
    annuityOption(context),
    {
      option: "lumpSum",
      cells: {
        before60: penalty(),
        from60: [line({ kind: "commutation", ...MARGINAL_RATE_RANGE }, "low", "partialCommutation")],
        fromStatutory: [line({ kind: "commutation", ...MARGINAL_RATE_RANGE }, "low", "partialCommutation")],
      },
    },
  ],
});

/** Ordinary post-2008 deposits do not automatically qualify for Amendment 190's gain-only tax. */
const annuityMoneyPart = (context: TaxRuleContext): TaxPartRule => ({
  ...pensionMoneyPart(context),
  id: "annuityMoney",
  breakdownFields: ["post2008AnnuityBalance"],
});

const recognizedMoneyPart = (): TaxPartRule => ({
  id: "recognizedMoney",
  breakdownFields: ["tikun190CapitalBalance"],
  options: [
    {
      option: "annuity",
      cells: {
        before60: unavailable(),
        ...sameFrom60([line({ kind: "exempt" }, "medium", "recognizedAnnuity")]),
      },
    },
    {
      option: "lumpSum",
      cells: {
        before60: penalty("low"),
        ...sameFrom60([
          line(
            { kind: "flatGain", ratePercent: TAX_BY_AGE_RULES.amendment190GainPercent, gain: "nominal" },
            "medium",
            "minimumAnnuity",
          ),
        ]),
      },
    },
  ],
});

/** Historical access depends on deposit dates, tenure and the terms retained after transfers. */
const oldCapitalPart = (context: TaxRuleContext): TaxPartRule => ({
  id: "oldCapital",
  breakdownFields: ["pre2008CapitalBalance"],
  options: [
    annuityOption(context),
    {
      option: "lumpSum",
      cells: {
        before60: [line({ kind: "exempt" }, "medium", "lawfulOldCapital"), ...penalty("low")],
        ...sameFrom60([line({ kind: "exempt" }, "medium", "lawfulOldCapital"), ...penalty("low")]),
      },
    },
  ],
});

/** Study-fund money: tax-free once liquid, taxed as income before. Above-ceiling deposits pay on their gain after that. */
function studyFundParts(): TaxPartRule[] {
  const earlier = (treatment: AgeTaxTreatment): TaxLine => line(treatment, "medium", "studyFundEarlier");
  const part = (id: TaxPartId, afterLiquid: AgeTaxTreatment): TaxPartRule => ({
    id,
    breakdownFields: [],
    options: [
      {
        option: "lumpSum",
        cells: {
          before60: [
            line(afterLiquid, "medium", "studyFundSixYears"),
            earlier({ kind: "studyFundEarly", ...MARGINAL_RATE_RANGE }),
          ],
          from60: [
            line(afterLiquid, "medium", "studyFundSixYears"),
            earlier({ kind: "studyFundEarly", ...MARGINAL_RATE_RANGE }),
          ],
          fromStatutory: [
            line(afterLiquid, "medium", "studyFundSixYears"),
            line(afterLiquid, "medium", "studyFundThreeYearsFromStatutory"),
            earlier({ kind: "studyFundEarly", ...MARGINAL_RATE_RANGE }),
          ],
        },
      },
    ],
  });
  return [
    part("studyFundWithinCeiling", { kind: "exempt" }),
    part("studyFundAboveCeiling", { kind: "flatGain", ratePercent: CAPITAL_GAINS_PERCENT, gain: "real" }),
  ];
}

/** An investment provident fund: only the real gain of a lump sum is taxed, at any age; from 60 it can become a tax-free annuity (rule U). */
function investmentFundParts(): TaxPartRule[] {
  const lumpSum: TaxLine[] = [line({ kind: "flatGain", ratePercent: CAPITAL_GAINS_PERCENT, gain: "real" })];
  const taxFreeAnnuity: TaxLine[] = [line({ kind: "exempt" }, "medium", "investmentAnnuity")];
  return [
    {
      id: "wholeBalance",
      breakdownFields: [],
      options: [
        { option: "lumpSum", cells: { before60: lumpSum, ...sameFrom60(lumpSum) } },
        { option: "annuity", cells: { before60: unavailable(), ...sameFrom60(taxFreeAnnuity) } },
      ],
    },
  ];
}

/** The rules of an account's parts, in display order; empty for a category with no rules (an unrecognised stored value). */
export function taxPartRules(category: ProductCategory, context: TaxRuleContext): TaxPartRule[] {
  switch (category) {
    case "comprehensivePension":
    case "generalPension":
      return [pensionMoneyPart(context), recognizedMoneyPart(), severancePart(context)];
    case "managersInsurance":
    case "providentFund":
    case "iraProvidentFund":
      return [annuityMoneyPart(context), recognizedMoneyPart(), oldCapitalPart(context), severancePart(context)];
    case "studyFund":
      return studyFundParts();
    case "investmentProvidentFund":
      return investmentFundParts();
    default:
      return [];
  }
}
