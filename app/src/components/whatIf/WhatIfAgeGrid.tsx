import clsx from "clsx";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import type { AgeGrid, AgeGridColumn, WhatIfValues } from "../../domain";
import { useWhatIfFormat } from "./useWhatIfFormat";

const isolate = (text: string) => `\u2066${text}\u2069`;

interface WhatIfAgeGridProps {
  grid: AgeGrid;
  values: WhatIfValues;
  columns: AgeGridColumn[];
  onColumnChange: (column: AgeGridColumn) => void;
  /** Moves the sliders to a cell's retirement age and column value. */
  onPick: (retirementAge: number, columnValue: number) => void;
}

/** A tint that deepens with the size of the margin; green when it covers the spending, amber when it does not. */
function tint(margin: number, scale: number, hasSpending: boolean): CSSProperties {
  const strength = scale > 0 ? Math.min(Math.abs(margin) / scale, 1) : 0;
  const alpha = (0.08 + strength * 0.42).toFixed(2);
  if (!hasSpending) return { backgroundColor: `rgb(11 110 153 / ${alpha})` };
  return { backgroundColor: margin >= 0 ? `rgb(5 150 105 / ${alpha})` : `rgb(217 119 6 / ${alpha})` };
}

/** The monthly margin for each retirement age against one more assumption; a click moves the sliders to that cell. */
export function WhatIfAgeGrid({ grid, values, columns, onColumnChange, onPick }: WhatIfAgeGridProps) {
  const { t } = useTranslation();
  const { value, signedMoney, money, label } = useWhatIfFormat();
  const hasSpending = values.monthlySpending > 0;
  const scale = Math.max(...grid.cells.flat().map((cell) => Math.abs(cell)), 0);
  const cell = (margin: number) => (hasSpending ? signedMoney(margin) : money(margin));

  return (
    <section aria-labelledby="whatif-grid-title" className="card">
      <h3 id="whatif-grid-title" className="text-base font-semibold text-slate-900">
        {t("whatIf.grid.title")}
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {t(hasSpending ? "whatIf.grid.introGap" : "whatIf.grid.introNet")}
      </p>

      {columns.length > 1 && (
        <div
          role="group"
          aria-label={t("whatIf.grid.columnGroup")}
          className="mt-3 inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1"
        >
          {columns.map((column) => (
            <button
              key={column}
              type="button"
              aria-pressed={grid.column === column}
              onClick={() => onColumnChange(column)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                grid.column === column ? "bg-white text-brand-700 shadow" : "text-slate-500",
              )}
            >
              {label(column)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[26rem] border-separate border-spacing-1 text-table">
          <caption className="sr-only">
            {t("whatIf.grid.tableLabel", { column: label(grid.column) })}
          </caption>
          <thead>
            <tr>
              <td />
              <th scope="colgroup" colSpan={grid.columns.length} className="px-2 py-1 text-center text-xs font-medium text-slate-500">
                {label(grid.column)}
              </th>
            </tr>
            <tr>
              <th scope="col" className="px-2 py-1 text-start text-xs font-medium text-slate-500">
                {t("whatIf.grid.rowHeader")}
              </th>
              {grid.columns.map((columnValue) => (
                <th
                  key={columnValue}
                  scope="col"
                  className={clsx(
                    "px-2 py-1 text-center text-xs tabular-nums",
                    columnValue === values[grid.column] ? "font-semibold text-slate-900" : "font-medium text-slate-600",
                  )}
                >
                  {isolate(value(grid.column, columnValue))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row, rowIndex) => (
              <tr key={row}>
                <th
                  scope="row"
                  className={clsx(
                    "px-2 py-1 text-start text-xs tabular-nums",
                    row === values.retirementAge ? "font-semibold text-slate-900" : "font-medium text-slate-600",
                  )}
                >
                  {isolate(String(row))}
                </th>
                {grid.columns.map((columnValue, columnIndex) => {
                  const margin = grid.cells[rowIndex][columnIndex];
                  const current = row === values.retirementAge && columnValue === values[grid.column];
                  return (
                    <td key={columnValue} className="p-0">
                      <button
                        type="button"
                        disabled={current}
                        aria-current={current || undefined}
                        aria-label={t("whatIf.grid.cellLabel", {
                          age: row,
                          column: label(grid.column),
                          value: value(grid.column, columnValue),
                          margin: cell(margin),
                        })}
                        onClick={() => onPick(row, columnValue)}
                        style={tint(margin, scale, hasSpending)}
                        className={clsx(
                          "w-full rounded-md px-2 py-1.5 text-center text-xs tabular-nums text-slate-900",
                          current ? "font-semibold ring-2 ring-slate-900" : "hover:ring-2 hover:ring-brand-600",
                        )}
                      >
                        {isolate(cell(margin))}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">{t("whatIf.grid.note")}</p>
    </section>
  );
}
