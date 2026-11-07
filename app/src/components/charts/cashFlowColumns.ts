import { useTranslation } from "react-i18next";

import { INCOME_BAND_KEYS, type CashFlowPlan, type CashFlowYear, type IncomeBandKey } from "../../domain";

/** How a column is drawn: the plain amounts, the income total, the tax, or the part nobody pays. */
export type CashFlowColumnKind = "amount" | "income" | "tax" | "unfunded";

export interface CashFlowColumn {
  key: string;
  header: string;
  kind: CashFlowColumnKind;
  /** The monthly amount for a year, or null where the column has no figure. */
  value: (year: CashFlowYear) => number | null;
}

const recurring = (year: CashFlowYear, band: IncomeBandKey) => year[band] - year.withdrawn[band];

/**
 * The columns of the cash-flow table, after age and year: what arrives as a payment, what is
 * withdrawn from each kind of savings, the total, the tax, the spending and what nobody pays.
 * The CSV export uses the same list, so the file and the screen cannot drift apart.
 */
export function useCashFlowColumns(plan: CashFlowPlan, labels: Record<IncomeBandKey, string>): CashFlowColumn[] {
  const { t } = useTranslation();
  const columns: CashFlowColumn[] = [];

  if (plan.bands.includes("bituachLeumi")) {
    columns.push({
      key: "bituachLeumi",
      header: labels.bituachLeumi,
      kind: "amount",
      value: (year) => year.bituachLeumi,
    });
  }
  const annuityBands = INCOME_BAND_KEYS.filter(
    (band) => band !== "bituachLeumi" && plan.years.some((year) => recurring(year, band) > 0),
  );
  if (annuityBands.length > 0) {
    columns.push({
      key: "annuities",
      header: t("projections.cashFlow.annuities"),
      kind: "amount",
      value: (year) => annuityBands.reduce((sum, band) => sum + recurring(year, band), 0),
    });
  }
  for (const band of INCOME_BAND_KEYS) {
    if (!plan.years.some((year) => year.withdrawn[band] > 0)) continue;
    columns.push({
      key: `${band}Withdrawn`,
      header: t("projections.split.withdrawalOf", { source: labels[band] }),
      kind: "amount",
      value: (year) => year.withdrawn[band],
    });
  }
  columns.push(
    { key: "income", header: t("charts.table.gross"), kind: "income", value: (year) => year.income },
    { key: "tax", header: t("projections.cashFlow.tax"), kind: "tax", value: (year) => year.tax },
  );

  const itemised = plan.years[0]?.essential !== null;
  if (itemised) {
    columns.push(
      {
        key: "essential",
        header: t("projections.cashFlow.essential"),
        kind: "amount",
        value: (year) => year.essential,
      },
      {
        key: "discretionary",
        header: t("projections.cashFlow.discretionary"),
        kind: "amount",
        value: (year) => year.discretionary,
      },
    );
  } else {
    columns.push({
      key: "spending",
      header: t("projections.cashFlow.spending"),
      kind: "amount",
      value: (year) => year.spending,
    });
  }
  if (plan.hasCover) {
    columns.push({ key: "cover", header: t("projections.cashFlow.cover"), kind: "amount", value: (year) => year.cover });
  }
  columns.push({
    key: "unfunded",
    header: t("projections.cashFlow.unfunded"),
    kind: "unfunded",
    value: (year) => year.unfunded,
  });
  return columns;
}
