import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { budgetBreakdown } from "../domain";
import type { ExpensesData } from "../types";
import { ScenarioTitle } from "./ScenarioTag";

interface BudgetCardProps {
  expenses: ExpensesData;
  /** The estimated net monthly income in retirement that each budget is compared with. */
  netMonthlyIncome: number;
  /** A `ScenarioTag`, when the card follows a chosen retirement scenario. */
  scenarioTag?: ReactNode;
}

const CATEGORY = "myData.steps.expenses.category";
const NECESSITY = "myData.steps.expenses.necessity";

/**
 * The retirement budget on the decision screens: the essential minimum and the full planned
 * budget, how the estimated net income compares with each, and where the money goes by category.
 * With one typed total there is no split, so it asks to itemise instead.
 */
export function BudgetCard({ expenses, netMonthlyIncome, scenarioTag }: BudgetCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${Math.round(amount).toLocaleString()}`;
  const budget = budgetBreakdown(expenses);
  const hasTypedTotal = expenses.mode === "totals" && (expenses.retirementMonthly ?? 0) > 0;
  if (!budget && !hasTypedTotal) return null;

  const gapText = (budgetAmount: number) => {
    const gap = Math.round(netMonthlyIncome - budgetAmount);
    return gap >= 0
      ? t("dashboard.retireChecks.surplus", { amount: money(gap) })
      : t("dashboard.retireChecks.short", { amount: money(-gap) });
  };
  const gapTone = (budgetAmount: number) =>
    netMonthlyIncome - budgetAmount >= 0 ? "text-emerald-700" : "text-rose-700";

  return (
    <section
      aria-labelledby="budget-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="budget-title" tag={scenarioTag}>
        {t("dashboard.budget.title")}
      </ScenarioTitle>

      {budget ? (
        <>
          <p className="mt-1 text-xs text-slate-500">
            {t("dashboard.budget.intro", { income: money(netMonthlyIncome) })}
          </p>

          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th scope="col" className="pb-1 pe-3 text-start font-medium">
                  {t("dashboard.budget.budget")}
                </th>
                <th scope="col" className="pb-1 pe-3 text-end font-medium">
                  {t("dashboard.budget.perMonth")}
                </th>
                <th scope="col" className="pb-1 text-end font-medium">
                  {t("dashboard.budget.comparison")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["essential", budget.essential],
                  ["full", budget.total],
                ] as const
              ).map(([key, amount]) => (
                <tr key={key} className="border-t border-slate-100">
                  <th scope="row" className="py-2 pe-3 text-start font-normal text-slate-700">
                    {t(`dashboard.budget.${key}`)}
                  </th>
                  <td className="py-2 pe-3 text-end tabular-nums text-slate-900">
                    <span dir="ltr">{money(amount)}</span>
                  </td>
                  <td className={`py-2 text-end text-xs font-medium ${gapTone(amount)}`}>{gapText(amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-4 text-xs font-semibold text-slate-600">{t("dashboard.budget.byCategory")}</h3>
          <table className="mt-1 w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th scope="col" className="pb-1 pe-3 text-start font-medium">
                  {t("dashboard.budget.category")}
                </th>
                <th scope="col" className="pb-1 pe-3 text-end font-medium">
                  {t(`${NECESSITY}.essential`)}
                </th>
                <th scope="col" className="pb-1 text-end font-medium">
                  {t(`${NECESSITY}.discretionary`)}
                </th>
              </tr>
            </thead>
            <tbody>
              {budget.categories.map((row) => (
                <tr key={row.category} className="border-t border-slate-100">
                  <th scope="row" className="py-1 pe-3 text-start font-normal text-slate-700">
                    {t(`${CATEGORY}.${row.category}`)}
                  </th>
                  <td className="py-1 pe-3 text-end tabular-nums text-slate-900">
                    <span dir="ltr">{row.essential > 0 ? money(row.essential) : "—"}</span>
                  </td>
                  <td className="py-1 text-end tabular-nums text-slate-900">
                    <span dir="ltr">{row.discretionary > 0 ? money(row.discretionary) : "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-xs text-slate-500">{t("dashboard.budget.caveat")}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-500">{t("dashboard.budget.typedTotal")}</p>
      )}

      <Link
        to="/my-data/expenses"
        className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline"
      >
        {budget ? t("dashboard.budget.edit") : t("dashboard.budget.itemise")}
      </Link>
    </section>
  );
}
