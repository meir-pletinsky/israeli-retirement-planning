import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { CoverComparison, CoverOptionResult } from "../domain";
import type { AccountOwner, CoverOption } from "../types";
import { useFormatAge } from "./useFormatAge";

interface CoverOptionsCardProps {
  comparisons: CoverComparison[];
  /** Saves the option as this person's cover plan. */
  onSelect: (person: AccountOwner, option: CoverOption) => void;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;
const oneDecimal = (value: number) => String(Math.round(value * 10) / 10);

/** The ways of handling the survivors' cover that lapses when deposits stop, side by side: the gap, the cost, no ranking. */
export function CoverOptionsCard({ comparisons, onSelect }: CoverOptionsCardProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${Math.round(amount).toLocaleString()}`);

  if (comparisons.length === 0) {
    return null;
  }

  const showPerson = comparisons.length > 1 || comparisons[0].person === "spouse";
  const optionName = (option: CoverOption) => t(`projections.cover.option.${option}`);
  const dash = <span className="text-slate-400">—</span>;

  const rowsFor = (rows: CoverOptionResult[]): { key: string; label: string; cell: (row: CoverOptionResult) => ReactNode }[] => [
    {
      key: "uncovered",
      label: t("projections.cover.uncovered"),
      cell: (row) =>
        row.windows.gapYears > 0 ? (
          <>
            <span className="block font-medium tabular-nums">
              {t("projections.cover.years", { years: oneDecimal(row.windows.gapYears) })}
            </span>
            <span className="block text-xs text-slate-500">
              {t("projections.cover.range", {
                from: formatAge(row.windows.gapStartAge),
                to: formatAge(row.windows.needEndAge),
              })}
            </span>
          </>
        ) : (
          <span className="font-medium">{t("projections.cover.none")}</span>
        ),
    },
    ...(rows.some((row) => row.survivors)
      ? [
          {
            key: "gapMoney",
            label: t("projections.cover.gapMoney"),
            cell: (row: CoverOptionResult) =>
              row.windows.gapYears <= 0 ? (
                <span className="font-medium">{t("projections.cover.none")}</span>
              ) : row.survivors ? (
                <>
                  <span className="block font-medium tabular-nums">
                    {t("projections.cover.perMonth", { amount: money(row.survivors.gapMonthly) })}
                  </span>
                  {row.survivors.accountsWithoutFactor > 0 && (
                    <span className="block text-xs text-slate-500">{t("projections.cover.upperBound")}</span>
                  )}
                </>
              ) : (
                dash
              ),
          },
        ]
      : []),
    {
      key: "monthlyCost",
      label: t("projections.cover.monthlyCost"),
      cell: (row) =>
        row.option === "none" ? (
          <span className="font-medium">{t("projections.cover.noCost")}</span>
        ) : row.monthlyCost === null ? (
          <span className="text-xs text-slate-500">{t("projections.cover.costUnknown")}</span>
        ) : (
          <span className="font-medium tabular-nums">
            {t("projections.cover.perMonth", { amount: money(row.monthlyCost) })}
          </span>
        ),
    },
    {
      key: "totalCost",
      label: t("projections.cover.totalCost"),
      cell: (row) =>
        row.option === "none" ? (
          <span className="font-medium">{t("projections.cover.noCost")}</span>
        ) : row.totalCost === null ? (
          dash
        ) : (
          <>
            <span className="block font-medium tabular-nums">{money(row.totalCost)}</span>
            <span className="block text-xs text-slate-500">
              {t("projections.cover.overYears", { years: oneDecimal(row.windows.costYears) })}
            </span>
          </>
        ),
    },
  ];

  return (
    <section
      aria-labelledby="cover-options-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="cover-options-title" className="text-sm font-semibold text-slate-700">
        {t("projections.cover.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("projections.cover.intro")}</p>

      {comparisons.map((comparison) => {
        const who = t(`projections.cover.person.${comparison.person}`);
        return (
          <div key={comparison.person} className="mt-4" data-testid={`cover-options-${comparison.person}`}>
            {showPerson && <h3 className="text-sm font-semibold text-slate-800">{who}</h3>}
            <p className="text-xs text-slate-500">
              {t("projections.cover.depositsStop", { age: formatAge(comparison.retirementAge) })}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[22rem] text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="py-1 pe-3 text-start align-bottom font-medium text-slate-500">
                      {t("projections.cover.metricColumn")}
                    </th>
                    {comparison.rows.map((row) => (
                      <th
                        key={row.option}
                        scope="col"
                        className={clsx(
                          "px-1.5 py-1 text-start align-top sm:px-2",
                          row.isSaved && "bg-brand-50",
                        )}
                      >
                        <span className="block font-semibold text-slate-800">{optionName(row.option)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsFor(comparison.rows).map((metric) => (
                    <tr key={metric.key} className="border-t border-slate-100 align-top">
                      <th scope="row" className="py-2 pe-3 text-start font-normal text-slate-600">
                        {metric.label}
                      </th>
                      {comparison.rows.map((row) => (
                        <td
                          key={row.option}
                          className={clsx("px-1.5 py-2 sm:px-2", row.isSaved && "bg-brand-50")}
                        >
                          {metric.cell(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100">
                    <th scope="row" className="py-2 pe-3" />
                    {comparison.rows.map((row) => (
                      <td
                        key={row.option}
                        className={clsx("px-1.5 py-2 sm:px-2", row.isSaved && "bg-brand-50")}
                      >
                        {row.isSaved ? (
                          <span className="text-xs font-semibold text-brand-700">
                            {t("projections.cover.chosen")}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelect(comparison.person, row.option)}
                            aria-label={t("projections.cover.chooseNamed", {
                              name: optionName(row.option),
                              who,
                            })}
                            className="rounded-md border border-brand-600 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          >
                            {t("projections.cover.choose")}
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <p className="mt-3 text-xs text-slate-500">{t("projections.cover.costNote")}</p>
      <p className="mt-1 text-xs">
        <Link to="/my-data/personal" className="font-medium text-brand-700 hover:underline">
          {t("projections.cover.editInMyData")}
        </Link>
      </p>

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.cover.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.cover.howWindow")}</li>
          <li>{t("projections.cover.howGapMoney")}</li>
          <li>{t("projections.cover.howCost")}</li>
          <li>{t("projections.cover.howScope")}</li>
        </ul>
      </details>
    </section>
  );
}
