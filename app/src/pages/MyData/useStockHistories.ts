import { useEffect, useMemo, useState } from "react";

import type { TextSuggestion } from "../../components/fields/TextField";
import { loadStockHistory, loadStockIndex } from "../../stockPrices/client";
import type { StockHistoryFile } from "../../stockPrices/format";
import { findSymbol } from "../../stockPrices/lookup";

/** Ticker suggestions from the published price files; empty until they load, or when they cannot. */
export function useStockSuggestions(): TextSuggestion[] {
  const [suggestions, setSuggestions] = useState<TextSuggestion[]>([]);
  useEffect(() => {
    let active = true;
    void loadStockIndex().then((index) => {
      if (active && index) {
        setSuggestions(index.symbols.map(({ symbol, name }) => ({ value: symbol, label: name })));
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return suggestions;
}

/**
 * The published price histories of the given symbols, for those that are in the price files.
 * Symbols that are not there are skipped without a request. Stays empty when the files cannot be
 * loaded.
 */
export function useStockHistories(symbols: readonly string[]): ReadonlyMap<string, StockHistoryFile> {
  const [histories, setHistories] = useState<ReadonlyMap<string, StockHistoryFile>>(new Map());
  const key = useMemo(() => [...new Set(symbols)].sort().join(","), [symbols]);

  useEffect(() => {
    if (key === "") return;
    let active = true;
    void (async () => {
      const index = await loadStockIndex();
      if (!index) return;
      const found = new Map<string, StockHistoryFile>();
      await Promise.all(
        key.split(",").map(async (raw) => {
          const entry = findSymbol(index, raw);
          if (!entry) return;
          const file = await loadStockHistory(entry.symbol);
          if (file) found.set(raw, file);
        }),
      );
      if (active) setHistories(found);
    })();
    return () => {
      active = false;
    };
  }, [key]);

  return histories;
}
