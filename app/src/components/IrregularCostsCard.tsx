import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { irregularCosts } from "../domain";
import { formatNumber } from "../i18n/formatters";
import { expenseFrequencyLabel, expenseName } from "../pages/MyData/expenseLabels";
import type { ExpensesData } from "../types";

interface IrregularCostsCardProps {
  expenses: ExpensesData;
}

const COLUMNS = "myData.steps.expenses.columns";
const isolate = (text: string) => `\u2066${text}\u2069`;

/**
 * The costs paid once a year or less often, which the monthly average on the result screens turns
 * into a steady monthly figure. It says what they are, how often and what each adds, and that this
 * is an average rather than a payment schedule: the inputs do not capture due dates.
 */
export function IrregularCostsCard({ expenses }: IrregularCostsCardProps) {
  const { t } = useTranslation();
  const costs = irregularCosts(expenses);
  if (!costs) return null;

  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${formatNumber(Math.round(amount))}`;
  const percent = `${formatNumber(costs.share * 100, { maximumFractionDigits: 0 })}%`;

  return (
    <section
      id="irregular-costs"
      aria-labelledby="irregular-costs-title"
      className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="irregular-costs-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.irregular.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("dashboard.irregular.intro")}</p>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th scope="col" className="pb-1 pe-3 text-start font-medium">
              {t(`${COLUMNS}.name`)}
            </th>
            <th scope="col" className="pb-1 pe-3 text-end font-medium">
              {t(`${COLUMNS}.amount`)}
            </th>
            <th scope="col" className="pb-1 pe-3 text-start font-medium">
              {t(`${COLUMNS}.frequency`)}
            </th>
            <th scope="col" className="pb-1 text-end font-medium">
              {t(`${COLUMNS}.perMonth`)}
            </th>
          </tr>
        </thead>
        <tbody>
          {costs.items.map(({ item, amount, monthly }) => (
            <tr key={item.id} className="border-t border-slate-100">
              <th scope="row" className="py-2 pe-3 text-start font-normal text-slate-700">
                {expenseName(item, t)}
              </th>
              <td className="py-2 pe-3 text-end tabular-nums text-slate-900">
                <span dir="ltr">{money(amount)}</span>
              </td>
              <td className="py-2 pe-3 text-start text-xs text-slate-600">{expenseFrequencyLabel(item, t)}</td>
              <td className="py-2 text-end tabular-nums text-slate-900">
                <span dir="ltr">{money(monthly)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-medium">
            <th scope="row" colSpan={3} className="py-2 pe-3 text-start">
              {t("dashboard.irregular.total")}
            </th>
            <td className="py-2 text-end tabular-nums text-slate-900">
              <span dir="ltr">{money(costs.monthly)}</span>
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-2 text-xs text-slate-500">{t("dashboard.irregular.share", { percent })}</p>
      <p className="mt-2 text-xs text-slate-600">
        {t("dashboard.irregular.reserve", {
          amount: isolate(money(costs.largest.amount)),
          name: isolate(expenseName(costs.largest.item, t)),
        })}
      </p>
      <Link to="/my-data/expenses" className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline">
        {t("dashboard.budget.edit")}
      </Link>
    </section>
  );
}
