import type { CSSProperties } from "react";

import type { IncomeBandKey } from "../../domain";

/** Series colors, shared by the income chart and the band swatches. Each is at least 3:1 against white. */
export const INCOME_BAND_COLORS: Record<IncomeBandKey, string> = {
  pensionFund: "#0b6e99",
  providentFund: "#2aa198",
  managersInsurance: "#6c7cb4",
  studyFund: "#7a9a3a",
  investments: "#8c857a",
  bituachLeumi: "#b06f12",
};

/** The fill of an income band: solid for recurring payments, hatched for withdrawals. */
export function bandFill(band: IncomeBandKey, hatched: boolean): CSSProperties {
  const color = INCOME_BAND_COLORS[band];
  return hatched
    ? { backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 2.5px, color-mix(in srgb, ${color} 55%, white) 2.5px 8px)` }
    : { backgroundColor: color };
}
