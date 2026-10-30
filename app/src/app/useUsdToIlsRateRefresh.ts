import { useEffect } from "react";

import { loadUsdIlsRate } from "../fx/client";
import { useProfile } from "./ProfileContext";

/**
 * Keeps the dollar rate that values the equity holdings at the Bank of Israel's latest rate.
 * It runs only while lookups are allowed and there are holdings to value, and never replaces a
 * rate the user typed (a rate without a date). When the last holding is removed, a looked-up
 * rate goes too, so a profile with nothing in it stays empty.
 */
export function useUsdToIlsRateRefresh(): void {
  const { profile, fxLookupEnabled, setUsdToIlsRate } = useProfile();
  const hasHoldings = profile.equity.holdings.length > 0;
  const { usdToIlsRate: rate, usdToIlsRateDate: date } = profile.equity;
  const typedByUser = rate !== null && date === null;
  const lookedUp = rate !== null && date !== null;

  useEffect(() => {
    if (!hasHoldings && lookedUp) setUsdToIlsRate(null, null);
  }, [hasHoldings, lookedUp, setUsdToIlsRate]);

  useEffect(() => {
    if (!fxLookupEnabled || !hasHoldings || typedByUser) return;
    let active = true;
    void loadUsdIlsRate().then((latest) => {
      if (active && latest) setUsdToIlsRate(latest.rate, latest.date);
    });
    return () => {
      active = false;
    };
  }, [fxLookupEnabled, hasHoldings, typedByUser, setUsdToIlsRate]);
}
