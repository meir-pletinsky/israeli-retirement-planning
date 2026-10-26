import { useTranslation } from "react-i18next";

import type { PensionAccount } from "../../types";

interface PensionAccountCardProps {
  account: PensionAccount;
  currencySymbol: string;
  /** Show whose account this is (a married user's accounts can belong to either spouse). */
  showOwner?: boolean;
  /** The spouse's account is not counted until the spouse's age is entered. */
  notCounted?: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

export function PensionAccountCard({
  account,
  currencySymbol,
  showOwner = false,
  notCounted = false,
  onEdit,
  onRemove,
}: PensionAccountCardProps) {
  const { t } = useTranslation();
  const categoryLabel = account.productCategory
    ? t(
        `myData.steps.pensionSavings.options.productCategory.${account.productCategory}`,
      )
    : t("myData.steps.pensionSavings.untitledAccount");

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {account.providerName || categoryLabel}
        </p>
        <p className="truncate text-xs text-slate-500">{categoryLabel}</p>
        {showOwner && (
          <p
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              notCounted ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {notCounted
              ? t("myData.steps.pensionSavings.ownerNotCounted")
              : t(`myData.steps.pensionSavings.options.owner.${account.owner}`)}
          </p>
        )}
        {account.totalAccumulatedBalance != null && (
          <p className="mt-1 text-sm font-medium text-teal-700">
            {currencySymbol}
            {account.totalAccumulatedBalance.toLocaleString()}
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
