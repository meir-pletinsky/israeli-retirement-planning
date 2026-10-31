import clsx from "clsx";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  DEFAULT_BACKTEST_STOCK_SHARE_PCT,
  MAX_PLANNING_AGE,
  type BacktestBasis,
  type HistoricalBacktestResult,
  groupConsecutiveYears,
  runHistoricalBacktest,
  successBand,
} from "../domain";
import type { ProfileData, RetirementScenario } from "../types";
import { BacktestChart } from "./charts/BacktestChart";
import { BACKTEST_COLOURS } from "./charts/backtestColours";

interface HistoricalBacktestCardProps {
  profile: ProfileData;
  scenario: RetirementScenario;
  /** Whether the user has entered desired retirement spending. */
  hasTarget: boolean;
}

const BAND_CLASSES = {
  strong: "text-emerald-600",
  fair: "text-slate-900",
  weak: "text-amber-600",
} as const;

const STOCK_SHARES = Array.from({ length: 11 }, (_, index) => index * 10);
const BASIS_LABEL_KEYS: Record<BacktestBasis, string> = {
  asHappened: "projections.history.basisAsHappened",
  matchedToPlan: "projections.history.basisMatched",
};
const BASES = Object.keys(BASIS_LABEL_KEYS) as BacktestBasis[];

const percent = (fraction: number) => (fraction * 100).toFixed(1);

/** Keeps digits and dashes reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;
const yearRange = (from: number, to: number) => isolate(`${from}–${to}`);

/** Years as "1929–1932, 1965", the way a person would list them. */
function formatYearRuns(years: readonly number[]): string {
  return groupConsecutiveYears(years)
    .map(([from, to]) => isolate(from === to ? `${from}` : `${from}–${to}`))
    .join(", ");
}

