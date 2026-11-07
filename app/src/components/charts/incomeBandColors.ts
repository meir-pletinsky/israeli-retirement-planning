import type { CSSProperties } from "react";

import type { IncomeBandKey } from "../../domain";

/** Series colors, shared by the income chart and the band swatches. Each is at least 3:1 against white. */
export const INCOME_BAND_COLORS: Record<IncomeBandKey, string> = {
  pensionFund: "#0b6e99",
  providentFund: "#0d9488",
  managersInsurance: "#6366f1",
  studyFund: "#65a30d",
  investments: "#64748b",
  bituachLeumi: "#d97706",
};

/** The fill of an income band: solid for recurring payments, hatched for withdrawals. */
export function bandFill(band: IncomeBandKey, hatched: boolean): CSSProperties {
  const color = INCOME_BAND_COLORS[band];
  return hatched
    ? { backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 2px, #ffffff 2px 4px)` }
    : { backgroundColor: color };
}
