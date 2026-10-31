import type { PurchaseLot, StockHolding } from "../types";

/**
 * Cost basis of an ESPP or private holding from its purchase lots (rule R).
 *
 * Shares bought in dollars are taxed on the lower of two gains: the shekel
 * gain (proceeds at the sale rate less the cost at the purchase-date rate) and
 * the dollar gain at the sale rate. A gain on one measure and a loss on the
 * other is neither; if both are losses, only the smaller one counts.
 */

/** A lot has a basis once it has shares and a price; a price of zero (a gift) is allowed. */
export function isUsableLot(lot: PurchaseLot): boolean {
  return (
    typeof lot.quantity === "number" &&
    Number.isFinite(lot.quantity) &&
    lot.quantity > 0 &&
    typeof lot.priceUSD === "number" &&
    Number.isFinite(lot.priceUSD) &&
    lot.priceUSD >= 0
  );
}

/** Lots count only on the categories whose form shows them. */
export function holdingTakesLots(holding: StockHolding): boolean {
  return (
    holding.investmentCategory === "employerEsppDiscount" ||
    holding.investmentCategory === "personalBrokeragePurchase"
  );
}

/** Lots that were started but lack a quantity or a price, so they are left out of the calculation. */
export function incompleteLotCount(holding: StockHolding): number {
  return holding.purchaseLots.filter((lot) => !isUsableLot(lot)).length;
}

export interface LotOutcome {
  lotId: string;
  purchaseDate: string | null;
  /** Shares of the lot after scaling down to the holding's quantity. */
  quantity: number;
  priceUSD: number;
  /** The lot's own rate, or the sale rate when it has none (then both measures agree). */
  purchaseRate: number;
  valueIls: number;
  /** Proceeds at the sale rate less the cost at the purchase-date rate. */
  nominalGainIls: number;
  /** The dollar gain at the sale rate. */
  adjustedGainIls: number;
  /** What counts: the lower gain, nothing when the two disagree in sign, the smaller loss when both lose. */
  recognisedGainIls: number;
}

export interface HoldingLots {
  lots: LotOutcome[];
  /** Shares in the usable lots as entered. */
  listedQuantity: number;
  /** Shares the lots account for after scaling; the rest of the holding has no gain. */
  coveredQuantity: number;
  exceedsQuantity: boolean;
  /** Σ quantity × price × the higher of the purchase-date and sale rates. */
  costBasisIls: number;
  coveredValueIls: number;
  /** The taxable gain: the lots' recognised results netted, never below zero. */
  gainIls: number;
}

function recognisedGain(nominal: number, adjusted: number): number {
  if (nominal > 0 && adjusted > 0) return Math.min(nominal, adjusted);
  if (nominal < 0 && adjusted < 0) return Math.max(nominal, adjusted);
  return 0;
}

/**
 * The lots of a holding priced at `saleRate` shekels per dollar, or null when
 * the holding does not use them (another category, or no usable lot) and its
 * entered unrealized gain applies. Lots that together exceed the holding's
 * quantity are scaled down to fit.
 */
export function holdingLots(holding: StockHolding, saleRate: number): HoldingLots | null {
  if (!holdingTakesLots(holding)) return null;
  const usable = holding.purchaseLots.filter(isUsableLot);
  if (usable.length === 0) return null;

  const total = Math.max(holding.quantity ?? 0, 0);
  const listedQuantity = usable.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0);
  const scale = listedQuantity > total ? total / listedQuantity : 1;
  const currentPrice = holding.currentMarketPriceUSD ?? 0;

  const lots = usable.map((lot): LotOutcome => {
    const quantity = (lot.quantity ?? 0) * scale;
    const priceUSD = lot.priceUSD ?? 0;
    const purchaseRate = lot.usdToIlsRate ?? saleRate;
    const valueIls = quantity * currentPrice * saleRate;
    const nominalGainIls = valueIls - quantity * priceUSD * purchaseRate;
    const adjustedGainIls = valueIls - quantity * priceUSD * saleRate;
    return {
      lotId: lot.id,
      purchaseDate: lot.purchaseDate,
      quantity,
      priceUSD,
      purchaseRate,
      valueIls,
      nominalGainIls,
      adjustedGainIls,
      recognisedGainIls: recognisedGain(nominalGainIls, adjustedGainIls),
    };
  });

  return {
    lots,
    listedQuantity,
    coveredQuantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
    exceedsQuantity: listedQuantity > total,
    costBasisIls: lots.reduce(
      (sum, lot) => sum + lot.quantity * lot.priceUSD * Math.max(lot.purchaseRate, saleRate),
      0,
    ),
    coveredValueIls: lots.reduce((sum, lot) => sum + lot.valueIls, 0),
    gainIls: Math.max(
      lots.reduce((sum, lot) => sum + lot.recognisedGainIls, 0),
      0,
    ),
  };
}
