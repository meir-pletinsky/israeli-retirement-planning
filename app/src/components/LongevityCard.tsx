import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { LongevityTest } from "../domain";
import { formatNumber } from "../i18n/formatters";
import { ScenarioTitle } from "./ScenarioTag";

interface LongevityCardProps {
  longevity: LongevityTest;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

/** What the plan gives if the household lives to each of the planning ages, from the one it uses to a later one. */
export function LongevityCard({ longevity, scenarioTag }: LongevityCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${formatNumber(Math.round(amount))}`);
  const hasSpending = longevity.desiredMonthly !== null;

  return (
    <section
      id="longevity-test"
      aria-labelledby="longevity-title"
      className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="longevity-title" tag={scenarioTag}>
        {t("projections.longevity.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.longevity.intro")}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.longevity.ageColumn")}
              </th>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.longevity.incomeColumn")}
              </th>
              {hasSpending && (
                <th className="py-1 text-start font-medium text-slate-500">
                  {t("projections.longevity.spendingColumn")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {longevity.rows.map((row) => (
              <tr key={row.age} className="border-t border-slate-100 align-top">
                <td className="py-2 pe-3">
                  <span className="block font-medium">
                    {t("projections.longevity.rowAge", { age: isolate(String(row.age)) })}
                  </span>
                  {row.isPlanned && (
                    <span className="block text-xs text-slate-500">{t("projections.longevity.planned")}</span>
                  )}
                </td>
                <td className="py-2 pe-3 tabular-nums">
                  <span className="block font-medium">{money(row.netMonthlyIncome)}</span>
                  {!row.isPlanned && (
                    <span className="block text-xs text-slate-500">
                      {Math.round(row.netMonthlyChange) === 0
                        ? t("projections.longevity.noChange")
                        : t("projections.longevity.change", {
                            amount: isolate(
                              `${row.netMonthlyChange < 0 ? "-" : "+"}${currencySymbol}${formatNumber(
                                Math.abs(Math.round(row.netMonthlyChange)),
                              )}`,
                            ),
                          })}
                    </span>
                  )}
                </td>
                {hasSpending && (
                  <td className="py-2">
                    {row.runsOutAge !== null ? (
                      <span className="block text-xs text-red-600">
                        {t("projections.longevity.runsOut", { age: isolate(String(row.runsOutAge)) })}
                      </span>
                    ) : row.monthlyGap !== null && row.monthlyGap < 0 ? (
                      <span className="block text-xs text-red-600">
                        {t("projections.longevity.short", { amount: money(-row.monthlyGap) })}
                      </span>
                    ) : (
                      <span className="block text-xs text-emerald-700">
                        {t("projections.longevity.lasts", { age: isolate(String(row.age)) })}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.longevity.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.longevity.howIncome")}</li>
          <li>{t("projections.longevity.howLifelong")}</li>
          <li>{t("projections.longevity.howSpending")}</li>
          <li>{t("projections.longevity.howReadOnly")}</li>
        </ul>
      </details>
    </section>
  );
}
