import type { CpiPoint } from "./format";
import { CPI_BUILT_IN_DECEMBER_CHANGES } from "./snapshot";
import { summarizeCpi, type CpiSummary } from "./stats";

/** The bundled table as 12-month changes at each December, the same shape the live answer has. */
export const CPI_BUILT_IN_POINTS: readonly CpiPoint[] = CPI_BUILT_IN_DECEMBER_CHANGES.map(
  ([year, yearOverYearPct]) => ({ year, month: 12, yearOverYearPct }),
);

function summarizeBuiltIn(): CpiSummary {
  const summary = summarizeCpi(CPI_BUILT_IN_POINTS);
  if (!summary) throw new Error("The built-in inflation table is empty.");
  return summary;
}

/** The latest and average inflation from the bundled table; always available, even offline. */
export const CPI_BUILT_IN_SUMMARY: CpiSummary = summarizeBuiltIn();
