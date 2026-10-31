import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface SummaryColumn<Row> {
  key: string;
  header: string;
  /** Figures line up at the end of the cell. */
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
  /** The column's value in the totals row; omit to leave it empty. */
  total?: ReactNode;
}

interface SummaryTableProps<Row> {
  id: string;
  title: string;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  columns: readonly SummaryColumn<Row>[];
  /** Buttons at the end of the heading row, such as Add. */
  toolbar?: ReactNode;
  /**
   * The buttons for one row, shown in a last column that stays in view when the table scrolls
   * sideways. They get the id of the row's first cell, to describe which row they act on.
   */
  rowActions?: (row: Row, describedBy: string) => ReactNode;
  /** Shown instead of the table while there are no rows. */
  emptyMessage?: ReactNode;
  /** Notes shown under the table. */
  children?: ReactNode;
}

/** The items entered on a My Data step, as a table with their totals and, when given, edit buttons per row. */
export function SummaryTable<Row>({
  id,
  title,
  rows,
  rowKey,
  columns,
  toolbar,
  rowActions,
  emptyMessage,
  children,
}: SummaryTableProps<Row>) {
  const { t } = useTranslation();
  const hasTotals = columns.some((column) => column.total !== undefined);
  const alignment = (numeric?: boolean) => (numeric ? "text-end tabular-nums" : "text-start");
  const labelId = (row: Row) => `${id}-${rowKey(row)}-label`;
  // The actions column keeps a solid background so the cells that scroll beneath it do not show through.
  const actionCell = "sticky end-0 bg-white px-2 py-1.5 text-end whitespace-nowrap";
  // Keeps the name of the row readable on a narrow screen instead of wrapping word by word.
  const firstColumn = "min-w-[9rem]";

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-sm font-semibold text-slate-700">
          {title}
        </h2>
        {toolbar}
      </div>

      {rows.length === 0 && emptyMessage !== undefined ? (
        <div className="mt-3">{emptyMessage}</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-slate-200">
                {columns.map((column, index) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-2 py-1.5 text-xs font-semibold text-slate-600 ${alignment(column.numeric)} ${index === 0 ? firstColumn : ""}`}
                  >
                    {column.header}
                  </th>
                ))}
                {rowActions && (
                  <th scope="col" className={actionCell}>
                    <span className="sr-only">{t("myData.summary.actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)} className="border-t border-slate-100 align-top">
                  {columns.map((column, index) => (
                    <td
                      key={column.key}
                      id={index === 0 && rowActions ? labelId(row) : undefined}
                      className={`px-2 py-1.5 text-slate-800 ${alignment(column.numeric)} ${index === 0 ? firstColumn : ""}`}
                    >
                      {column.numeric ? <span dir="ltr">{column.cell(row)}</span> : column.cell(row)}
                    </td>
                  ))}
                  {rowActions && <td className={actionCell}>{rowActions(row, labelId(row))}</td>}
                </tr>
              ))}
            </tbody>
            {hasTotals && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
                  {columns.map((column, index) => (
                    <td key={column.key} className={`px-2 py-1.5 ${alignment(column.numeric)}`}>
                      {index === 0 ? (
                        t("myData.summary.total")
                      ) : column.total !== undefined ? (
                        <span dir="ltr">{column.total}</span>
                      ) : null}
                    </td>
                  ))}
                  {rowActions && <td className={actionCell} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {children}
    </section>
  );
}
