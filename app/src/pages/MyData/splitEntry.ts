import type { StockHistoryFile } from "../../stockPrices/format";
import { priceOnOrBefore } from "../../stockPrices/lookup";
import {
  adjustPriceForSplits,
  adjustQuantityForSplits,
  roundQuantity,
  splitFactorSince,
} from "../../stockPrices/splits";
import type { StockHolding } from "../../types";
import { applyHoldingChange, entryDate, entryPricePatch, entryPriceUsd } from "./holdingEntry";

/** How many of today's shares one share of that date has become, rounded for showing. */
export function displayFactor(factor: number): number {
  return roundQuantity(factor);
}

/**
 * Restates a new single entry that was typed as reported at the time (shares and price before
 * later splits) in today's shares. A price that equals the closing price on the entry date is the
 * autofilled estimate, which is already split-adjusted, so it is left as it is.
 */
export function adjustHoldingForSplits(
  holding: StockHolding,
  history: StockHistoryFile | undefined,
): { holding: StockHolding; factor: number } {
  const date = entryDate(holding);
  const factor = splitFactorSince(history, date);
  if (factor === 1) return { holding, factor };

  const price = entryPriceUsd(holding);
  const estimate = history && date ? priceOnOrBefore(history, date)?.close : undefined;
  const typedPrice = price !== null && price !== estimate;

  const adjusted = applyHoldingChange(holding, {
    ...(holding.quantity !== null && { quantity: adjustQuantityForSplits(holding.quantity, factor) }),
    ...(typedPrice ? entryPricePatch(holding, adjustPriceForSplits(price, factor)) : {}),
  });
  return { holding: adjusted, factor };
}
