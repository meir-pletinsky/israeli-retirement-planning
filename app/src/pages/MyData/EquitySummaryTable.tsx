import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { FALLBACK_USD_TO_ILS_RATE, holdingValueIls } from "../../domain";
import type { StockHolding } from "../../types";
import { EMPTY_CELL, formatCurrency } from "./summaryFormat";
import { SummaryTable, type SummaryColumn } from "./SummaryTable";

const FIELDS = "myData.steps.equity";

/** Value of the holding in US dollars, or null while the quantity or price is still missing. */
function holdingValueUsd(holding: StockHolding): number | null {
  if (holding.quantity === null || holding.currentMarketPriceUSD === null) return null;
  return holding.quantity * holding.currentMarketPriceUSD;
}

/** Read-only overview of every equity holding, above the cards that edit them. */
export function EquitySummaryTable() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { holdings } = profile.equity;
  if (holdings.length === 0) return null;

  const currency = t("common.currencySymbol");
  const totalUsd = holdings.reduce((sum, holding) => sum + (holdingValueUsd(holding) ?? 0), 0);
  const totalIls = holdings.reduce((sum, holding) => sum + holdingValueIls(holding), 0);

  const categoryLabel = (holding: StockHolding) =>
    holding.investmentCategory
      ? t(`${FIELDS}.options.investmentCategory.${holding.investmentCategory}`)
      : null;

  const columns: SummaryColumn<StockHolding>[] = [
    {
      key: "holding",
      header: t(`${FIELDS}.fields.tickerSymbol`),
      cell: (holding) => (
        <>
          <span className="block font-medium text-slate-900">
            {holding.tickerSymbol || categoryLabel(holding) || t(`${FIELDS}.untitledHolding`)}
          </span>
          {holding.companyName && (
            <span className="block text-xs text-slate-500">{holding.companyName}</span>
          )}
        </>
      ),
    },
    {
      key: "category",
      header: t(`${FIELDS}.fields.investmentCategory`),
      cell: (holding) => categoryLabel(holding) ?? EMPTY_CELL,
    },
    {
      key: "custodian",
      header: t(`${FIELDS}.fields.custodianOrBroker`),
      cell: (holding) => holding.custodianOrBroker || EMPTY_CELL,
    },
    {
      key: "quantity",
      header: t(`${FIELDS}.fields.quantity`),
      numeric: true,
      cell: (holding) =>
        holding.quantity === null ? EMPTY_CELL : holding.quantity.toLocaleString(),
    },
    {
      key: "price",
      header: t("myData.summary.priceUsd"),
      numeric: true,
      cell: (holding) => formatCurrency(holding.currentMarketPriceUSD, "$"),
    },
    {
      key: "valueUsd",
      header: t("myData.summary.valueUsd"),
      numeric: true,
      cell: (holding) => formatCurrency(holdingValueUsd(holding), "$"),
      total: formatCurrency(totalUsd, "$"),
    },
    {
      key: "valueIls",
      header: t("myData.summary.valueIls"),
      numeric: true,
      cell: (holding) =>
        holdingValueUsd(holding) === null
          ? EMPTY_CELL
          : formatCurrency(Math.round(holdingValueIls(holding)), currency),
      total: formatCurrency(Math.round(totalIls), currency),
    },
  ];

  return (
    <SummaryTable
      id="equity-summary"
      title={t("myData.summary.equityTitle")}
      rows={holdings}
      rowKey={(holding) => holding.id}
      columns={columns}
    >
      <p className="mt-3 text-xs text-slate-500">
        {t("myData.summary.fxNote", { rate: FALLBACK_USD_TO_ILS_RATE })}
      </p>
    </SummaryTable>
  );
}
