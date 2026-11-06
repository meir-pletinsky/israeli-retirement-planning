import { useTranslation } from "react-i18next";

import { formatCurrency, EMPTY_CELL } from "../pages/MyData/summaryFormat";
import type { PlanArea, PlanSummary } from "../domain/planSummary";
import { FormModal } from "./FormModal";

interface ImportPreviewDialogProps {
  fileName: string;
  current: PlanSummary;
  incoming: PlanSummary;
  /** Areas of the current plan the file has nothing for, which the import empties. */
  emptiedAreas: PlanArea[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** Shows what an import would put in place of the current plan, before anything is replaced. */
export function ImportPreviewDialog({
  fileName,
  current,
  incoming,
  emptiedAreas,
  onConfirm,
  onCancel,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation();
  const currency = t("common.currencySymbol");

  const number = (value: number | null) => (value === null ? EMPTY_CELL : String(value));
  const count = (value: number) => String(value);
  const yesNo = (value: boolean) =>
    t(value ? "settings.importPreview.yes" : "settings.importPreview.no");
  const money = (value: number | null) => formatCurrency(value, currency);

  const rows: { key: string; current: string; incoming: string }[] = [
    { key: "age", current: number(current.age), incoming: number(incoming.age) },
    {
      key: "retirementAge",
      current: number(current.retirementAge),
      incoming: number(incoming.retirementAge),
    },
    { key: "spouse", current: yesNo(current.hasSpouse), incoming: yesNo(incoming.hasSpouse) },
    {
      key: "pensionAccounts",
      current: count(current.pensionAccounts),
      incoming: count(incoming.pensionAccounts),
    },
    { key: "holdings", current: count(current.holdings), incoming: count(incoming.holdings) },
    {
      key: "bankDeposits",
      current: count(current.bankDeposits),
      incoming: count(incoming.bankDeposits),
    },
    {
      key: "expenseItems",
      current: count(current.expenseItems),
      incoming: count(incoming.expenseItems),
    },
    {
      key: "retirementMonthly",
      current: money(current.retirementMonthly),
      incoming: money(incoming.retirementMonthly),
    },
  ];

  return (
    <FormModal
      open
      title={t("settings.importPreview.title")}
      closeLabel={t("common.close")}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            data-autofocus
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {t("settings.importPreview.confirm")}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{t("settings.importPreview.intro", { fileName })}</p>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th scope="col" className="py-1.5 pe-3 text-start font-medium">
              {t("settings.importPreview.detailColumn")}
            </th>
            <th scope="col" className="px-3 py-1.5 text-end font-medium">
              {t("settings.importPreview.currentColumn")}
            </th>
            <th scope="col" className="ps-3 py-1.5 text-end font-medium">
              {t("settings.importPreview.fileColumn")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100">
              <th scope="row" className="py-1.5 pe-3 text-start font-normal text-slate-700">
                {t(`settings.importPreview.rows.${row.key}`)}
              </th>
              <td className="px-3 py-1.5 text-end tabular-nums text-slate-900">{row.current}</td>
              <td className="ps-3 py-1.5 text-end tabular-nums text-slate-900">{row.incoming}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {emptiedAreas.length > 0 && (
        <p role="alert" className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("settings.importPreview.emptiedWarning", {
            areas: emptiedAreas.map((area) => t(`settings.importPreview.areas.${area}`)).join(", "),
          })}
        </p>
      )}

      <p className="mt-4 text-xs text-slate-500">{t("settings.importPreview.restoreNote")}</p>
    </FormModal>
  );
}
