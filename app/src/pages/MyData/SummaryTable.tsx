import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useMediaQuery } from "../../app/useMediaQuery";

/** The layout where the app swaps the sidebar for the bottom navigation: tables become cards. */
const NARROW_SCREEN = "(max-width: 767px)";

/** Below this width a table with many columns would scroll sideways, hiding its value columns. */
const LAPTOP_SCREEN = "(max-width: 1279px)";

export interface SummaryColumn<Row> {
  key: string;
  header: string;
  headerClassName?: string;
  /** Figures line up at the end of the cell. */
  numeric?: boolean;
  /**
   * On a narrow screen, where each row becomes a card: shown on the card itself instead of under
   * "More details". The first column is always the card's title. On a laptop-width screen, a table
   * with `collapseSecondary` keeps only these columns in the row.
   */
  primary?: boolean;
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
   * sideways, or at the foot of the row's card. They get the id of the element that names the
   * row, to describe which row they act on.
   */
  rowActions?: (row: Row, describedBy: string) => ReactNode;
  /** Shown instead of the table while there are no rows. */
  emptyMessage?: ReactNode;
  /**
   * For a table with many columns: on a laptop-width screen, keep only the title and the primary
   * columns in each row and put the others under that row's "More details", so the values and
   * their totals stay in view instead of scrolling off to the side.
   */
  collapseSecondary?: boolean;
  /** Notes shown under the table. */
  children?: ReactNode;
}

/**
 * The items entered on a My Data step, as a table with their totals and, when given, edit buttons per row.
 * On a phone each item is a card instead, so the balance and the buttons are not pushed off screen.
 */
export function SummaryTable<Row>({
  id,
  title,
  rows,
  rowKey,
  columns,
  toolbar,
  rowActions,
  emptyMessage,
  collapseSecondary,
  children,
}: SummaryTableProps<Row>) {
  const { t } = useTranslation();
  const narrow = useMediaQuery(NARROW_SCREEN);
  const laptop = useMediaQuery(LAPTOP_SCREEN);
  const hasTotals = columns.some((column) => column.total !== undefined);
  const alignment = (numeric?: boolean) => (numeric ? "text-end tabular-nums" : "text-start");
  const labelId = (row: Row) => `${id}-${rowKey(row)}-label`;
  // The actions column keeps a solid background so the cells that scroll beneath it do not show through.
  const actionCell = "sticky end-0 bg-white px-1 py-2 text-end whitespace-nowrap";
  // Keeps the name of the row readable on a narrow screen instead of wrapping word by word.
  const firstColumn = "min-w-[11rem]";
  const [titleColumn, ...otherColumns] = columns;
  const faceColumns = otherColumns.filter((column) => column.primary);
  const detailColumns = otherColumns.filter((column) => !column.primary);
  const totalColumns = columns.filter((column) => column.total !== undefined);

  const value = (column: SummaryColumn<Row>, row: Row) =>
    column.numeric ? <span dir="ltr">{column.cell(row)}</span> : column.cell(row);
  const pairs = (list: SummaryColumn<Row>[], row: Row) =>
    list.map((column) => (
      <div key={column.key} className="min-w-0">
        <dt className="text-xs text-slate-500">{column.header}</dt>
        <dd className="break-words text-sm text-slate-900">{value(column, row)}</dd>
      </div>
    ));
  const moreDetails = (row: Row, className: string) => (
    <details className={className}>
      <summary className="cursor-pointer text-xs font-medium text-brand-700">
        {t("myData.summary.moreDetails")}
        <span className="sr-only"> {titleColumn?.header}</span>
      </summary>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">{pairs(detailColumns, row)}</dl>
    </details>
  );

  const cards = (
    <>
      <ul aria-label={title} className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-xl border border-slate-200 p-4">
            {titleColumn && (
              <div id={labelId(row)} className="min-w-0 break-words text-sm text-slate-800">
                {titleColumn.cell(row)}
              </div>
            )}
            {faceColumns.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">{pairs(faceColumns, row)}</dl>
            )}
            {detailColumns.length > 0 && moreDetails(row, "mt-2")}
            {rowActions && (
              <div className="mt-2 border-t border-slate-100 pt-2">{rowActions(row, labelId(row))}</div>
            )}
          </li>
        ))}
      </ul>
      {hasTotals && (
        <div role="group" aria-label={t("myData.summary.total")} className="mt-3 border-t-2 border-slate-200 pt-2">
          <p className="text-sm font-semibold text-slate-900">{t("myData.summary.total")}</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
            {totalColumns.map((column) => (
              <div key={column.key} className="min-w-0">
                <dt className="text-xs text-slate-500">{column.header}</dt>
                <dd className="break-words text-sm font-semibold text-slate-900">
                  <span dir="ltr">{column.total}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );

  // The columns left out of the row on a laptop-width screen are reachable from its "More details".
  const collapsed = Boolean(collapseSecondary) && laptop && detailColumns.length > 0;
  const shownColumns = collapsed
    ? columns.filter((column, index) => index === 0 || column.primary)
    : columns;

  const table = (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[32rem] text-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {shownColumns.map((column, index) => (
              <th
                key={column.key}
                scope="col"
                className={`px-2.5 py-2.5 align-bottom text-xs font-semibold leading-tight text-slate-600 hyphens-auto [overflow-wrap:anywhere] first:rounded-s-lg ${alignment(column.numeric)} ${index === 0 ? firstColumn : ""} ${column.headerClassName ?? ""}`}
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
            <tr key={rowKey(row)} className="border-t border-slate-200/80 align-top transition-colors hover:bg-slate-50/70">
              {shownColumns.map((column, index) => (
                <td
                  key={column.key}
                  id={index === 0 && rowActions && !collapsed ? labelId(row) : undefined}
                  className={`px-2.5 py-3 text-slate-800 ${alignment(column.numeric)} ${index === 0 ? (collapsed ? "min-w-[14rem]" : firstColumn) : ""}`}
                >
                  {index === 0 && collapsed ? (
                    <>
                      <div id={rowActions ? labelId(row) : undefined}>{value(column, row)}</div>
                      {moreDetails(row, "mt-1.5")}
                    </>
                  ) : (
                    value(column, row)
                  )}
                </td>
              ))}
              {rowActions && <td className={actionCell}>{rowActions(row, labelId(row))}</td>}
            </tr>
          ))}
        </tbody>
        {hasTotals && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
              {shownColumns.map((column, index) => (
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
  );

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        {toolbar}
      </div>

      {rows.length === 0 && emptyMessage !== undefined ? (
        <div className="mt-3">{emptyMessage}</div>
      ) : narrow ? (
        cards
      ) : (
        table
      )}

      {children}
    </section>
  );
}
