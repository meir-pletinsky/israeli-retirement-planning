import type {
  PensionAccount,
  ProductCategory,
  ProfileData,
  StockHolding,
  TaxTrack,
} from "../types";
import { ACCESS_RULES } from "./accessRules";
import { DEFAULT_CURRENT_AGE } from "./constants";
import {
  contributionSalaryBase,
  futureValueOfMonthlyContributions,
  monthlyContributionForAccount,
} from "./contributions";
import {
  accountsInPlan,
  holdingValueIls,
  ownAccounts,
  realAnnualReturnRate,
  resolveCurrentAge,
  usdToIlsRate,
} from "./profileBasics";
import { TAX_RATES } from "./taxRates";
import {
  engineNowMs,
  fromConst,
  fromDerived,
  fromProfile,
  fromStep,
  input,
  isTracing,
  recordStep,
  recordTable,
  withScope,
  type TraceStepBody,
} from "./trace";

/** The kinds of savings a retirement income can be drawn from. */
export type SourceKind =
  | "pensionFund"
  | "providentFund"
  | "managersInsurance"
  | "studyFund"
  | "otherInvestments";

export const SOURCE_KINDS: readonly SourceKind[] = [
  "pensionFund",
  "providentFund",
  "managersInsurance",
  "studyFund",
  "otherInvestments",
];

/** A fixed lifelong-style monthly payment an account converts into (today's money). */
export interface SourceAnnuity {
  monthly: number;
  /** Age the payments start (may be fractional). */
  startAge: number;
  /** `override`: the user's own estimate. `factor`: balance at the start age / conversion factor. */
  origin: "override" | "factor";
}

/**
 * How money taken out of a source is taxed in retirement:
 * - `pension`: pension-like income at the brackets, partly exempt from the
 *   statutory retirement age (Section 9A).
 * - `capitalGains`: only the real gain is taxed, at a flat rate; a source
 *   can also carry an `ordinaryLayer` taxed at the brackets (Section 102).
 * - `ordinaryIncome`: the whole withdrawal is ordinary income at the
 *   brackets, with no pension exemption (employer stock that is taxed as
 *   salary on sale).
 * - `exempt`: tax-free (study fund within the deposit ceilings).
 */
export type TaxTreatment = "pension" | "capitalGains" | "ordinaryIncome" | "exempt";

export interface RetirementSource {
  id: string;
  kind: SourceKind;
  /** Balance today, in ILS. */
  balance: number;
  /** Ongoing monthly deposits until retirement, in today's money. */
  monthlyContribution: number;
  /** Age from which the capital can be spent; 0 = always accessible. */
  unlockAge: number;
  /** Balance grown to retirement plus all deposits made until then, in today's money. */
  valueAtRetirement: number;
  /** Set when the account pays a fixed annuity instead of being drawn down as capital. */
  annuity: SourceAnnuity | null;
  taxTreatment: TaxTreatment;
  /** Part of today's balance that is not taxable gain (`capitalGains` sources only), in today's money. */
  costBasis: number;
  /**
   * Part of today's balance that is taxed as ordinary income when sold
   * instead of as a gain (`capitalGains` sources only): the grant-date value
   * of Section 102 shares. It stays fixed while the balance grows, so growth
   * above it is a capital gain.
   */
  ordinaryLayer: number;
  /** Tax rate on a realised gain (`capitalGains` sources only). */
  capitalGainsTaxRate: number;
}

/** The trace scope a source's steps are recorded under: the account, or the investment bucket. */
export function sourceTraceScope(source: Pick<RetirementSource, "id" | "kind">): string {
  return source.kind === "otherInvestments" ? source.id : `account[${source.id}]`;
}

export function sourceKindForCategory(category: ProductCategory | null): SourceKind {
  switch (category) {
    case "providentFund":
    case "investmentProvidentFund":
    case "iraProvidentFund":
      return "providentFund";
    case "managersInsurance":
      return "managersInsurance";
    case "studyFund":
      return "studyFund";
    case "comprehensivePension":
    case "generalPension":
    default:
      // Uncategorized accounts keep the pre-categorization behaviour: pension-like.
      return "pensionFund";
  }
}

/**
 * Only the investment provident fund (gemel lehashkaa) and non-pension
 * investments are taxed as capital gains. Every other provident fund can be
 * drawn only as a pension, and uncategorized accounts are pension-like.
 */
function taxTreatmentForCategory(category: ProductCategory | null): TaxTreatment {
  switch (category) {
    case "investmentProvidentFund":
      return "capitalGains";
    case "studyFund":
      return "exempt";
    default:
      return "pension";
  }
}

/** Where the dollar rate behind a trace note came from. */
function fxRateOrigin(profile: ProfileData): string {
  const { usdToIlsRate: stored, usdToIlsRateDate: date } = profile.equity;
  if (stored !== usdToIlsRate(profile)) return "FALLBACK_USD_TO_ILS_RATE, as the profile holds no rate";
  return date
    ? `Bank of Israel rate of ${date}, from profile.equity.usdToIlsRate`
    : "entered by the user, profile.equity.usdToIlsRate";
}

