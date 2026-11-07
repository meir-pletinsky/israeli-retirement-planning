import clsx from "clsx";
import { useTranslation } from "react-i18next";

import type { CashFlowYear } from "../../domain";
import type { CashFlowColumn } from "./cashFlowColumns";

interface CashFlowTableProps {
  years: CashFlowYear[];
  columns: CashFlowColumn[];
  caption: string;
}

/**
 * The year-by-year cash flow at the planned spending. The age stays in view while the table
 * scrolls sideways, and the first year the usable savings cannot pay the spending is marked with
 * words, not only a color, so it can be found at a glance.
 */
export function CashFlowTable({ years, columns, caption }: CashFlowTableProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${Math.round(amount).toLocaleString()}`;
  const firstShort = years.find((year) => year.short);

  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky start-0 top-0 z-20 bg-white py-1 pe-3 text-start font-medium text-slate-500"
            >
              {t("charts.table.age")}
            </th>
            <th scope="col" className="sticky top-0 z-10 bg-white py-1 pe-3 text-start font-medium text-slate-500">
              {t("projections.cashFlow.year")}
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={clsx(
                  "sticky top-0 z-10 bg-white py-1 pe-3 text-start font-medium",
                  column.kind === "unfunded" ? "text-rose-700" : "text-slate-500",
                  column.kind === "income" && "font-semibold text-slate-700",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const isFirstShort = year === firstShort;
            return (
              <tr
                key={year.age}
                data-first-unfunded={isFirstShort ? "true" : undefined}
                className={clsx("border-t border-slate-100", year.short && "bg-rose-50/60")}
              >
                <th
                  scope="row"
                  className={clsx(
                    "sticky start-0 py-1 pe-3 text-start font-normal tabular-nums",
                    year.short ? "bg-rose-50" : "bg-white",
                  )}
                >
                  {year.age}
                  {isFirstShort && (
                    <span className="block text-xs font-semibold text-rose-700">
                      {t("projections.basis.shortfallMarker")}
                    </span>
                  )}
                </th>
                <td className="py-1 pe-3 tabular-nums">{year.calendarYear}</td>
                {columns.map((column) => {
                  const value = column.value(year);
                  return (
                    <td
                      key={column.key}
                      className={clsx(
                        "py-1 pe-3 tabular-nums",
                        column.kind === "income" && "font-semibold",
                        column.kind === "unfunded" && value !== null && value > 0 && "font-semibold text-rose-700",
                        (column.kind === "tax" || column.kind === "unfunded") &&
                          (value === null || value === 0) &&
                          "text-slate-400",
                      )}
                    >
                      {value === null ? "" : value === 0 && column.kind !== "income" ? "–" : money(value)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
