import { useEffect, useMemo, useRef, useState } from "react";

import type { TextSuggestion } from "../../components/fields/TextField";
import { loadStockHistory, loadStockIndex } from "../../stockPrices/client";
import type { StockHistoryFile, StockIndexFile } from "../../stockPrices/format";
import {
  findSymbol,
  latestPrice,
  priceOnOrBefore,
  type PricePoint,
} from "../../stockPrices/lookup";
import type { StockHolding } from "../../types";
import { entryDate, entryPricePatch, entryPriceUsd } from "./holdingEntry";

/** What the autofill last wrote into the form, and for which symbol. */
interface Filled {
  symbol: string | null;
  entry: PricePoint | null;
  current: PricePoint | null;
  name: string | null;
}

const NOTHING_FILLED: Filled = { symbol: null, entry: null, current: null, name: null };

export interface StockPriceHint {
  /** Trading day of the price that was filled into the purchase or grant price, if it still is there. */
  entryPriceDate: string | null;
  /** Trading day of the price that was filled into the current price, if it still is there. */
  currentPriceDate: string | null;
}

/**
 * Suggests tickers from the published price files and, once the ticker is one of them, fills the
 * share price on the purchase or grant date, today's price and the company name. A value is only
 * filled while its field is empty or still holds what was filled before, so typing a value
 * always wins. Everything stays silent when the price files cannot be loaded.
 */
export function useStockPriceAutofill(
  holding: StockHolding,
  onChange: (patch: Partial<StockHolding>) => void,
): { suggestions: TextSuggestion[]; hint: StockPriceHint | null } {
  const [index, setIndex] = useState<StockIndexFile | null>(null);
  const [loaded, setLoaded] = useState<{ symbol: string; file: StockHistoryFile | null } | null>(
    null,
  );
  // A ref, not state: only the effect below reads it, and writing it must not cause a render.
  const filledRef = useRef<Filled>(NOTHING_FILLED);

  useEffect(() => {
    let active = true;
    void loadStockIndex().then((result) => {
      if (active) setIndex(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const symbol = (index && findSymbol(index, holding.tickerSymbol)?.symbol) || null;

  useEffect(() => {
    if (!symbol) return;
    let active = true;
    void loadStockHistory(symbol).then((file) => {
      if (active) setLoaded({ symbol, file });
    });
    return () => {
      active = false;
    };
  }, [symbol]);

  const history = loaded && loaded.symbol === symbol ? loaded.file : null;

  const suggestions = useMemo(
    () => (index ? index.symbols.map(({ symbol: value, name }) => ({ value, label: name })) : []),
    [index],
  );

  const entryValue = entryPriceUsd(holding);
  const currentValue = holding.currentMarketPriceUSD;
  const date = entryDate(holding);

  useEffect(() => {
    const isFilled = (value: number | null, point: PricePoint | null) =>
      point !== null && value === point.close;
    const patch: Partial<StockHolding> = {};
    const filled = filledRef.current;

    let base = filled;
    if (filled.symbol !== null && filled.symbol !== symbol) {
      // The ticker changed: what was filled for the old one must not stay behind.
      if (isFilled(entryValue, filled.entry)) Object.assign(patch, entryPricePatch(holding, null));
      if (isFilled(currentValue, filled.current)) patch.currentMarketPriceUSD = null;
      if (filled.name !== null && holding.companyName === filled.name) patch.companyName = "";
      base = NOTHING_FILLED;
    }

    let next = base;
    if (symbol && history) {
      const wantedEntry = date ? priceOnOrBefore(history, date) : null;
      const wantedCurrent = latestPrice(history);
      const wantedName = history.name !== history.symbol ? history.name : "";
      next = { ...base, symbol };

      // An empty field is filled only the first time: deleting a filled value to type another
      // one must not bring it back.
      if ((entryValue === null && base.entry === null) || isFilled(entryValue, base.entry)) {
        const target = wantedEntry?.close ?? null;
        if (entryValue !== target) Object.assign(patch, entryPricePatch(holding, target));
        next.entry = wantedEntry;
      }
      if ((currentValue === null && base.current === null) || isFilled(currentValue, base.current)) {
        const target = wantedCurrent?.close ?? null;
        if (currentValue !== target) patch.currentMarketPriceUSD = target;
        next.current = wantedCurrent;
      }
      if ((holding.companyName === "" && base.name === null) || holding.companyName === base.name) {
        if (holding.companyName !== wantedName) patch.companyName = wantedName;
        next.name = wantedName || null;
      }
    }

    if (Object.keys(patch).length > 0) onChange(patch);
    filledRef.current = next;
  }, [symbol, history, holding, entryValue, currentValue, date, onChange]);

  const entryPoint = history && date ? priceOnOrBefore(history, date) : null;
  const currentPoint = history ? latestPrice(history) : null;
  const entryPriceDate = entryPoint && entryValue === entryPoint.close ? entryPoint.date : null;
  const currentPriceDate =
    currentPoint && currentValue === currentPoint.close ? currentPoint.date : null;

  return {
    suggestions,
    hint: entryPriceDate || currentPriceDate ? { entryPriceDate, currentPriceDate } : null,
  };
}