/**
 * Cost basis and tax rate of the non-pension investments bucket. Without
 * declared unrealized gains the whole balance counts as basis, so no gain is
 * taxed; entered equity gains are carved out of it, and each holding's own
 * tax rate is blended in by market value. Section 3(i) employer shares have
 * the value at grant as their basis (that part was already taxed as income)
 * and are taxed at the statutory rate.
 */
function otherInvestmentsTaxProfile(
  profile: ProfileData,
  holdings: StockHolding[],
  nonTrustee: EquitySplit["nonTrustee"],
): { costBasis: number; rate: number; value: number; gains: number; weightedRate: number } {
  const defaultRate = TAX_RATES.capitalGainsRate;
  const fxRate = usdToIlsRate(profile);
  const otherAssets = profile.pensionSavings.otherAssets ?? 0;
  let value = otherAssets + nonTrustee.value;
  let gains = nonTrustee.value - nonTrustee.grantValue;
  let weightedRate = (otherAssets + nonTrustee.value) * defaultRate;
  for (const holding of holdings) {
    const holdingValue = holdingValueIls(holding, fxRate);
    const details = holding.personalPurchaseDetails;
    gains += Math.min(
      Math.max(details.unrealizedCapitalGainUSD ?? 0, 0) * fxRate,
      holdingValue,
    );
    weightedRate +=
      holdingValue *
      (typeof details.capitalGainsTaxRatePercent === "number"
        ? details.capitalGainsTaxRatePercent / 100
        : defaultRate);
    value += holdingValue;
  }
  return {
    costBasis: Math.max(value - gains, 0),
    rate: value > 0 ? weightedRate / value : defaultRate,
    value,
    gains,
    weightedRate,
  };
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Years from now until an ISO date (negative when in the past); null when unparseable. */
function yearsUntilDate(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const time = Date.parse(isoDate);
  return Number.isNaN(time) ? null : (time - engineNowMs()) / MS_PER_YEAR;
}

/**
 * How an employer-granted holding is taxed when sold in retirement:
 * - `section102Capital`: Section 102 capital-gains route with the holding
 *   period met. The lower of the value at grant and the proceeds is ordinary
 *   income at the brackets; anything above it is a flat-rate capital gain.
 * - `ordinaryIncome`: the whole proceeds are ordinary income (Section 102
 *   ordinary-income route, or a disqualifying disposal on the capital route).
 * - `nonTrustee`: Section 3(i); the value at grant was taxed as income, so
 *   only the growth above it is a flat-rate capital gain.
 */
export type EmployerStockRoute = "section102Capital" | "ordinaryIncome" | "nonTrustee";

/**
 * The route of an employer-granted holding's shares. A missing tax track is
 * taken as the Section 102 capital-gains route, the usual one. The plan sells
 * in retirement, so the 24-month holding period is met unless a known
 * acquisition date falls too close to retirement; with no date and no
 * confirmation the period is assumed to be met.
 */
function stockRoute(
  taxTrack: TaxTrack | null,
  acquiredOn: string | null,
  holdingPeriodConfirmed: boolean,
  yearsToRetirement: number,
): EmployerStockRoute {
  switch (taxTrack ?? "section102CapitalGainsTrustee") {
    case "section102OrdinaryIncomeTrustee":
      return "ordinaryIncome";
    case "section3iNonTrustee":
      return "nonTrustee";
    default: {
      const untilAcquired = yearsUntilDate(acquiredOn);
      const heldAtRetirement = untilAcquired === null ? null : yearsToRetirement - untilAcquired;
      const periodMet =
        holdingPeriodConfirmed ||
        heldAtRetirement === null ||
        heldAtRetirement >= TAX_RATES.section102HoldingPeriodYears;
      return periodMet ? "section102Capital" : "ordinaryIncome";
    }
  }
}

/** The route of the shares of an employer holding that follow its own grant date (not a vesting tranche). */
export function employerStockRoute(
  holding: StockHolding,
  yearsToRetirement: number,
): EmployerStockRoute {
  const { taxTrack, trusteeHoldingPeriodMet, grantDate } = holding.employerGrantDetails;
  return stockRoute(taxTrack, grantDate, trusteeHoldingPeriodMet, yearsToRetirement);
}

/** Shares of one employer holding that are taxed alike: their value, the part of it worth that at the grant, and the route. */
interface EmployerLot {
  value: number;
  /** Value at the grant date, never above `value`; missing grant prices count as zero. */
  grantValue: number;
  route: EmployerStockRoute;
}

/**
 * Splits an employer holding into lots: one per vesting tranche, each with
 * its own acquisition date and price at grant, plus the remaining shares,
 * which follow the holding's own grant date and price. Tranches that
 * together exceed the quantity are scaled down to fit. Awards cost the
 * employee nothing, so a lot's grant value is the part of its proceeds that
 * is ordinary income (Section 102) or already-taxed income (Section 3(i)).
 */
function employerLots(
  holding: StockHolding,
  yearsToRetirement: number,
  fxRate: number,
): EmployerLot[] {
  const details = holding.employerGrantDetails;
  const shareValue = (holding.currentMarketPriceUSD ?? 0) * fxRate;
  const holdingGrantPrice = Math.max(details.costBasisAtGrantUSD ?? 0, 0);
  const total = Math.max(holding.quantity ?? 0, 0);
  const tranches = details.vestingTranches.filter((tranche) => (tranche.quantity ?? 0) > 0);
  const trancheTotal = tranches.reduce((sum, tranche) => sum + (tranche.quantity ?? 0), 0);
  const scale = trancheTotal > total ? total / trancheTotal : 1;

  const lot = (quantity: number, grantPriceUSD: number, route: EmployerStockRoute): EmployerLot => {
    const value = quantity * shareValue;
    return {
      value,
      grantValue: Math.min(quantity * grantPriceUSD * fxRate, value),
      route,
    };
  };

  const lots = tranches.map((tranche) =>
    lot(
      (tranche.quantity ?? 0) * scale,
      Math.max(tranche.grantPriceUSD ?? holdingGrantPrice, 0),
      stockRoute(details.taxTrack, tranche.vestDate, false, yearsToRetirement),
    ),
  );
  const rest = trancheTotal >= total ? 0 : total - trancheTotal;
  if (rest > 0) {
    lots.push(lot(rest, holdingGrantPrice, employerStockRoute(holding, yearsToRetirement)));
  }
  return lots;
}

interface EquitySplit {
  /** Section 102 capital-route shares: value and the part taxed as ordinary income. */
  capitalRoute: { value: number; ordinaryLayer: number };
  /** Employer shares taxed entirely as ordinary income, by value. */
  ordinaryValue: number;
  /** Section 3(i) shares: value and the part already taxed as income at the grant. */
  nonTrustee: { value: number; grantValue: number };
  /** Every other holding, which stays in the generic investments bucket. */
  rest: StockHolding[];
}

function splitEquityByTaxRoute(profile: ProfileData, yearsToRetirement: number): EquitySplit {
  const split: EquitySplit = {
    capitalRoute: { value: 0, ordinaryLayer: 0 },
    ordinaryValue: 0,
    nonTrustee: { value: 0, grantValue: 0 },
    rest: [],
  };
  const lotRows: (string | number)[][] = [];
  const fxRate = usdToIlsRate(profile);
  for (const holding of profile.equity.holdings) {
    if (holding.investmentCategory !== "employerGrantedStock") {
      split.rest.push(holding);
      continue;
    }
    for (const lot of employerLots(holding, yearsToRetirement, fxRate)) {
      if (isTracing()) lotRows.push([holding.id, lot.value, lot.grantValue, lot.route]);
      switch (lot.route) {
        case "section102Capital":
          split.capitalRoute.value += lot.value;
          split.capitalRoute.ordinaryLayer += lot.grantValue;
          break;
        case "ordinaryIncome":
          split.ordinaryValue += lot.value;
          break;
        default:
          split.nonTrustee.value += lot.value;
          split.nonTrustee.grantValue += lot.grantValue;
      }
    }
  }
  if (lotRows.length > 0) {
    recordTable("employerLots", () => ({
      title: "Employer-granted share lots and their tax route",
      columns: ["holdingId", "valueIls", "grantValueIls", "route"],
      rows: lotRows,
      note: `Values are quantity × price in USD × ${fxRate} (${fxRateOrigin(profile)}); grantValueIls is the part worth that at the grant (ordinary income on the Section 102 capital route, already-taxed income on Section 3(i)).`,
    }));
  }
  return split;
}

/** Years until a study fund can be withdrawn without tax: its liquidity date, else the join date plus the waiting period; null when neither is known. */
function studyFundYearsToLiquidity(account: PensionAccount): number | null {
  return (
    yearsUntilDate(account.liquidityDate) ??
    (() => {
      const sinceJoin = yearsUntilDate(account.joinDate);
      return sinceJoin === null ? null : sinceJoin + ACCESS_RULES.studyFundLiquidityYears;
    })()
  );
}

/**
 * Age from which an account's capital can be spent. An uncategorized account
 * is treated as accessible (the pre-categorization behaviour); the dashboard
 * flags those accounts so the user can set the product type.
 */
export function accountUnlockAge(account: PensionAccount, currentAge: number): number {
  switch (account.productCategory) {
    case "comprehensivePension":
    case "generalPension":
    case "managersInsurance":
    case "providentFund":
    case "iraProvidentFund":
      return ACCESS_RULES.earliestAnnuityAge;
    case "studyFund": {
      const yearsToLiquidity = studyFundYearsToLiquidity(account);
      return yearsToLiquidity === null
        ? ACCESS_RULES.alwaysAccessibleAge
        : currentAge + Math.max(yearsToLiquidity, 0);
    }
    case "investmentProvidentFund":
    default:
      return ACCESS_RULES.alwaysAccessibleAge;
  }
}

/** Only pension-like products convert into a monthly annuity. */
function canAnnuitize(kind: SourceKind): boolean {
  return kind === "pensionFund" || kind === "managersInsurance";
}

/** Step ids and the profile-path helper an account's trace steps refer back to. */
interface AccountTraceRefs {
  retirementAge: string;
  rate: string;
  unlockAge: string;
  valueAtRetirement: string;
  field: (name: string) => string;
}

function buildAnnuity(
  account: PensionAccount,
  kind: SourceKind,
  unlockAge: number,
  retirementAge: number,
  valueAtRetirement: number,
  rate: number,
  refs: AccountTraceRefs | null,
): SourceAnnuity | null {
  if (!canAnnuitize(kind)) {
    recordStep("annuity", () => ({
      title: "Monthly annuity",
      formula: "only pension funds and managers insurance convert into a monthly annuity",
      inputs: { kind: input(kind, fromDerived("source kind from the product category")) },
      output: "none",
      note: "This kind of savings is drawn down as capital.",
    }));
    return null;
  }
  const { estimatedMonthlyAnnuity, hasGuaranteedFactor, conversionFactor } =
    account.annuityParameters;
  // An account that already pays an annuity does so from the retirement age
  // regardless of the product's earliest-access age.
  const paying = account.accountStatus === "payingAnnuity";
  const startAge = paying ? retirementAge : Math.max(retirementAge, unlockAge);
  const startAgeId = recordStep("annuityStartAge", () => ({
    title: "Age the annuity starts",
    formula: paying
      ? "an account already paying an annuity pays from the retirement age"
      : "the later of the retirement age and the earliest access age",
    expr: paying ? "retirementAge" : "max(retirementAge, unlockAge)",
    inputs: {
      retirementAge: input(retirementAge, fromStep(refs?.retirementAge ?? "")),
      ...(paying ? {} : { unlockAge: input(unlockAge, fromStep(refs?.unlockAge ?? "")) }),
    },
    output: startAge,
  }));

  if (estimatedMonthlyAnnuity !== null && estimatedMonthlyAnnuity > 0) {
    recordStep("annuityMonthly", () => ({
      title: "Monthly annuity (the user's own estimate)",
      formula: "the estimate entered for this account, used as is",
      expr: "estimatedMonthlyAnnuity",
      inputs: {
        estimatedMonthlyAnnuity: input(
          estimatedMonthlyAnnuity,
          refs?.field("annuityParameters.estimatedMonthlyAnnuity") ?? "",
        ),
      },
      output: estimatedMonthlyAnnuity,
    }));
    return { monthly: estimatedMonthlyAnnuity, startAge, origin: "override" };
  }
  // A pension fund's factor is the fund's own and applies whether or not the
  // statement calls it guaranteed; managers insurance may use a different one
  // at retirement, so its factor counts only when the user marks it guaranteed.
  const factorApplies = hasGuaranteedFactor || kind === "pensionFund";
  if (factorApplies && conversionFactor !== null && conversionFactor > 0) {
    const balanceAtStart = valueAtRetirement * Math.pow(1 + rate, Math.max(startAge - retirementAge, 0));
    const balanceAtStartId = recordStep("annuityBalanceAtStart", () => ({
      title: "Balance when the annuity starts",
      formula: "value at retirement grown at the real rate until the annuity start age",
      expr: "valueAtRetirement * (1 + rate) ^ max(startAge - retirementAge, 0)",
      inputs: {
        valueAtRetirement: input(valueAtRetirement, fromStep(refs?.valueAtRetirement ?? "")),
        rate: input(rate, fromStep(refs?.rate ?? "")),
        startAge: input(startAge, fromStep(startAgeId)),
        retirementAge: input(retirementAge, fromStep(refs?.retirementAge ?? "")),
      },
      output: balanceAtStart,
    }));
    recordStep("annuityMonthly", () => ({
      title: "Monthly annuity from the conversion factor",
      formula: "balance at the start age / conversion factor",
      expr: "balanceAtStart / conversionFactor",
      inputs: {
        balanceAtStart: input(balanceAtStart, fromStep(balanceAtStartId)),
        conversionFactor: input(conversionFactor, refs?.field("annuityParameters.conversionFactor") ?? ""),
      },
      output: balanceAtStart / conversionFactor,
    }));
    return { monthly: balanceAtStart / conversionFactor, startAge, origin: "factor" };
  }
  recordStep("annuity", () => ({
    title: "Monthly annuity",
    formula: "needs the user's own estimate or a usable conversion factor",
    inputs: {
      estimatedMonthlyAnnuity: input(
        estimatedMonthlyAnnuity,
        refs?.field("annuityParameters.estimatedMonthlyAnnuity") ?? "",
      ),
      conversionFactor: input(conversionFactor, refs?.field("annuityParameters.conversionFactor") ?? ""),
      hasGuaranteedFactor: input(
        hasGuaranteedFactor,
        refs?.field("annuityParameters.hasGuaranteedFactor") ?? "",
      ),
    },
    output: "none",
    note: "No annuity is modelled: the account is drawn down as capital.",
  }));
  return null;
}

interface MemberTraceIds {
  currentAge: string;
  retirementAge: string;
  years: string;
  rate: string;
  monthlyRate: string;
  growth: string;
  salary: string;
}

/** Records the figures every account of one person shares: ages, the real rate, growth and salary. */
function recordMemberBasics(
  profile: ProfileData,
  v: {
    currentAge: number;
    retirementAge: number;
    years: number;
    rate: number;
    growth: number;
    salary: number;
  },
): MemberTraceIds {
  const currentAge = recordStep("currentAge", () => ({
    title: "Current age",
    formula: "the age entered, or DEFAULT_CURRENT_AGE when it is blank",
    inputs: {
      age: input(profile.personal.age, fromProfile("personal.age")),
      defaultAge: input(DEFAULT_CURRENT_AGE, fromConst("DEFAULT_CURRENT_AGE")),
    },
    output: v.currentAge,
  }));
  const retirementAge = recordStep("retirementAge", () => ({
    title: "Retirement age in this scenario",
    formula: "set by the scenario's retirement timing (see scenario.timing in the pack)",
    inputs: { retirementAge: input(v.retirementAge, fromDerived("scenario.timing")) },
    output: v.retirementAge,
  }));
  const years = recordStep("years", () => ({
    title: "Years until retirement",
    formula: "max(retirement age - current age, 0)",
    expr: "max(retirementAge - currentAge, 0)",
    inputs: {
      retirementAge: input(v.retirementAge, fromStep(retirementAge)),
      currentAge: input(v.currentAge, fromStep(currentAge)),
    },
    output: v.years,
  }));
  const rate = recordStep("realRate", () => ({
    title: "Real annual return",
    formula: "(1 + nominal return) / (1 + inflation) - 1",
    expr: "(1 + investmentReturnPct / 100) / (1 + inflationPct / 100) - 1",
    inputs: {
      investmentReturnPct: input(
        profile.assumptions.investmentReturnPct,
        fromProfile("assumptions.investmentReturnPct"),
      ),
      inflationPct: input(profile.assumptions.inflationPct, fromProfile("assumptions.inflationPct")),
    },
    output: v.rate,
  }));
  const monthlyRate = recordStep("monthlyRate", () => ({
    title: "Equivalent monthly real rate",
    formula: "(1 + real rate) ^ (1/12) - 1",
    expr: "(1 + rate) ^ (1 / 12) - 1",
    inputs: { rate: input(v.rate, fromStep(rate)) },
    output: Math.pow(1 + v.rate, 1 / 12) - 1,
  }));
  const growth = recordStep("growth", () => ({
    title: "Growth factor until retirement",
    formula: "(1 + real rate) ^ years",
    expr: "(1 + rate) ^ years",
    inputs: { rate: input(v.rate, fromStep(rate)), years: input(v.years, fromStep(years)) },
    output: v.growth,
  }));
  const salary = recordStep("salary", () => ({
    title: "Monthly gross salary",
    formula: "the salary entered; 0 when blank",
    expr: "monthlyGrossSalary",
    inputs: {
      monthlyGrossSalary: input(
        profile.personal.monthlyGrossSalary,
        fromProfile("personal.monthlyGrossSalary"),
      ),
    },
    output: v.salary,
  }));
  return { currentAge, retirementAge, years, rate, monthlyRate, growth, salary };
}

function unlockAgeStep(
  account: PensionAccount,
  currentAge: number,
  unlockAge: number,
  field: (name: string) => string,
  currentAgeId: string,
): TraceStepBody {
  const productCategory = input(account.productCategory, field("productCategory"));
  switch (account.productCategory) {
    case "comprehensivePension":
    case "generalPension":
    case "managersInsurance":
    case "providentFund":
    case "iraProvidentFund":
      return {
        title: "Earliest age the money can be used",
        formula: "pension-like products: the earliest annuity age",
        expr: "earliestAnnuityAge",
        inputs: {
          productCategory,
          earliestAnnuityAge: input(
            ACCESS_RULES.earliestAnnuityAge,
            fromConst("ACCESS_RULES.earliestAnnuityAge"),
          ),
        },
        output: unlockAge,
      };
    case "studyFund": {
      const yearsToLiquidity = studyFundYearsToLiquidity(account);
      const always = input(
        ACCESS_RULES.alwaysAccessibleAge,
        fromConst("ACCESS_RULES.alwaysAccessibleAge"),
      );
      return yearsToLiquidity === null
        ? {
            title: "Earliest age the money can be used",
            formula: "study fund with no liquidity or join date: always accessible",
            expr: "alwaysAccessibleAge",
            inputs: { productCategory, alwaysAccessibleAge: always },
            output: unlockAge,
          }
        : {
            title: "Earliest age the money can be used",
            formula:
              "study fund: current age + years until the liquidity date (or join date + 6 years), never negative",
            expr: "currentAge + max(yearsToLiquidity, 0)",
            inputs: {
              productCategory,
              liquidityDate: input(account.liquidityDate, field("liquidityDate")),
              joinDate: input(account.joinDate, field("joinDate")),
              currentAge: input(currentAge, fromStep(currentAgeId)),
              yearsToLiquidity: input(
                yearsToLiquidity,
                fromDerived("years from evaluatedAt (meta) to the liquidity date, else to the join date + 6"),
              ),
            },
            output: unlockAge,
          };
    }
    default:
      return {
        title: "Earliest age the money can be used",
        formula: "investment provident funds and uncategorized accounts: always accessible",
        expr: "alwaysAccessibleAge",
        inputs: {
          productCategory,
          alwaysAccessibleAge: input(
            ACCESS_RULES.alwaysAccessibleAge,
            fromConst("ACCESS_RULES.alwaysAccessibleAge"),
          ),
        },
        output: unlockAge,
      };
  }
}

/**
 * Breaks one person's finances into the individual sources retirement income
 * is drawn from: one per pension/savings account they own plus a bucket for
 * non-pension investments. Employer-granted shares taxed as Section 102
 * (capital-gains route) or as ordinary income are separate sources of the
 * same kind, because they are taxed differently from other investments.
 * Values are in today's money (real terms), as everywhere in the engine. The
 * sum of `valueAtRetirement` equals `projectBalanceAtAge`. For a couple this
 * describes the primary user only; `household.ts` builds one set of sources
 * per spouse.
 */
export function buildSources(profile: ProfileData, retirementAge: number): RetirementSource[] {
  const currentAge = resolveCurrentAge(profile);
  const rate = realAnnualReturnRate(profile.assumptions);
  const years = Math.max(retirementAge - currentAge, 0);
  const growth = Math.pow(1 + rate, years);
  const salary = profile.personal.monthlyGrossSalary ?? 0;

  const ids = isTracing()
    ? recordMemberBasics(profile, { currentAge, retirementAge, years, rate, growth, salary })
    : null;

  const sources: RetirementSource[] = ownAccounts(profile).map((account) =>
    withScope(`account[${account.id}]`, () => {
      const kind = sourceKindForCategory(account.productCategory);
      const balance = account.totalAccumulatedBalance ?? 0;
      const monthlyContribution = monthlyContributionForAccount(account, salary);
      const unlockAge = accountUnlockAge(account, currentAge);
      const futureValue = futureValueOfMonthlyContributions(monthlyContribution, rate, years);
      const valueAtRetirement = balance * growth + futureValue;

      let refs: AccountTraceRefs | null = null;
      if (ids) {
        const field = (name: string) => fromProfile(`pensionSavings.accounts[id=${account.id}].${name}`);
        const { contributions } = account;
        const base = contributionSalaryBase(account, salary);
        const depositing = account.accountStatus === "activeContributing" && base > 0;
        const contributionId = recordStep("monthlyDeposit", () => ({
          title: "Monthly deposit into the account",
          formula:
            "salary base × (employee + employer + severance rate) / 100, only while the account is activeContributing",
          expr: depositing
            ? "salaryBase * (max(employeeRatePercent, 0) + max(employerRatePercent, 0) + max(severanceRatePercent, 0)) / 100"
            : undefined,
          inputs: {
            salaryBase: input(
              base,
              (contributions.monthlySalaryBase ?? 0) > 0
                ? field("contributions.monthlySalaryBase")
                : fromStep(ids.salary),
            ),
            employeeRatePercent: input(contributions.employeeRatePercent, field("contributions.employeeRatePercent")),
            employerRatePercent: input(contributions.employerRatePercent, field("contributions.employerRatePercent")),
            severanceRatePercent: input(contributions.severanceRatePercent, field("contributions.severanceRatePercent")),
            accountStatus: input(account.accountStatus, field("accountStatus")),
          },
          output: monthlyContribution,
          note: depositing
            ? undefined
            : "No deposits: the account is not activeContributing, or it has no salary base.",
        }));
        const futureValueId = recordStep("futureValueOfDeposits", () => {
          const common = {
            title: "Deposits grown until retirement",
            inputs: {
              monthlyContribution: input(monthlyContribution, fromStep(contributionId)),
              rate: input(rate, fromStep(ids.rate)),
              years: input(years, fromStep(ids.years)),
              monthlyRate: input(Math.pow(1 + rate, 1 / 12) - 1, fromStep(ids.monthlyRate)),
            },
            output: futureValue,
          };
          if (monthlyContribution <= 0 || years <= 0) {
            return { ...common, formula: "0 when there are no deposits or no time left" };
          }
          if (Math.abs(Math.pow(1 + rate, 1 / 12) - 1) < 1e-9) {
            return {
              ...common,
              formula: "zero real rate: monthly deposit × 12 × years",
              expr: "monthlyContribution * 12 * years",
            };
          }
          return {
            ...common,
            formula: "monthly deposit × ((1 + rate)^years - 1) / monthly rate (end-of-month deposits)",
            expr: "monthlyContribution * ((1 + rate) ^ years - 1) / monthlyRate",
          };
        });
        const valueId = recordStep("valueAtRetirement", () => ({
          title: "Value at retirement (today's money)",
          formula: "balance × growth + deposits grown until retirement",
          expr: "balance * growth + futureValueOfDeposits",
          inputs: {
            balance: input(account.totalAccumulatedBalance, field("totalAccumulatedBalance")),
            growth: input(growth, fromStep(ids.growth)),
            futureValueOfDeposits: input(futureValue, fromStep(futureValueId)),
          },
          output: valueAtRetirement,
        }));
        const unlockId = recordStep("unlockAge", () =>
          unlockAgeStep(account, currentAge, unlockAge, field, ids.currentAge),
        );
        refs = {
          retirementAge: ids.retirementAge,
          rate: ids.rate,
          unlockAge: unlockId,
          valueAtRetirement: valueId,
          field,
        };
      }

      return {
        id: account.id,
        kind,
        balance,
        monthlyContribution,
        unlockAge,
        valueAtRetirement,
        annuity: buildAnnuity(account, kind, unlockAge, retirementAge, valueAtRetirement, rate, refs),
        taxTreatment: taxTreatmentForCategory(account.productCategory),
        costBasis: balance,
        ordinaryLayer: 0,
        capitalGainsTaxRate: TAX_RATES.capitalGainsRate,
      };
    }),
  );

  const equity = splitEquityByTaxRoute(profile, years);
  const fxRate = usdToIlsRate(profile);
  const otherBalance =
    (profile.pensionSavings.otherAssets ?? 0) +
    equity.nonTrustee.value +
    equity.rest.reduce((sum, holding) => sum + holdingValueIls(holding, fxRate), 0);
  const otherTax = otherInvestmentsTaxProfile(profile, equity.rest, equity.nonTrustee);
  const otherBalanceId = withScope("other-investments", () =>
    ids ? recordOtherInvestmentsSteps(profile, equity, otherBalance, otherTax) : "",
  );
  const investment = (
    id: string,
    balance: number,
    tax: Pick<RetirementSource, "taxTreatment" | "costBasis" | "ordinaryLayer" | "capitalGainsTaxRate">,
    balanceFrom: string,
  ): RetirementSource =>
    withScope(id, () => {
      const valueAtRetirement = balance * growth;
      recordStep("valueAtRetirement", () => ({
        title: "Value at retirement (today's money)",
        formula: "balance × growth (no deposits are made into these)",
        expr: "balance * growth",
        inputs: {
          balance: input(balance, balanceFrom),
          growth: input(growth, fromStep(ids?.growth ?? "")),
        },
        output: valueAtRetirement,
      }));
      return {
        id,
        kind: "otherInvestments",
        balance,
        monthlyContribution: 0,
        unlockAge: ACCESS_RULES.alwaysAccessibleAge,
        valueAtRetirement,
        annuity: null,
        ...tax,
      };
    });
  sources.push(
    investment(
      "other-investments",
      otherBalance,
      {
        taxTreatment: "capitalGains",
        costBasis: otherTax.costBasis,
        ordinaryLayer: 0,
        capitalGainsTaxRate: otherTax.rate,
      },
      fromStep(otherBalanceId),
    ),
  );
  if (equity.capitalRoute.value > 0) {
    sources.push(
      investment(
        "employer-stock-section-102",
        equity.capitalRoute.value,
        {
          taxTreatment: "capitalGains",
          costBasis: 0,
          ordinaryLayer: equity.capitalRoute.ordinaryLayer,
          capitalGainsTaxRate: TAX_RATES.capitalGainsRate,
        },
        fromDerived("employerLots table: lots on the section102Capital route"),
      ),
    );
  }
  if (equity.ordinaryValue > 0) {
    sources.push(
      investment(
        "employer-stock-ordinary-income",
        equity.ordinaryValue,
        {
          taxTreatment: "ordinaryIncome",
          costBasis: 0,
          ordinaryLayer: 0,
          capitalGainsTaxRate: TAX_RATES.capitalGainsRate,
        },
        fromDerived("employerLots table: lots on the ordinaryIncome route"),
      ),
    );
  }

  recordTable("sources", () => ({
    title: "Retirement sources of this person",
    columns: [
      "id",
      "kind",
      "balance",
      "monthlyContribution",
      "unlockAge",
      "valueAtRetirement",
      "annuityMonthly",
      "annuityStartAge",
      "annuityOrigin",
      "taxTreatment",
      "costBasis",
      "ordinaryLayer",
      "capitalGainsTaxRate",
    ],
    rows: sources.map((source) => [
      source.id,
      source.kind,
      source.balance,
      source.monthlyContribution,
      source.unlockAge,
      source.valueAtRetirement,
      source.annuity?.monthly ?? null,
      source.annuity?.startAge ?? null,
      source.annuity?.origin ?? null,
      source.taxTreatment,
      source.costBasis,
      source.ordinaryLayer,
      source.capitalGainsTaxRate,
    ]),
    note: "All money amounts are in today's money (real terms). These are the inputs of the retirement-income solver, the drawdown simulation and the tax step.",
  }));

  return sources;
}

/** Records how the non-pension investments bucket's balance, cost basis and tax rate are made up. Returns the balance step's id. */
function recordOtherInvestmentsSteps(
  profile: ProfileData,
  equity: EquitySplit,
  balance: number,
  tax: ReturnType<typeof otherInvestmentsTaxProfile>,
): string {
  const holdings = profile.equity.holdings;
  const fxRate = usdToIlsRate(profile);
  if (holdings.length > 0) {
    recordTable("holdings", () => ({
      title: "Equity holdings",
      columns: [
        "id",
        "investmentCategory",
        "quantity",
        "currentMarketPriceUSD",
        "valueIls",
        "unrealizedCapitalGainUSD",
        "capitalGainsTaxRatePercent",
      ],
      rows: holdings.map((holding) => [
        holding.id,
        holding.investmentCategory,
        holding.quantity,
        holding.currentMarketPriceUSD,
        holdingValueIls(holding, fxRate),
        holding.personalPurchaseDetails.unrealizedCapitalGainUSD,
        holding.personalPurchaseDetails.capitalGainsTaxRatePercent,
      ]),
      note: `valueIls = quantity × currentMarketPriceUSD × ${fxRate} (${fxRateOrigin(profile)}).`,
    }));
  }
  const balanceId = recordStep("balance", () => ({
    title: "Balance of the non-pension investments bucket",
    formula: "other assets + Section 3(i) employer shares + every holding that is not employer-granted",
    expr: "otherAssets + nonTrusteeValue + otherHoldingsValue",
    inputs: {
      otherAssets: input(profile.pensionSavings.otherAssets, fromProfile("pensionSavings.otherAssets")),
      nonTrusteeValue: input(
        equity.nonTrustee.value,
        fromDerived("employerLots table: lots on the nonTrustee route"),
      ),
      otherHoldingsValue: input(
        equity.rest.reduce((sum, holding) => sum + holdingValueIls(holding, fxRate), 0),
        fromDerived("holdings table: valueIls of holdings that are not employerGrantedStock"),
      ),
    },
    output: balance,
  }));
  recordStep("costBasis", () => ({
    title: "Cost basis of the bucket (the part that is not taxable gain)",
    formula:
      "balance - gains, where gains are the Section 3(i) growth above the grant value plus each holding's declared unrealized gain (capped at its value)",
    expr: "max(balance - gains, 0)",
    inputs: {
      balance: input(tax.value, fromStep(balanceId)),
      gains: input(
        tax.gains,
        fromDerived("Section 3(i) growth + holdings table: min(unrealizedCapitalGainUSD × FX, valueIls)"),
      ),
    },
    output: tax.costBasis,
  }));
  recordStep("capitalGainsTaxRate", () => ({
    title: "Capital-gains tax rate of the bucket",
    formula: "value-weighted average of each part's rate; the statutory rate when the bucket is empty",
    expr: tax.value > 0 ? "weightedRate / balance" : "defaultRate",
    inputs: {
      weightedRate: input(
        tax.weightedRate,
        fromDerived("sum of value × rate: other assets and 3(i) shares at the statutory rate, holdings at their own rate when set"),
      ),
      balance: input(tax.value, fromStep(balanceId)),
      defaultRate: input(TAX_RATES.capitalGainsRate, fromConst("TAX_RATES.capitalGainsRate")),
    },
    output: tax.rate,
  }));
  return balanceId;
}

/** Counted accounts that hold money but have no product type, so their access rules are unknown. */
export function countUncategorizedAccounts(profile: ProfileData): number {
  return accountsInPlan(profile).filter(
    (account) => account.productCategory === null && (account.totalAccumulatedBalance ?? 0) > 0,
  ).length;
}
