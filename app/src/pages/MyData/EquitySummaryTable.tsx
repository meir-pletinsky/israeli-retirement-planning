import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { holdingValueIls, usdToIlsRate } from "../../domain";
import type { InvestmentCategory, ProfileData, StockHolding } from "../../types";
import { CATEGORY_ORDER, entryDate, entryPriceUsd } from "./holdingEntry";
import { EMPTY_CELL, formatCurrency } from "./summaryFormat";
import { SummaryTable, type SummaryColumn } from "./SummaryTable";

const FIELDS = "myData.steps.equity";

/** The price column's header says what the price is, which depends on the category. */
const ENTRY_PRICE_LABEL: Record<InvestmentCategory, string> = {
  employerGrantedStock: "costBasisAtGrantUSD",
  employerEsppDiscount: "esppPriceOnPurchaseDate",
  personalBrokeragePurchase: "personalPurchasePrice",
};

/** Value of the holding in US dollars, or null while the quantity or price is still missing. */
function holdingValueUsd(holding: StockHolding): number | null {
  if (holding.quantity === null || holding.currentMarketPriceUSD === null) return null;
  return holding.quantity * holding.currentMarketPriceUSD;
}

function sumUsd(holdings: readonly StockHolding[]): number {
  return holdings.reduce((sum, holding) => sum + (holdingValueUsd(holding) ?? 0), 0);
}

function sumIls(holdings: readonly StockHolding[], rate: number): number {
  return holdings.reduce((sum, holding) => sum + holdingValueIls(holding, rate), 0);
}

interface CategoryTableProps {
  /** Null for holdings that have no category yet. */
  category: InvestmentCategory | null;
  holdings: readonly StockHolding[];
  /** Shekels per US dollar. */
  rate: number;
}

function CategoryTable({ category, holdings, rate }: CategoryTableProps) {
  const { t } = useTranslation();
  const currency = t("common.currencySymbol");
  const totalUsd = sumUsd(holdings);
  const totalIls = sumIls(holdings, rate);

  const columns: SummaryColumn<StockHolding>[] = [
    {
      key: "holding",
      header: t(`${FIELDS}.fields.tickerSymbol`),
      cell: (holding) => (
        <>
          <span className="block font-medium text-slate-900">
            {holding.tickerSymbol || t(`${FIELDS}.untitledHolding`)}
          </span>
          {holding.companyName && (
            <span className="block text-xs text-slate-500">{holding.companyName}</span>
          )}
        </>
      ),
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
  ];

  columns.push(
    {
      key: "entryDate",
      header: t(
        `${FIELDS}.fields.${
          category === null
            ? "entryDateGeneric"
            : category === "employerGrantedStock"
              ? "grantDate"
              : "purchaseDate"
        }`,
      ),
      numeric: true,
      cell: (holding) => entryDate(holding) ?? EMPTY_CELL,
    },
    {
      key: "entryPrice",
      header: t(`${FIELDS}.fields.${category ? ENTRY_PRICE_LABEL[category] : "entryPriceGeneric"}`),
      numeric: true,
      cell: (holding) => formatCurrency(entryPriceUsd(holding), "$"),
    },
    {
      key: "currentPrice",
      header: t("myData.summary.currentPriceUsd"),
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
          : formatCurrency(Math.round(holdingValueIls(holding, rate)), currency),
      total: formatCurrency(Math.round(totalIls), currency),
    },
  );

  const id = `equity-summary-${category ?? "none"}`;
  return (
    <SummaryTable
      id={id}
      title={t(`myData.summary.equityCategoryTitle.${category ?? "none"}`)}
      rows={holdings}
      rowKey={(holding) => holding.id}
      columns={columns}
    />
  );
}

/** Where the rate behind the shekel values comes from, and a field to replace it with the user's own. */
function UsdIlsRateControl({ equity, rate }: { equity: ProfileData["equity"]; rate: number }) {
  const { t } = useTranslation();
  const { setUsdToIlsRate } = useProfile();
  const [draft, setDraft] = useState<string | null>(null);
  const typedByUser = equity.usdToIlsRate !== null && equity.usdToIlsRateDate === null;

  function commit() {
    if (draft === null) return;
    const typed = Number(draft);
    // Emptying the field, or an unusable number, goes back to the automatic rate.
    if (draft.trim() !== "" && Number.isFinite(typed) && typed > 0) setUsdToIlsRate(typed, null);
    else setUsdToIlsRate(null, null);
    setDraft(null);
  }

  const sourceKey =
    equity.usdToIlsRate === null ? "fallback" : equity.usdToIlsRateDate ? "boi" : "typed";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-slate-700">
          {t("myData.summary.fxRateLabel")}
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.001}
            dir="ltr"
            value={draft ?? String(rate)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
            }}
            className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
          />
        </label>
        {typedByUser && (
          <button
            type="button"
            onClick={() => setUsdToIlsRate(null, null)}
            className="rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("myData.summary.fxRateUseAutomatic")}
          </button>
        )}
      </div>
      <p>{t(`myData.summary.fxRateSource.${sourceKey}`, { date: equity.usdToIlsRateDate })}</p>
    </div>
  );
}

/** Read-only overview of the equity holdings, one table per category, above the cards that edit them. */
export function EquitySummaryTable() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { holdings } = profile.equity;
  const rate = usdToIlsRate(profile);

  const groups = [...CATEGORY_ORDER, null]
    .map((category) => ({
      category,
      holdings: holdings.filter((holding) => (holding.investmentCategory ?? null) === category),
    }))
    .filter((group) => group.holdings.length > 0);
  if (groups.length === 0) return null;

  const currency = t("common.currencySymbol");

  return (
    <>
      {groups.map((group) => (
        <CategoryTable
          key={group.category ?? "none"}
          category={group.category}
          holdings={group.holdings}
          rate={rate}
        />
      ))}
      <div className="flex flex-col gap-2 text-xs text-slate-500">
        {groups.length > 1 && (
          <p className="text-sm font-semibold text-slate-900">
            {t("myData.summary.equityTotalAllCategories")}:{" "}
            <span dir="ltr">{formatCurrency(sumUsd(holdings), "$")}</span>
            {" / "}
            <span dir="ltr">{formatCurrency(Math.round(sumIls(holdings, rate)), currency)}</span>
          </p>
        )}
        <UsdIlsRateControl equity={profile.equity} rate={rate} />
      </div>
    </>
  );
}
