import { useEffect, useState } from "react";

import { CPI_BUILT_IN_SUMMARY } from "./builtIn";
import { loadIsraelCpi } from "./client";
import { summarizeCpi, type CpiSummary } from "./stats";

/**
 * - `live`: the figures come from the Central Bureau of Statistics.
 * - `loading`: asked, no answer yet; the built-in figures are shown meanwhile.
 * - `unavailable`: asked and failed; the built-in figures are shown.
 * - `off`: the user turned the lookup off; the built-in figures are shown.
 */
export type CpiStatus = "live" | "loading" | "unavailable" | "off";

export interface IsraelCpi {
  summary: CpiSummary;
  status: CpiStatus;
}

/** Israeli inflation for reference: live while `enabled` and reachable, otherwise the built-in table. */
export function useIsraelCpi(enabled: boolean): IsraelCpi {
  // `null` is a failed lookup; `undefined` means none has finished yet.
  const [live, setLive] = useState<CpiSummary | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadIsraelCpi().then((points) => {
      if (active) setLive(points ? summarizeCpi(points) : null);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled) return { summary: CPI_BUILT_IN_SUMMARY, status: "off" };
  if (live === undefined) return { summary: CPI_BUILT_IN_SUMMARY, status: "loading" };
  if (live === null) return { summary: CPI_BUILT_IN_SUMMARY, status: "unavailable" };
  return { summary: live, status: "live" };
}
