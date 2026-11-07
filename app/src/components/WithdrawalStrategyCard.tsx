import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { WithdrawalStrategyComparison, WithdrawalStrategyResult } from "../domain";
import { formatNumber } from "../i18n/formatters";
import type { WithdrawalStrategy } from "../types";
import { ScenarioTitle } from "./ScenarioTag";
import { useFormatAge } from "./useFormatAge";

interface WithdrawalStrategyCardProps {
  comparison: WithdrawalStrategyComparison;
  /** Saves the chosen order as the one the whole plan uses. */
  onSelect: (strategy: WithdrawalStrategy) => void;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

export function WithdrawalStrategyCard({
  comparison,
  onSelect,
  scenarioTag,
}: WithdrawalStrategyCardProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${formatNumber(Math.round(amount))}`);
  const signed = (amount: number) =>
    Math.abs(amount) < 0.5 ? null : isolate(`${amount < 0 ? "\u2212" : "+"}${currencySymbol}${formatNumber(Math.abs(Math.round(amount)))}`);

  const { results, current, desiredMonthly, surtaxThresholdAnnual, identical } = comparison;
  const inUse = results.find((result) => result.strategy === current);
  if (!inUse || results.every((result) => result.years.length === 0)) {
    return null;
  }

  const name = (strategy: WithdrawalStrategy) => t(`projections.withdrawal.strategy.${strategy}.name`);
  const perMonth = (amount: number) => t("projections.withdrawal.perMonth", { amount: money(amount) });
  const hasDesired = desiredMonthly !== null && desiredMonthly > 0;

  const withDelta = (
    result: WithdrawalStrategyResult,
    pick: (result: WithdrawalStrategyResult) => number,
    text: string,
    extra?: string,
  ): ReactNode => {
    const delta = result === inUse ? null : signed(pick(result) - pick(inUse));
    return (
      <>
        <span className="block font-medium tabular-nums">{text}</span>
        {extra && <span className="block text-xs text-slate-500">{extra}</span>}
        {delta && <span className="block text-xs text-slate-400 tabular-nums">{delta}</span>}
      </>
    );
  };

  const rows: { key: string; label: string; cell: (result: WithdrawalStrategyResult) => ReactNode }[] = [
    {
      key: "totalTax",
      label: t("projections.withdrawal.totalTax"),
      cell: (result) => withDelta(result, (r) => r.totalTax, money(result.totalTax)),
    },
    {
      key: "averageNet",
      label: t("projections.withdrawal.averageNet"),
      cell: (result) =>
        withDelta(result, (r) => r.averageNetMonthly, perMonth(result.averageNetMonthly)),
    },
    {
      key: "lowestNet",
      label: t("projections.withdrawal.lowestNet"),
      cell: (result) =>
        withDelta(
          result,
          (r) => r.lowestNetMonthly,
          perMonth(result.lowestNetMonthly),
          result.lowestNetAge === null
            ? undefined
            : t("projections.withdrawal.atAge", { age: formatAge(result.lowestNetAge) }),
        ),
    },
    ...(hasDesired
      ? [
          {
            key: "firstShortfall",
            label: t("projections.withdrawal.firstShortfall"),
            cell: (result: WithdrawalStrategyResult) => (
              <span className="font-medium">
                {result.firstShortfallAge === null
                  ? t("projections.withdrawal.never")
                  : t("projections.withdrawal.fromAge", { age: formatAge(result.firstShortfallAge) })}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "peakTaxable",
      label: t("projections.withdrawal.peakTaxable"),
      cell: (result) => (
        <span className="font-medium tabular-nums">
          {t("projections.withdrawal.perYear", { amount: money(result.peakTaxableAnnual) })}
        </span>
      ),
    },
    {
      key: "surtaxYears",
      label: t("projections.withdrawal.surtaxYears", { threshold: money(surtaxThresholdAnnual) }),
      cell: (result) => (
        <span className="font-medium tabular-nums">
          {result.surtaxYears === 0 ? t("projections.withdrawal.none") : result.surtaxYears}
        </span>
      ),
    },
  ];

  return (
    <section
      aria-labelledby="withdrawal-strategy-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="withdrawal-strategy-title" tag={scenarioTag}>
        {t("projections.withdrawal.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.withdrawal.intro")}</p>

      {identical ? (
        <p role="status" className="mt-3 text-sm text-slate-700">
          {t("projections.withdrawal.identical")}
        </p>
      ) : (
        <>
          <dl className="mt-3 space-y-1 text-xs text-slate-500">
            {results.map((result) => (
              <div key={result.strategy}>
                <dt className="inline font-semibold text-slate-700">{name(result.strategy)}: </dt>
                <dd className="inline">{t(`projections.withdrawal.strategy.${result.strategy}.description`)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead>
                <tr>
                  <th scope="col" className="py-1 pe-3 text-start align-bottom font-medium text-slate-500">
                    {t("projections.withdrawal.metricColumn")}
                  </th>
                  {results.map((result) => (
                    <th
                      key={result.strategy}
                      scope="col"
                      className={clsx(
                        "px-1.5 py-1 text-start align-top sm:px-2",
                        result === inUse && "bg-brand-50",
                      )}
                    >
                      <span className="block font-semibold text-slate-800">{name(result.strategy)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-slate-100 align-top">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-slate-600">
                      {row.label}
                    </th>
                    {results.map((result) => (
                      <td key={result.strategy} className={clsx("px-1.5 py-2 sm:px-2", result === inUse && "bg-brand-50")}>
                        {row.cell(result)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-slate-100">
                  <th scope="row" className="py-2 pe-3" />
                  {results.map((result) => (
                    <td key={result.strategy} className={clsx("px-1.5 py-2 sm:px-2", result === inUse && "bg-brand-50")}>
                      {result === inUse ? (
                        <span className="text-xs font-semibold text-brand-700">
                          {t("projections.withdrawal.inUse")}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelect(result.strategy)}
                          aria-label={t("projections.withdrawal.useNamed", { name: name(result.strategy) })}
                          className="rounded-md border border-brand-600 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                        >
                          {t("projections.withdrawal.use")}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("projections.withdrawal.deltaNote")}</p>
          <p className="mt-2 text-sm text-slate-700">{t("projections.withdrawal.tradeoff")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("projections.withdrawal.usedEverywhere")}</p>
        </>
      )}

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.withdrawal.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.withdrawal.howSameGross")}</li>
          <li>{t("projections.withdrawal.howLocked")}</li>
          <li>{t("projections.withdrawal.howRisk")}</li>
          <li>{t("projections.withdrawal.howEstimate")}</li>
        </ul>
      </details>
    </section>
  );
}
