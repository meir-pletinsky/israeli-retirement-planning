import type { IncomeBandKey } from "../../domain";

/** Series colors, shared by the income chart and the retirement timeline. */
export const INCOME_BAND_COLORS: Record<IncomeBandKey, string> = {
  pensionFund: "#0d9488",
  providentFund: "#0ea5e9",
  managersInsurance: "#6366f1",
  studyFund: "#84cc16",
  investments: "#94a3b8",
  bituachLeumi: "#f59e0b",
};
