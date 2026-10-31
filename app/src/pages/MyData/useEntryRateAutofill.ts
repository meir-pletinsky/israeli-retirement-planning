import { useCallback } from "react";

import type { StockHolding } from "../../types";
import { entryDate, entryRate, entryRatePatch, type HoldingChange } from "./holdingEntry";
import { useDatedRateAutofill, type EntryRateHint } from "./useDatedRateAutofill";

export type { EntryRateHint };

/** Fills the dollar rate of the purchase or grant date into the entry form. */
export function useEntryRateAutofill(
  holding: StockHolding,
  onChange: (change: HoldingChange) => void,
): EntryRateHint | null {
  const setRate = useCallback(
    (rate: number | null) => onChange((current) => entryRatePatch(current, rate)),
    [onChange],
  );
  return useDatedRateAutofill(entryDate(holding), entryRate(holding), setRate);
}
