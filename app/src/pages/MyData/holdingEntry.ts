import type { InvestmentCategory, StockHolding } from "../../types";

/**
 * The simple entry form asks for one purchase or grant: its date, the share price on that day and
 * the dollar rate on that day.
 * Each category keeps them in its own details, so the Section 102 and ESPP logic still reads
 * the same fields. Until a category is chosen the entry is kept in every category's fields, and
 * choosing one (`categoryChangePatch`) moves it there and clears the others.
 */

export const CATEGORY_ORDER: readonly InvestmentCategory[] = [
  "employerGrantedStock",
  "employerEsppDiscount",
  "personalBrokeragePurchase",
];

/**
 * A change to the holding in the form: the fields to set, or a function that works them out from
 * the latest holding. Autofill uses the function form, because several of them can answer in
 * the same moment and each must build on what the others just wrote.
 */
export type HoldingChange =
  | Partial<StockHolding>
  | ((current: StockHolding) => Partial<StockHolding>);

export function applyHoldingChange(holding: StockHolding, change: HoldingChange): StockHolding {
  return { ...holding, ...(typeof change === "function" ? change(holding) : change) };
}

/** Grant date of an ESOP/RSU holding, or the purchase date of an ESPP or private one. */
export function entryDate(holding: StockHolding): string | null {
  switch (holding.investmentCategory) {
    case "employerGrantedStock":
      return holding.employerGrantDetails.grantDate;
    case "employerEsppDiscount":
      return holding.esppDetails.purchaseDate;
    case "personalBrokeragePurchase":
      return holding.personalPurchaseDetails.purchaseDate;
    default:
      return (
        holding.employerGrantDetails.grantDate ??
        holding.esppDetails.purchaseDate ??
        holding.personalPurchaseDetails.purchaseDate
      );
  }
}

/**
 * Share price on that date: the fair market value at grant (ESOP/RSU), the market price on the
 * purchase day before any ESPP discount, or what a private purchase cost per share.
 */
export function entryPriceUsd(holding: StockHolding): number | null {
  switch (holding.investmentCategory) {
    case "employerGrantedStock":
      return holding.employerGrantDetails.costBasisAtGrantUSD;
    case "employerEsppDiscount":
      return holding.esppDetails.fairMarketValueAtPurchaseUSD;
    case "personalBrokeragePurchase":
      return holding.personalPurchaseDetails.averageCostBasisUSD;
    default:
      return (
        holding.employerGrantDetails.costBasisAtGrantUSD ??
        holding.esppDetails.fairMarketValueAtPurchaseUSD ??
        holding.personalPurchaseDetails.averageCostBasisUSD
      );
  }
}

/**
 * Shekels per US dollar on that date (the Bank of Israel rate), for working out the shekel value of
 * the entry. It is saved and shown, but not used in the calculations yet.
 */
export function entryRate(holding: StockHolding): number | null {
  switch (holding.investmentCategory) {
    case "employerGrantedStock":
      return holding.employerGrantDetails.usdToIlsRateAtGrant;
    case "employerEsppDiscount":
      return holding.esppDetails.usdToIlsRateAtPurchase;
    case "personalBrokeragePurchase":
      return holding.personalPurchaseDetails.usdToIlsRateAtPurchase;
    default:
      return (
        holding.employerGrantDetails.usdToIlsRateAtGrant ??
        holding.esppDetails.usdToIlsRateAtPurchase ??
        holding.personalPurchaseDetails.usdToIlsRateAtPurchase
      );
  }
}

interface EntryChange {
  date?: string | null;
  priceUsd?: number | null;
  rate?: number | null;
}

