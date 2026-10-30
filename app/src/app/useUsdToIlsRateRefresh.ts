import { useEffect } from "react";

import { useLatestUsdIlsRate } from "./useLatestUsdIlsRate";
import { useProfile } from "./ProfileContext";

/**
 * Keeps the dollar rate that values the equity holdings at the Bank of Israel's latest rate,
 * checked again every hour. It runs only while lookups are allowed and there are holdings to
 * value, and never replaces a rate the user typed (a rate without a date). When the last holding
 * is removed, a looked-up rate goes too, so a profile with nothing in it stays empty.
 */
export function useUsdToIlsRateRefresh(): void {
  const { profile, fxLookupEnabled, setUsdToIlsRate } = useProfile();
  const hasHoldings = profile.equity.holdings.length > 0;
  const { usdToIlsRate: rate, usdToIlsRateDate: date } = profile.equity;
  const typedByUser = rate !== null && date === null;
  const lookedUp = rate !== null && date !== null;
  const wanted = fxLookupEnabled && hasHoldings && !typedByUser;
  const { rate: latest } = useLatestUsdIlsRate(wanted);

  useEffect(() => {
    if (!hasHoldings && lookedUp) setUsdToIlsRate(null, null);
  }, [hasHoldings, lookedUp, setUsdToIlsRate]);

  // Also runs when the profile's rate changes, so a rate that was cleared is filled in again.
  useEffect(() => {
    if (wanted && latest) setUsdToIlsRate(latest.rate, latest.date);
  }, [wanted, latest, rate, date, setUsdToIlsRate]);
}
