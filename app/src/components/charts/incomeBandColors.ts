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
