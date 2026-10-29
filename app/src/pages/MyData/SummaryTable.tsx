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
  /** Notes shown under the table. */
  children?: ReactNode;
}

/** A read-only overview of the items entered on a My Data step; editing happens on the cards below it. */
export function SummaryTable<Row>({
  id,
  title,
  rows,
  rowKey,
  columns,
  children,
}: SummaryTableProps<Row>) {
  const { t } = useTranslation();
  const hasTotals = columns.some((column) => column.total !== undefined);
  const alignment = (numeric?: boolean) => (numeric ? "text-end tabular-nums" : "text-start");

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id={`${id}-title`} className="text-sm font-semibold text-slate-700">
        {title}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("myData.summary.readOnlyHint")}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-slate-200">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-2 py-1.5 text-xs font-semibold text-slate-600 ${alignment(column.numeric)}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-slate-100 align-top">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-2 py-1.5 text-slate-800 ${alignment(column.numeric)}`}
                  >
                    {column.numeric ? <span dir="ltr">{column.cell(row)}</span> : column.cell(row)}
                  </td>
                ))}
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
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {children}
    </section>
  );
}
