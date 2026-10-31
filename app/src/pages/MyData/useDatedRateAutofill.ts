import { useEffect, useRef, useState } from "react";

import { useProfile } from "../../app/ProfileContext";
import { loadUsdIlsRate } from "../../fx/client";
import type { UsdIlsRate } from "../../fx/format";

export interface EntryRateHint {
  /** Day of the Bank of Israel rate that was filled in; it can be earlier than the date entered. */
  rateDate: string;
}

/**
 * Fills the dollar rate of a date from the Bank of Israel (via Frankfurter) into a field.
 * Like the price autofill, a value is only filled while its field is empty or still holds what
 * was filled before, so typing a rate always wins. It stays silent when the lookup is turned off
 * in Settings or cannot be done. `setRate` must build on the latest data, since several fields
 * can be answered in the same moment.
 */
export function useDatedRateAutofill(
  date: string | null,
  value: number | null,
  setRate: (rate: number | null) => void,
): EntryRateHint | null {
  const { fxLookupEnabled } = useProfile();
  const [loaded, setLoaded] = useState<{ date: string; rate: UsdIlsRate | null } | null>(null);
  // A ref, not state: only the effect below reads it, and writing it must not cause a render.
  const filledRef = useRef<UsdIlsRate | null>(null);

  useEffect(() => {
    if (!fxLookupEnabled || !date) return;
    let active = true;
    void loadUsdIlsRate(date).then((rate) => {
      if (active) setLoaded({ date, rate });
    });
    return () => {
      active = false;
    };
  }, [fxLookupEnabled, date]);

  // `answered` is false while the lookup for the current date is still on its way.
  const answered = fxLookupEnabled && date !== null && loaded?.date === date;
  const found = answered ? loaded.rate : null;

  useEffect(() => {
    const filled = filledRef.current;
    const isFilled = filled !== null && value === filled.rate;

    if (!date || (answered && !found)) {
      // No date, or no rate for the new date: a rate filled for the old date must not stay behind.
      if (isFilled) setRate(null);
      if (!date || answered) filledRef.current = null;
      return;
    }

    // An empty field is filled only the first time: deleting a filled value to type another
    // one must not bring it back.
    if (found && ((value === null && filled === null) || isFilled)) {
      if (value !== found.rate) setRate(found.rate);
      filledRef.current = found;
    }
  }, [date, answered, found, value, setRate]);

  return found && value === found.rate ? { rateDate: found.date } : null;
}
