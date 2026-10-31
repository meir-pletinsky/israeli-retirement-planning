import { useTranslation } from "react-i18next";

import type { ImportedReport, PensionAccount } from "../../types";
import { accountSourceLabel } from "./reportSource";

interface PensionAccountCardProps {
  account: PensionAccount;
  /** The imported reports, to say which one the account came from. */
  reports: readonly ImportedReport[];
  currencySymbol: string;
  onEdit: () => void;
  onRemove: () => void;
}

export function PensionAccountCard({
  account,
  reports,
  currencySymbol,
  onEdit,
  onRemove,
}: PensionAccountCardProps) {
  const { t } = useTranslation();
  const categoryLabel = account.productCategory
    ? t(
        `myData.steps.pensionSavings.options.productCategory.${account.productCategory}`,
      )
    : t("myData.steps.pensionSavings.untitledAccount");
  const references = [
    account.policyNumber &&
      t("myData.steps.pensionSavings.policyNumberShort", { value: account.policyNumber }),
    account.fundId && t("myData.steps.pensionSavings.fundIdShort", { value: account.fundId }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {account.providerName || categoryLabel}
        </p>
        <p className="truncate text-xs text-slate-500">{categoryLabel}</p>
        {references && <p className="truncate text-xs text-slate-400">{references}</p>}
        <p className="truncate text-xs text-slate-400">{accountSourceLabel(account, reports, t)}</p>
        {account.totalAccumulatedBalance != null && (
          <p className="mt-1 text-sm font-medium text-brand-700">
            {currencySymbol}
            {account.totalAccumulatedBalance.toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
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
