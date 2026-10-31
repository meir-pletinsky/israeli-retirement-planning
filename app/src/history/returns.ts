import { US_MARKET_HISTORY_ROWS } from "./usMarketHistory";

export interface HistoricalReturn {
  year: number;
  /** Real (after US inflation) return of the mix held that year, as a fraction. */
  realReturn: number;
}

/** Every year with data, first to last. */
export const US_HISTORY_FIRST_YEAR = US_MARKET_HISTORY_ROWS[0][0];
export const US_HISTORY_LAST_YEAR = US_MARKET_HISTORY_ROWS[US_MARKET_HISTORY_ROWS.length - 1][0];

/** A nominal return and the inflation of the same year, both in percent, as one real return (a fraction). */
export function realReturn(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1;
}

/**
 * The real return of each historical year for a portfolio that holds
 * `stockShare` (0 to 1) in US stocks and the rest in 10-year US bonds,
 * rebalanced every year.
 */
export function realReturnsForMix(stockShare: number): HistoricalReturn[] {
  const share = Math.min(Math.max(stockShare, 0), 1);
  return US_MARKET_HISTORY_ROWS.map(([year, stocksPct, bondsPct, inflationPct]) => ({
    year,
    realReturn:
      share * realReturn(stocksPct, inflationPct) + (1 - share) * realReturn(bondsPct, inflationPct),
  }));
}

/** The constant yearly return that would have grown the same money by the same total. */
export function geometricMean(returns: readonly number[]): number {
  if (returns.length === 0) return 0;
  const logSum = returns.reduce((sum, value) => sum + Math.log(1 + value), 0);
  return Math.exp(logSum / returns.length) - 1;
}

/**
 * Shifts every return so the series' geometric mean becomes `targetAverage`
 * while keeping each year's ups and downs: `(1 + r) × (1 + target) / (1 + mean) - 1`.
 */
export function rebaseReturns(returns: readonly number[], targetAverage: number): number[] {
  const factor = (1 + targetAverage) / (1 + geometricMean(returns));
  return returns.map((value) => (1 + value) * factor - 1);
}
