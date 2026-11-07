import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  INCOME_BAND_KEYS,
  type BacktestWindow,
  type IncomeBandKey,
  type IncomeBreakdownPoint,
  type MonteCarloFanPoint,
  type NetIncomeYear,
  type NetWorthPoint,
} from "../../domain";

interface DataTableProps {
  caption: string;
  headers: string[];
  /** The first cell of each row is its header, normally the age or year. */
  rows: ReactNode[][];
}

/**
 * Every row is shown and the page does the scrolling: a table with its own vertical scrollbar
 * would catch the page scroll while the pointer is over it. Only a table wider than the screen
 * scrolls, and only sideways.
 */
function DataTable({ caption, headers, rows }: DataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={index} scope="col" className="py-1 pe-3 text-start font-medium text-slate-500">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-slate-100">
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row" className="py-1 pe-3 text-start font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex} className="py-1 pe-3 tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useMoney() {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  return (amount: number) => `${currencySymbol}${Math.round(amount).toLocaleString()}`;
}

/** Net worth at each age: the data behind the net worth line. */
export function NetWorthTable({ points, caption }: { points: NetWorthPoint[]; caption: string }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <DataTable
      caption={caption}
      headers={[t("charts.table.age"), t("charts.table.netWorth")]}
      rows={points.map((point) => [point.age, money(point.netWorth)])}
    />
  );
}

/** The low end, median and high end of net worth at each age, from the market simulation. */
export function FanTable({ fan, caption }: { fan: MonteCarloFanPoint[]; caption: string }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <DataTable
      caption={caption}
      headers={[
        t("charts.table.age"),
        t("charts.table.low"),
        t("charts.table.median"),
        t("charts.table.high"),
      ]}
      rows={fan.map((point) => [point.age, money(point.p10), money(point.p50), money(point.p90)])}
    />
  );
}

/** One row per historical starting year: whether spending was funded and where net worth ended. */
export function BacktestTable({ windows, caption }: { windows: BacktestWindow[]; caption: string }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <DataTable
      caption={caption}
      headers={[t("charts.table.startYear"), t("charts.table.result"), t("charts.table.finalNetWorth")]}
      rows={windows.map((window) => [
        window.startYear,
        window.funded
          ? t("projections.history.legendFunded")
          : t("charts.table.shortAt", { age: window.shortfallAge }),
        money(window.finalNetWorth),
      ])}
    />
  );
}

interface IncomeBreakdownTableProps {
  points: IncomeBreakdownPoint[];
  labels: Record<IncomeBandKey, string>;
  caption: string;
}

/** Monthly income by source at each age; only the sources that pay at some age get a column. */
export function IncomeBreakdownTable({ points, labels, caption }: IncomeBreakdownTableProps) {
  const { t } = useTranslation();
  const money = useMoney();
  const bands = INCOME_BAND_KEYS.filter((band) => points.some((point) => point[band] > 0));
  return (
    <DataTable
      caption={caption}
      headers={[
        t("charts.table.age"),
        ...bands.map((band) => labels[band]),
        t("projections.split.total"),
      ]}
      rows={points.map((point) => [
        point.age,
        ...bands.map((band) => money(point[band])),
        money(bands.reduce((sum, band) => sum + point[band], 0)),
      ])}
    />
  );
}

/** Each year's income before tax, the tax, and what is kept. */
export function NetIncomeTable({ years, caption }: { years: NetIncomeYear[]; caption: string }) {
  const { t } = useTranslation();
  const money = useMoney();
  return (
    <DataTable
      caption={caption}
      headers={[
        t("charts.table.age"),
        t("projections.netIncomeKept"),
        t("projections.netIncomeTax"),
        t("charts.table.gross"),
      ]}
      rows={years.map((year) => [
        year.age,
        money(year.netMonthly),
        money(year.taxMonthly),
        money(year.grossMonthly),
      ])}
    />
  );
}
