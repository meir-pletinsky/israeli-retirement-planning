import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import {
  MONTE_CARLO_CONFIDENCE,
  type MonteCarloResult,
  successBand,
  successPercent,
} from "../domain";
import { formatFixed, formatNumber } from "../i18n/formatters";
import { ChartFrame } from "./charts/ChartFrame";
import { FanTable } from "./charts/ChartTables";
import { useChartTakeaways } from "./charts/chartTakeaways";
import { MonteCarloFanChart } from "./charts/MonteCarloFanChart";
import { formatSuccessPercent } from "./riskFormat";
import { ScenarioTitle } from "./ScenarioTag";

interface RiskAnalysisCardProps {
  /** Null when there is nothing to test (see `hasTarget`) or no drawing years before the horizon. */
  result: MonteCarloResult | null;
  /** Whether the user has entered desired retirement spending. */
  hasTarget: boolean;
  /** True while the first result is still being simulated; the card then shows a placeholder. */
  calculating?: boolean;
  /** True while the figures below still belong to the previous scenario. */
  updating?: boolean;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
}

const BAND_CLASSES = {
  strong: "text-emerald-600",
  fair: "text-slate-900",
  weak: "text-amber-600",
} as const;

export function RiskAnalysisCard({
  result,
  hasTarget,
  calculating = false,
  updating = false,
  scenarioTag,
}: RiskAnalysisCardProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const horizonAge = profile.assumptions.planningHorizonAge;
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${formatNumber(amount)}`;

  return (
    <section
      aria-labelledby="risk-title"
      aria-busy={updating || calculating}
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-opacity ${
        updating ? "opacity-50" : ""
      }`}
    >
      <ScenarioTitle id="risk-title" tag={scenarioTag}>
        {t("projections.risk.title")}
      </ScenarioTitle>

      {!hasTarget && (
        <p className="mt-2 text-sm text-slate-600">
          {t("projections.risk.noTarget")}{" "}
          <Link to="/my-data/expenses" className="font-medium text-brand-700 hover:underline">
            {t("projections.risk.noTargetCta")}
          </Link>
        </p>
      )}

      {hasTarget && calculating && (
        <div role="status" className="mt-2 flex flex-col gap-3">
          <p className="text-sm text-slate-600">{t("projections.risk.calculating")}</p>
          <div aria-hidden className="grid gap-4 sm:grid-cols-2">
            <div className="h-16 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />
            <div className="h-16 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />
          </div>
          <div aria-hidden className="h-40 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />
        </div>
      )}

      {hasTarget && !calculating && !result && (
        <p className="mt-2 text-sm text-slate-600">
          {t("projections.risk.noYears", { age: horizonAge })}
        </p>
      )}

      {result && (
        <RiskResults result={result} money={money} currencySymbol={currencySymbol} horizonAge={horizonAge} />
      )}
    </section>
  );
}

function RiskResults({
  result,
  money,
  currencySymbol,
  horizonAge,
}: {
  result: MonteCarloResult;
  money: (amount: number) => string;
  currencySymbol: string;
  horizonAge: number;
}) {
  const { t } = useTranslation();
  const band = successBand(result.successProbability);
  const { profile } = useProfile();
  const confidentPercent = Math.round(MONTE_CARLO_CONFIDENCE * 100);
  const fanTakeaway = useChartTakeaways().fan(result.fan);

  return (
    <>
      <p className="mt-1 text-xs text-slate-500">
        {t("projections.risk.intro", { paths: formatNumber(result.paths) })}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {t("projections.risk.successLabel", { age: horizonAge })}
          </p>
          <p className={clsx("mt-1 text-3xl font-semibold tabular-nums", BAND_CLASSES[band])}>
            <span dir="ltr">{formatSuccessPercent(result.successProbability)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">{t(`projections.risk.band.${band}`)}</p>
          {successPercent(result.successProbability) === 100 && (
            <p className="mt-1 text-xs text-slate-600">
              {t("projections.risk.allPaths", { paths: formatNumber(result.paths) })}
            </p>
          )}
        </div>

        {result.confidentNetMonthly !== null && (
          <div>
            <p className="text-sm font-medium text-slate-500">
              {t("projections.risk.confidentLabel", { percent: confidentPercent })}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
              <span dir="ltr">{money(result.confidentNetMonthly)}</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {t("projections.risk.confidentHint", { target: money(result.targetNetMonthly) })}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-600">
        {t("projections.risk.qualifier")}{" "}
        {t("projections.risk.assumptions", {
          returnPct: formatNumber(profile.assumptions.investmentReturnPct),
          inflationPct: formatNumber(profile.assumptions.inflationPct),
          volatilityPct: formatNumber(Math.round(result.volatilityPct * 10) / 10),
        })}
      </p>

      {result.medianShortfallAge !== null && (
        <p className="mt-3 text-sm text-slate-700">
          {t("projections.risk.shortfallAge", { age: Math.round(result.medianShortfallAge) })}
        </p>
      )}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">
        {t("projections.risk.chartTitle")}
      </h3>
      <ChartFrame
        takeaway={fanTakeaway}
        table={<FanTable fan={result.fan} caption={t("projections.risk.chartTitle")} />}
      >
        <MonteCarloFanChart
          name={t("projections.risk.chartTitle")}
          description={fanTakeaway ?? t("projections.risk.chartTitle")}
          data={result.fan}
          drawdownStartAge={result.drawdownStartAge}
          currencySymbol={currencySymbol}
          bandLabel={t("projections.risk.bandLabel")}
          medianLabel={t("projections.risk.medianLabel")}
        />
      </ChartFrame>

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.risk.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.risk.howRandom", { volatility: formatNumber(Math.round(result.volatilityPct * 10) / 10) })}</li>
          <li>{t("projections.risk.howMedian")}</li>
          <li>{t("projections.risk.howFixed")}</li>
          <li>
            {t("projections.risk.howTax", {
              percent: formatFixed(result.taxShare * 100, 1),
              gross: money(result.targetGrossMonthly),
            })}
          </li>
          <li>{t("projections.risk.howSeed")}</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">{t("projections.risk.notForecast")}</p>
        <Link
          to="/my-data/assumptions"
          className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline"
        >
          {t("projections.risk.changeVolatility")}
        </Link>
      </details>
    </>
  );
}
