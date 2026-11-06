import { useTranslation } from "react-i18next";

/**
 * Says how bank deposits enter the plan, beside the figures that would otherwise suggest they
 * are money available on a date: they are one accessible investment, not contracts.
 */
export function BankDepositsNote() {
  const { t } = useTranslation();
  return (
    <p role="note" className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {t("projections.bankDepositsNote")}
    </p>
  );
}
