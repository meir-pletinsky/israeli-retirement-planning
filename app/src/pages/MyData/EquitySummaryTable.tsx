import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { engineNowMs, formatDate, holdingValueIls, usdToIlsRate, vestedQuantityAt } from "../../domain";
import type { InvestmentCategory, ProfileData, StockHolding } from "../../types";
import { entryDate, entryPriceUsd } from "./holdingEntry";
import { RowActions } from "./RowActions";
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

export function sumUsd(holdings: readonly StockHolding[]): number {
  return holdings.reduce((sum, holding) => sum + (holdingValueUsd(holding) ?? 0), 0);
}

export function sumIls(holdings: readonly StockHolding[], rate: number): number {
  return holdings.reduce((sum, holding) => sum + holdingValueIls(holding, rate), 0);
}

interface EquityCategoryTableProps {
  /** Null only for holdings saved before a category was chosen (see `createHoldingForCategory`); shown in a separate legacy table with no "Add" button of its own. */
  category: InvestmentCategory | null;
  holdings: readonly StockHolding[];
  /** Shekels per US dollar. */
  rate: number;
  onEdit: (holding: StockHolding) => void;
  onRemove: (holding: StockHolding) => void;
  /** The category's own "Add" button; omitted for the legacy no-category table. */
  toolbar?: ReactNode;
  emptyMessage: ReactNode;
}

/** One category's holdings as its own table, with its own "Add" button and totals. */
export function EquityCategoryTable({
  category,
  holdings,
  rate,
  onEdit,
  onRemove,
  toolbar,
  emptyMessage,
}: EquityCategoryTableProps) {
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

  // Worked out from the vesting batches as of today; never stored in the profile.
  if (category === "employerGrantedStock") {
    const nowMs = engineNowMs();
    columns.push({
      key: "vestedQuantity",
      header: t(`${FIELDS}.fields.vestedQuantity`),
      numeric: true,
      cell: (holding) =>
        holding.quantity === null
          ? EMPTY_CELL
          : vestedQuantityAt(holding, nowMs).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    });
  }

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
      cell: (holding) => {
        const date = entryDate(holding);
        return date ? formatDate(date) : EMPTY_CELL;
      },
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
      toolbar={toolbar}
      emptyMessage={emptyMessage}
      rowActions={(holding, describedBy) => (
        <RowActions
          describedBy={describedBy}
          onEdit={() => onEdit(holding)}
          onRemove={() => onRemove(holding)}
        />
      )}
    />
  );
}

/** Where the rate behind the shekel values comes from, and a field to replace it with the user's own. */
export function UsdIlsRateControl({ equity, rate }: { equity: ProfileData["equity"]; rate: number }) {
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
      <p>
        {t(`myData.summary.fxRateSource.${sourceKey}`, {
          date: equity.usdToIlsRateDate ? formatDate(equity.usdToIlsRateDate) : "",
        })}
      </p>
    </div>
  );
}

interface EquityTotalsFooterProps {
  /** Every stock holding across the three categories (and any legacy uncategorized ones), for the grand total. */
  holdings: readonly StockHolding[];
  /** Number of the above tables that currently have at least one holding; hides the grand total when there's only one. */
  nonEmptyTableCount: number;
}

/** The combined total across every equity table, plus the USD/ILS exchange rate control. */
export function EquityTotalsFooter({ holdings, nonEmptyTableCount }: EquityTotalsFooterProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const rate = usdToIlsRate(profile);
  const currency = t("common.currencySymbol");

  return (
    <div className="flex flex-col gap-2 text-xs text-slate-500">
      {nonEmptyTableCount > 1 && (
        <p className="text-sm font-semibold text-slate-900">
          {t("myData.summary.equityTotalAllCategories")}:{" "}
          <span dir="ltr">{formatCurrency(sumUsd(holdings), "$")}</span>
          {" / "}
          <span dir="ltr">{formatCurrency(Math.round(sumIls(holdings, rate)), currency)}</span>
        </p>
      )}
      <UsdIlsRateControl equity={profile.equity} rate={rate} />
    </div>
  );
}
