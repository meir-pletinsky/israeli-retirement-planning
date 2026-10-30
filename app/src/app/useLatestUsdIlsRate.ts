import { useEffect, useState } from "react";

import { LATEST_RATE_REFRESH_MS, loadUsdIlsRate } from "../fx/client";
import type { UsdIlsRate } from "../fx/format";

interface LatestRate {
  /** The latest Bank of Israel rate; kept when a later check fails, null until there is one. */
  rate: UsdIlsRate | null;
  /** True once the first check is over, so a missing rate means it could not be had. */
  settled: boolean;
}

const NOT_ASKED: LatestRate = { rate: null, settled: false };

/** The latest dollar rate, checked again every hour while `enabled` and the app is open. */
export function useLatestUsdIlsRate(enabled: boolean): LatestRate {
  const [latest, setLatest] = useState<LatestRate>(NOT_ASKED);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const check = () =>
      void loadUsdIlsRate().then((rate) => {
        if (active) setLatest((previous) => ({ rate: rate ?? previous.rate, settled: true }));
      });
    check();
    const timer = setInterval(check, LATEST_RATE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled]);

  return enabled ? latest : NOT_ASKED;
}