/** Writes the changed parts of the entry into the details of each of `targets`. */
function entryPatch(
  holding: StockHolding,
  targets: readonly InvestmentCategory[],
  { date, priceUsd, rate }: EntryChange,
): Partial<StockHolding> {
  const patch: Partial<StockHolding> = {};
  if (targets.includes("employerGrantedStock")) {
    patch.employerGrantDetails = {
      ...holding.employerGrantDetails,
      ...(date !== undefined && { grantDate: date }),
      ...(priceUsd !== undefined && { costBasisAtGrantUSD: priceUsd }),
      ...(rate !== undefined && { usdToIlsRateAtGrant: rate }),
    };
  }
  if (targets.includes("employerEsppDiscount")) {
    patch.esppDetails = {
      ...holding.esppDetails,
      ...(date !== undefined && { purchaseDate: date }),
      ...(priceUsd !== undefined && { fairMarketValueAtPurchaseUSD: priceUsd }),
      ...(rate !== undefined && { usdToIlsRateAtPurchase: rate }),
    };
  }
  if (targets.includes("personalBrokeragePurchase")) {
    patch.personalPurchaseDetails = {
      ...holding.personalPurchaseDetails,
      ...(date !== undefined && { purchaseDate: date }),
      ...(priceUsd !== undefined && { averageCostBasisUSD: priceUsd }),
      ...(rate !== undefined && { usdToIlsRateAtPurchase: rate }),
    };
  }
  return patch;
}

function targetsOf(holding: StockHolding): readonly InvestmentCategory[] {
  return holding.investmentCategory ? [holding.investmentCategory] : CATEGORY_ORDER;
}

export function entryDatePatch(holding: StockHolding, date: string | null): Partial<StockHolding> {
  return entryPatch(holding, targetsOf(holding), { date });
}

export function entryPricePatch(
  holding: StockHolding,
  priceUsd: number | null,
): Partial<StockHolding> {
  return entryPatch(holding, targetsOf(holding), { priceUsd });
}

export function entryRatePatch(holding: StockHolding, rate: number | null): Partial<StockHolding> {
  return entryPatch(holding, targetsOf(holding), { rate });
}

/** Switches the category and moves the entered date, price and rate into the new category's fields. */
export function categoryChangePatch(
  holding: StockHolding,
  category: InvestmentCategory | null,
): Partial<StockHolding> {
  const date = entryDate(holding);
  const priceUsd = entryPriceUsd(holding);
  const rate = entryRate(holding);
  const clearedPatch = entryPatch(holding, CATEGORY_ORDER, { date: null, priceUsd: null, rate: null });
  const cleared = { ...holding, ...clearedPatch };
  return {
    investmentCategory: category,
    ...clearedPatch,
    ...entryPatch(cleared, category ? [category] : CATEGORY_ORDER, { date, priceUsd, rate }),
  };
}

/** What `createEmptyStockHolding` pre-fills, so it doesn't count as something the user entered. */
const DEFAULT_CAPITAL_GAINS_RATE_PERCENT = 25;

/** True when the holding already has values in the fields the form tucks under "More details". */
export function hasAdvancedDetails(holding: StockHolding): boolean {
  const { employerGrantDetails: grant, esppDetails: espp, personalPurchaseDetails: personal } =
    holding;
  switch (holding.investmentCategory) {
    case "employerGrantedStock":
      return (
        grant.taxTrack !== null ||
        grant.trusteeHoldingPeriodMet ||
        grant.estimatedMarginalTaxOnVesting !== null ||
        grant.vestingTranches.length > 0
      );
    case "employerEsppDiscount":
      return (
        espp.discountPercentage !== null ||
        espp.purchasePriceUSD !== null ||
        espp.taxedDiscountValueUSD !== null ||
        espp.capitalGainsOnGrowthUSD !== null
      );
    case "personalBrokeragePurchase":
      return (
        personal.unrealizedCapitalGainUSD !== null ||
        (personal.capitalGainsTaxRatePercent !== null &&
          personal.capitalGainsTaxRatePercent !== DEFAULT_CAPITAL_GAINS_RATE_PERCENT)
      );
    default:
      return false;
  }
}
