import clsx from "clsx";
import { type ReactNode, useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  DEFAULT_BACKTEST_STOCK_SHARE_PCT,
  type BacktestBasis,
  type HistoricalBacktestResult,
  groupConsecutiveYears,
  resolveVolatility,
  runHistoricalBacktest,
  successBand,
} from "../domain";
import { formatFixed, formatNumber } from "../i18n/formatters";
import type { ProfileData, RetirementScenario } from "../types";
import { BacktestChart } from "./charts/BacktestChart";
import { BACKTEST_COLOURS } from "./charts/backtestColours";
import { ChartFrame } from "./charts/ChartFrame";
import { BacktestTable } from "./charts/ChartTables";
import { useChartTakeaways } from "./charts/chartTakeaways";
import { ScenarioTitle } from "./ScenarioTag";

interface HistoricalBacktestCardProps {
  profile: ProfileData;
  scenario: RetirementScenario;
  /** Whether the user has entered desired retirement spending. */
  hasTarget: boolean;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
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

const percent = (fraction: number) => formatFixed(fraction * 100, 1);

/** Keeps digits and dashes reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;
/** A real-return gap under half a percentage point counts as "about the same". */
const RETURN_GAP_TOLERANCE = 0.005;
const yearRange = (from: number, to: number) => isolate(`${from}–${to}`);

/** Years as "1929–1932, 1965", the way a person would list them. */
function formatYearRuns(years: readonly number[]): string {
  return groupConsecutiveYears(years)
    .map(([from, to]) => isolate(from === to ? `${from}` : `${from}–${to}`))
    .join(", ");
}

export function HistoricalBacktestCard({
  profile,
  scenario,
  hasTarget,
  scenarioTag,
}: HistoricalBacktestCardProps) {
  const { t } = useTranslation();
  const controlsId = useId();
  const horizonAge = profile.assumptions.planningHorizonAge;
  const [stockSharePct, setStockSharePct] = useState(DEFAULT_BACKTEST_STOCK_SHARE_PCT);
  const [basis, setBasis] = useState<BacktestBasis>("asHappened");
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${formatNumber(amount)}`;

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
        "card transition-opacity",
        updating && "opacity-50",
      )}
    >
      <ScenarioTitle id="history-title" tag={scenarioTag}>
        {t("projections.history.title")}
      </ScenarioTitle>

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
          {t("projections.history.noYears", { age: horizonAge })}
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
                aria-describedby={`${controlsId}-mix-hint`}
                value={stockSharePct}
                onChange={(event) => setStockSharePct(Number(event.target.value))}
                className="field-control mt-1 h-11 w-full px-3"
              >
                {STOCK_SHARES.map((share) => (
                  <option key={share} value={share}>
                    {t("projections.history.mixOption", { stocks: share, bonds: 100 - share })}
                  </option>
                ))}
              </select>
              <p id={`${controlsId}-mix-hint`} className="mt-1 text-xs text-slate-500">
                {t("projections.history.mixHint")}
              </p>
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

          <Results
            result={result}
            money={money}
            currencySymbol={currencySymbol}
            volatilityPct={resolveVolatility(profile.assumptions.volatilityPct) * 100}
            horizonAge={horizonAge}
          />
        </>
      )}
    </section>
  );
}

function Results({
  result,
  money,
  currencySymbol,
  volatilityPct,
  horizonAge,
}: {
  result: HistoricalBacktestResult;
  money: (amount: number) => string;
  currencySymbol: string;
  /** The yearly volatility the risk simulation uses, in percent. */
  volatilityPct: number;
  /** The age the plan runs to; each replayed history is that many years long from retirement. */
  horizonAge: number;
}) {
  const { t } = useTranslation();
  const band = successBand(result.successProbability);
  const { worstWindow } = result;
  const total = result.windows.length;
  const backtestTakeaway = useChartTakeaways().backtest(result, horizonAge);
  const returnGap = result.replayedRealReturn - result.planRealReturn;
  const whyKey =
    returnGap >= RETURN_GAP_TOLERANCE ? "whyHigher" : returnGap <= -RETURN_GAP_TOLERANCE ? "whyLower" : "whySimilar";

  return (
    <>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {t("projections.history.successLabel", { age: horizonAge })}
          </p>
          <p className={clsx("mt-1 text-3xl font-semibold tabular-nums", BAND_CLASSES[band])}>
            {t("projections.history.successValue", { funded: result.fundedCount, total })}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {t(`projections.history.band.${result.fundedCount === total ? "all" : band}`)}
          </p>
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
              age: horizonAge,
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
      <p className="mt-1 text-xs text-slate-600">
        {t(`projections.history.${whyKey}`, {
          stocks: result.stockSharePct,
          plan: isolate(percent(result.planRealReturn)),
          replayed: isolate(percent(result.replayedRealReturn)),
          volatility: isolate(formatNumber(Math.round(volatilityPct * 10) / 10)),
        })}
      </p>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">{t("projections.history.chartTitle")}</h3>
      <ChartFrame
        takeaway={backtestTakeaway}
        table={<BacktestTable windows={result.windows} caption={t("projections.history.chartTitle")} />}
      >
        <BacktestChart
          name={t("projections.history.chartTitle")}
          description={backtestTakeaway}
          windows={result.windows}
          worstStartYear={worstWindow.startYear}
          currentAge={result.currentAge}
          drawdownStartAge={result.drawdownStartAge}
          currencySymbol={currencySymbol}
        />
      </ChartFrame>
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
              age: horizonAge,
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
              percent: formatFixed(result.taxShare * 100, 1),
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
