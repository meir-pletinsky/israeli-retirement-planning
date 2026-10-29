import type {
  PensionAccount,
  ProductCategory,
  ProfileData,
  StockHolding,
  TaxTrack,
} from "../types";
import { ACCESS_RULES } from "./accessRules";
import { FALLBACK_USD_TO_ILS_RATE } from "./constants";
import { futureValueOfMonthlyContributions, monthlyContributionForAccount } from "./contributions";
import {
  accountsInPlan,
  holdingValueIls,
  ownAccounts,
  realAnnualReturnRate,
  resolveCurrentAge,
} from "./profileBasics";
import { TAX_RATES } from "./taxRates";

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
): { costBasis: number; rate: number } {
  const defaultRate = TAX_RATES.capitalGainsRate;
  const otherAssets = profile.pensionSavings.otherAssets ?? 0;
  let value = otherAssets + nonTrustee.value;
  let gains = nonTrustee.value - nonTrustee.grantValue;
  let weightedRate = (otherAssets + nonTrustee.value) * defaultRate;
  for (const holding of holdings) {
    const holdingValue = holdingValueIls(holding);
    const details = holding.personalPurchaseDetails;
    gains += Math.min(
      Math.max(details.unrealizedCapitalGainUSD ?? 0, 0) * FALLBACK_USD_TO_ILS_RATE,
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
  };
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Years from now until an ISO date (negative when in the past); null when unparseable. */
function yearsUntilDate(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const time = Date.parse(isoDate);
  return Number.isNaN(time) ? null : (time - Date.now()) / MS_PER_YEAR;
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
function employerLots(holding: StockHolding, yearsToRetirement: number): EmployerLot[] {
  const details = holding.employerGrantDetails;
  const shareValue = (holding.currentMarketPriceUSD ?? 0) * FALLBACK_USD_TO_ILS_RATE;
  const holdingGrantPrice = Math.max(details.costBasisAtGrantUSD ?? 0, 0);
  const total = Math.max(holding.quantity ?? 0, 0);
  const tranches = details.vestingTranches.filter((tranche) => (tranche.quantity ?? 0) > 0);
  const trancheTotal = tranches.reduce((sum, tranche) => sum + (tranche.quantity ?? 0), 0);
  const scale = trancheTotal > total ? total / trancheTotal : 1;

  const lot = (quantity: number, grantPriceUSD: number, route: EmployerStockRoute): EmployerLot => {
    const value = quantity * shareValue;
    return {
      value,
      grantValue: Math.min(quantity * grantPriceUSD * FALLBACK_USD_TO_ILS_RATE, value),
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
  for (const holding of profile.equity.holdings) {
    if (holding.investmentCategory !== "employerGrantedStock") {
      split.rest.push(holding);
      continue;
    }
    for (const lot of employerLots(holding, yearsToRetirement)) {
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
  return split;
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
      const yearsToLiquidity =
        yearsUntilDate(account.liquidityDate) ??
        (() => {
          const sinceJoin = yearsUntilDate(account.joinDate);
          return sinceJoin === null ? null : sinceJoin + ACCESS_RULES.studyFundLiquidityYears;
        })();
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

function buildAnnuity(
  account: PensionAccount,
  kind: SourceKind,
  unlockAge: number,
  retirementAge: number,
  valueAtRetirement: number,
  rate: number,
): SourceAnnuity | null {
  if (!canAnnuitize(kind)) return null;
  const { estimatedMonthlyAnnuity, hasGuaranteedFactor, conversionFactor } =
    account.annuityParameters;
  // An account that already pays an annuity does so from the retirement age
  // regardless of the product's earliest-access age.
  const startAge =
    account.accountStatus === "payingAnnuity"
      ? retirementAge
      : Math.max(retirementAge, unlockAge);

  if (estimatedMonthlyAnnuity !== null && estimatedMonthlyAnnuity > 0) {
    return { monthly: estimatedMonthlyAnnuity, startAge, origin: "override" };
  }
  // A pension fund's factor is the fund's own and applies whether or not the
  // statement calls it guaranteed; managers insurance may use a different one
  // at retirement, so its factor counts only when the user marks it guaranteed.
  const factorApplies = hasGuaranteedFactor || kind === "pensionFund";
  if (factorApplies && conversionFactor !== null && conversionFactor > 0) {
    const balanceAtStart = valueAtRetirement * Math.pow(1 + rate, Math.max(startAge - retirementAge, 0));
    return { monthly: balanceAtStart / conversionFactor, startAge, origin: "factor" };
  }
  return null;
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

  const sources: RetirementSource[] = ownAccounts(profile).map((account) => {
    const kind = sourceKindForCategory(account.productCategory);
    const balance = account.totalAccumulatedBalance ?? 0;
    const monthlyContribution = monthlyContributionForAccount(account, salary);
    const unlockAge = accountUnlockAge(account, currentAge);
    const valueAtRetirement =
      balance * growth + futureValueOfMonthlyContributions(monthlyContribution, rate, years);
    return {
      id: account.id,
      kind,
      balance,
      monthlyContribution,
      unlockAge,
      valueAtRetirement,
      annuity: buildAnnuity(account, kind, unlockAge, retirementAge, valueAtRetirement, rate),
      taxTreatment: taxTreatmentForCategory(account.productCategory),
      costBasis: balance,
      ordinaryLayer: 0,
      capitalGainsTaxRate: TAX_RATES.capitalGainsRate,
    };
  });

  const equity = splitEquityByTaxRoute(profile, years);
  const otherBalance =
    (profile.pensionSavings.otherAssets ?? 0) +
    equity.nonTrustee.value +
    equity.rest.reduce((sum, holding) => sum + holdingValueIls(holding), 0);
  const otherTax = otherInvestmentsTaxProfile(profile, equity.rest, equity.nonTrustee);
  const investment = (
    id: string,
    balance: number,
    tax: Pick<RetirementSource, "taxTreatment" | "costBasis" | "ordinaryLayer" | "capitalGainsTaxRate">,
  ): RetirementSource => ({
    id,
    kind: "otherInvestments",
    balance,
    monthlyContribution: 0,
    unlockAge: ACCESS_RULES.alwaysAccessibleAge,
    valueAtRetirement: balance * growth,
    annuity: null,
    ...tax,
  });
  sources.push(
    investment("other-investments", otherBalance, {
      taxTreatment: "capitalGains",
      costBasis: otherTax.costBasis,
      ordinaryLayer: 0,
      capitalGainsTaxRate: otherTax.rate,
    }),
  );
  if (equity.capitalRoute.value > 0) {
    sources.push(
      investment("employer-stock-section-102", equity.capitalRoute.value, {
        taxTreatment: "capitalGains",
        costBasis: 0,
        ordinaryLayer: equity.capitalRoute.ordinaryLayer,
        capitalGainsTaxRate: TAX_RATES.capitalGainsRate,
      }),
    );
  }
  if (equity.ordinaryValue > 0) {
    sources.push(
      investment("employer-stock-ordinary-income", equity.ordinaryValue, {
        taxTreatment: "ordinaryIncome",
        costBasis: 0,
        ordinaryLayer: 0,
        capitalGainsTaxRate: TAX_RATES.capitalGainsRate,
      }),
    );
  }

  return sources;
}

/** Counted accounts that hold money but have no product type, so their access rules are unknown. */
export function countUncategorizedAccounts(profile: ProfileData): number {
  return accountsInPlan(profile).filter(
    (account) => account.productCategory === null && (account.totalAccumulatedBalance ?? 0) > 0,
  ).length;
}
