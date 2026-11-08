import type { CSSProperties } from "react";

import type { PortfolioRowKey } from "../../domain";
import { INCOME_BAND_COLORS } from "./incomeBandColors";

/**
 * One colour per kind of asset in "What you have". Pension products keep the colour they have in
 * the income charts, and shares keep the colour of the investments band. Each is at least 3:1
 * against white; the shortfall colours remain reserved for chart risk.
 */
export const PORTFOLIO_KIND_COLORS: Record<PortfolioRowKey, string> = {
  pensionFund: INCOME_BAND_COLORS.pensionFund,
  providentFund: INCOME_BAND_COLORS.providentFund,
  managersInsurance: INCOME_BAND_COLORS.managersInsurance,
  studyFund: INCOME_BAND_COLORS.studyFund,
  bankDeposits: "#a8662a",
  privateShares: INCOME_BAND_COLORS.investments,
  employerShares: "#b4413c",
  cashAndOther: "#5f5a52",
};

const SPENDING_COLOR = "#334155";

/** The fill of a spending bar: solid for the essential part, hatched for the discretionary part. */
export function necessityFill(necessity: "essential" | "discretionary"): CSSProperties {
  return necessity === "essential"
    ? { backgroundColor: SPENDING_COLOR }
    : { backgroundImage: `repeating-linear-gradient(45deg, ${SPENDING_COLOR} 0 2px, #ffffff 2px 4px)` };
}