export function HistoricalBacktestCard({ profile, scenario, hasTarget }: HistoricalBacktestCardProps) {
  const { t } = useTranslation();
  const controlsId = useId();
  const [stockSharePct, setStockSharePct] = useState(DEFAULT_BACKTEST_STOCK_SHARE_PCT);
  const [basis, setBasis] = useState<BacktestBasis>("asHappened");
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;

  // Like the risk analysis: the replay reruns only when the plan or a setting changes, and the
  // deferred values let the controls answer before it finishes.
  const deferredScenario = useDeferredValue(scenario);
  const deferredShare = useDeferredValue(stockSharePct);
  const deferredBasis = useDeferredValue(basis);
  const result = useMemo(
    () =>
      hasTarget
        ? runHistoricalBacktest(profile, deferredScenario, {
            stockSharePct: deferredShare,
            basis: deferredBasis,
          })
        : null,
    [hasTarget, profile, deferredScenario, deferredShare, deferredBasis],
  );
  const updating =
    deferredScenario !== scenario || deferredShare !== stockSharePct || deferredBasis !== basis;

  return (
    <section
      aria-labelledby="history-title"
      aria-busy={updating}
      className={clsx(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-opacity",
        updating && "opacity-50",
      )}
    >
      <h2 id="history-title" className="text-sm font-semibold text-slate-700">
        {t("projections.history.title")}
      </h2>

      {!hasTarget && (
        <p className="mt-2 text-sm text-slate-600">
          {t("projections.history.noTarget")}{" "}
          <Link to="/my-data/expenses" className="font-medium text-brand-700 hover:underline">
            {t("projections.history.noTargetCta")}
          </Link>
        </p>
      )}

      {hasTarget && !result && (
        <p className="mt-2 text-sm text-slate-600">
          {t("projections.history.noYears", { age: MAX_PLANNING_AGE })}
        </p>
      )}

      {result && (
        <>
          <p className="mt-1 text-xs text-slate-500">
            {t("projections.history.intro", { first: result.firstYear })}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${controlsId}-mix`} className="text-sm font-medium text-slate-700">
                {t("projections.history.mixLabel")}
              </label>
              <select
                id={`${controlsId}-mix`}
                value={stockSharePct}
                onChange={(event) => setStockSharePct(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
              >
                {STOCK_SHARES.map((share) => (
                  <option key={share} value={share}>
                    {t("projections.history.mixOption", { stocks: share, bonds: 100 - share })}
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-slate-700">
                {t("projections.history.basisLabel")}
              </legend>
              <div className="mt-1 space-y-1">
                {BASES.map((option) => (
                  <label key={option} className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name={`${controlsId}-basis`}
                      checked={basis === option}
                      onChange={() => setBasis(option)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{t(BASIS_LABEL_KEYS[option])}</span>
                      <span className="block text-xs text-slate-500">
                        {option === "asHappened"
                          ? t("projections.history.basisAsHappenedHint", {
                              history: percent(result.historyRealReturn),
                            })
                          : t("projections.history.basisMatchedHint", {
                              plan: percent(result.planRealReturn),
                            })}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <Results result={result} money={money} currencySymbol={currencySymbol} />
        </>
      )}
    </section>
  );
}

function Results({
  result,
  money,
  currencySymbol,
}: {
  result: HistoricalBacktestResult;
  money: (amount: number) => string;
  currencySymbol: string;
}) {
  const { t } = useTranslation();
  const band = successBand(result.successProbability);
  const { worstWindow } = result;
  const total = result.windows.length;

  return (
    <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {t("projections.history.successLabel", { age: MAX_PLANNING_AGE })}
          </p>
          <p className={clsx("mt-1 text-3xl font-semibold tabular-nums", BAND_CLASSES[band])}>
            {t("projections.history.successValue", { funded: result.fundedCount, total })}
          </p>
          <p className="mt-1 text-xs text-slate-600">{t(`projections.history.band.${band}`)}</p>
        </div>

        {result.survivableNetMonthly !== null && (
          <div>
            <p className="text-sm font-medium text-slate-500">{t("projections.history.survivableLabel")}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
              <span dir="ltr">{money(result.survivableNetMonthly)}</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {t("projections.history.survivableHint", { target: money(result.targetNetMonthly) })}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-700">
        {result.failedStartYears.length > 0
          ? t("projections.history.shortYears", { years: formatYearRuns(result.failedStartYears) })
          : t("projections.history.noneShort")}
      </p>
      <p className="mt-1 text-sm text-slate-700">
        {worstWindow.funded
          ? t("projections.history.worstOk", {
              start: worstWindow.startYear,
              range: yearRange(worstWindow.startYear, worstWindow.endYear),
              amount: money(worstWindow.finalNetWorth),
              age: MAX_PLANNING_AGE,
            })
          : t("projections.history.worstShort", {
              start: worstWindow.startYear,
              range: yearRange(worstWindow.startYear, worstWindow.endYear),
              age: worstWindow.shortfallAge,
            })}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {t("projections.history.returnsLine", {
          plan: percent(result.planRealReturn),
          history: percent(result.historyRealReturn),
          range: yearRange(result.firstYear, result.lastYear),
        })}
      </p>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">{t("projections.history.chartTitle")}</h3>
      <BacktestChart
        windows={result.windows}
        worstStartYear={worstWindow.startYear}
        currentAge={result.currentAge}
        drawdownStartAge={result.drawdownStartAge}
        currencySymbol={currencySymbol}
      />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {(
          [
            ["funded", "legendFunded"],
            ["short", "legendShort"],
            ["worst", "legendWorst"],
          ] as const
        ).map(([colour, label]) => (
          <li key={colour} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-5 rounded"
              style={{ backgroundColor: BACKTEST_COLOURS[colour] }}
            />
            {t(`projections.history.${label}`)}
          </li>
        ))}
      </ul>

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.history.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>
            {t("projections.history.howWindows", {
              age: MAX_PLANNING_AGE,
              count: total,
              first: result.firstYear,
              last: result.lastYear,
            })}
          </li>
          <li>
            {t("projections.history.howMix", {
              stocks: result.stockSharePct,
              bonds: 100 - result.stockSharePct,
            })}
          </li>
          <li>{t("projections.history.howOverlap")}</li>
          <li>{t("projections.history.howCurrency")}</li>
          <li>
            {t("projections.history.howTax", {
              percent: (result.taxShare * 100).toFixed(1),
              gross: money(result.targetGrossMonthly),
            })}
          </li>
          <li>
            {t("projections.history.howSource", { range: yearRange(result.firstYear, result.lastYear) })}
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">{t("projections.history.notForecast")}</p>
      </details>
    </>
  );
}
