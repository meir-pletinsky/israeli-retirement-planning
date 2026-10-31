import { useTranslation } from "react-i18next";

import type { StressOutcome, StressRow, StressTest } from "../domain";

interface StressTestCardProps {
  stress: StressTest | null;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

/** One decimal below 10 percent, none above. */
const formatPercent = (value: number) =>
  Math.abs(value) < 10 ? Number(Math.abs(value).toFixed(1)) : Math.round(Math.abs(value));

export function StressTestCard({ stress }: StressTestCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${Math.round(amount).toLocaleString()}`);

  if (!stress) {
    return null;
  }

  const signedMoney = (amount: number) =>
    isolate(`${amount < 0 ? "-" : "+"}${currencySymbol}${Math.abs(Math.round(amount)).toLocaleString()}`);

  const changeText = (change: number, percent: number | null) => {
    if (Math.round(change) === 0) return t("projections.stress.noChange");
    const amount = signedMoney(change);
    if (percent === null) return t("projections.stress.changeAmountOnly", { amount });
    return t("projections.stress.change", {
      amount,
      percent: isolate(`${percent < 0 ? "-" : "+"}${formatPercent(percent)}%`),
    });
  };

  const rowLabel = (row: StressRow) => {
    const shares = isolate(`${row.employerStockDropPct}%`);
    const dollar = isolate(`${row.dollarDropPct}%`);
    if (row.kind === "employerStock") return t("projections.stress.rowEmployerStock", { percent: shares });
    if (row.kind === "dollar") return t("projections.stress.rowDollar", { percent: dollar });
    return t("projections.stress.rowBoth", { shares, dollar });
  };

  const incomeNote = (outcome: StressOutcome) => {
    if (outcome.monthlyGap === null) return null;
    return outcome.monthlyGap >= 0 ? (
      <span className="block text-xs text-emerald-700">{t("projections.stress.covers")}</span>
    ) : (
      <span className="block text-xs text-red-600">
        {t("projections.stress.short", { amount: money(-outcome.monthlyGap) })}
      </span>
    );
  };

  return (
    <section
      aria-labelledby="stress-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="stress-title" className="text-sm font-semibold text-slate-700">
        {t("projections.stress.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("projections.stress.intro")}</p>
      <p className="mt-1 text-xs text-slate-500">
        {t("projections.stress.exposureDollar", { amount: money(stress.dollarValue) })}
        {stress.employerValue >= 0.5 && (
          <> {t("projections.stress.exposureEmployer", { amount: money(stress.employerValue) })}</>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.stress.scenarioColumn")}
              </th>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.stress.savingsColumn")}
              </th>
              <th className="py-1 text-start font-medium text-slate-500">
                {t("projections.stress.incomeColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100 align-top">
              <td className="py-2 pe-3 font-medium">{t("projections.stress.baseRow")}</td>
              <td className="py-2 pe-3 font-medium tabular-nums">{money(stress.base.netWorthAtRetirement)}</td>
              <td className="py-2 tabular-nums">
                <span className="block font-medium">{money(stress.base.netMonthlyIncome)}</span>
                {incomeNote(stress.base)}
              </td>
            </tr>
            {stress.rows.map((row) => (
              <tr
                key={`${row.kind}-${row.employerStockDropPct}-${row.dollarDropPct}`}
                className="border-t border-slate-100 align-top"
              >
                <td className="py-2 pe-3">{rowLabel(row)}</td>
                <td className="py-2 pe-3 tabular-nums">
                  <span className="block font-medium">{money(row.netWorthAtRetirement)}</span>
                  <span className="block text-xs text-slate-500">
                    {changeText(row.netWorthChange, row.netWorthChangePercent)}
                  </span>
                </td>
                <td className="py-2 tabular-nums">
                  <span className="block font-medium">{money(row.netMonthlyIncome)}</span>
                  <span className="block text-xs text-slate-500">
                    {changeText(row.netMonthlyChange, row.netMonthlyChangePercent)}
                  </span>
                  {incomeNote(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.stress.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.stress.howEmployer")}</li>
          <li>{t("projections.stress.howDollar")}</li>
          <li>{t("projections.stress.howIncome")}</li>
          <li>{t("projections.stress.howRetirement")}</li>
          <li>{t("projections.stress.howReadOnly")}</li>
        </ul>
      </details>
    </section>
  );
}
