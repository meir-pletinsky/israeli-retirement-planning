import { useTranslation } from "react-i18next";

import type { StockHolding } from "../../types";

interface EquityHoldingCardProps {
  holding: StockHolding;
  onEdit: () => void;
  onRemove: () => void;
}

export function EquityHoldingCard({
  holding,
  onEdit,
  onRemove,
}: EquityHoldingCardProps) {
  const { t } = useTranslation();
  const categoryLabel = holding.investmentCategory
    ? t(
        `myData.steps.equity.options.investmentCategory.${holding.investmentCategory}`,
      )
    : t("myData.steps.equity.untitledHolding");

  const quantity = holding.quantity ?? 0;
  const price = holding.currentMarketPriceUSD ?? 0;
  const totalValue = quantity * price;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {holding.tickerSymbol || categoryLabel}
          {holding.companyName && (
            <span className="ms-1.5 font-normal text-slate-500">
              {holding.companyName}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-slate-500">{categoryLabel}</p>
        {totalValue > 0 && (
          <p className="mt-1 text-sm font-medium text-teal-700">
            ${totalValue.toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50"
        >
          {t("common.edit")}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          {t("common.remove")}
        </button>
      </div>
    </div>
  );
}
