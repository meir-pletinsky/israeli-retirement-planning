import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  MAX_PLANNING_AGE,
  MONTE_CARLO_CONFIDENCE,
  type MonteCarloResult,
  successBand,
} from "../domain";
import { MonteCarloFanChart } from "./charts/MonteCarloFanChart";
import { formatSuccessPercent } from "./riskFormat";

interface RiskAnalysisCardProps {
  /** Null when there is nothing to test (see `hasTarget`) or no drawing years before the horizon. */
  result: MonteCarloResult | null;
  /** Whether the user has entered desired retirement spending. */
  hasTarget: boolean;
  /** True while the figures below still belong to the previous scenario. */
  updating?: boolean;
}

const BAND_CLASSES = {
  strong: "text-emerald-600",
  fair: "text-slate-900",
  weak: "text-amber-600",
} as const;

export function RiskAnalysisCard({ result, hasTarget, updating = false }: RiskAnalysisCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;

  return (
    <section
      aria-labelledby="risk-title"
      aria-busy={updating}
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-opacity ${
        updating ? "opacity-50" : ""
      }`}
    >
      <h2 id="risk-title" className="text-sm font-semibold text-slate-700">
        {t("projections.risk.title")}
      </h2>

      {!hasTarget && (
        <p className="mt-2 text-sm text-slate-600">
          {t("projections.risk.noTarget")}{" "}
          <Link to="/my-data/expenses" className="font-medium text-brand-700 hover:underline">
            {t("projections.risk.noTargetCta")}
          </Link>
        </p>
      )}

      {hasTarget && !result && (
        <p className="mt-2 text-sm text-slate-600">
          {t("projections.risk.noYears", { age: MAX_PLANNING_AGE })}
        </p>
      )}

      {result && <RiskResults result={result} money={money} currencySymbol={currencySymbol} />}
    </section>
  );
}

function RiskResults({
  result,
  money,
  currencySymbol,
}: {
  result: MonteCarloResult;
  money: (amount: number) => string;
  currencySymbol: string;
}) {
  const { t } = useTranslation();
  const band = successBand(result.successProbability);
  const confidentPercent = Math.round(MONTE_CARLO_CONFIDENCE * 100);

  return (
    <>
      <p className="mt-1 text-xs text-slate-500">
        {t("projections.risk.intro", { paths: result.paths.toLocaleString() })}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {t("projections.risk.successLabel", { age: MAX_PLANNING_AGE })}
          </p>
          <p className={clsx("mt-1 text-3xl font-semibold tabular-nums", BAND_CLASSES[band])}>
            <span dir="ltr">{formatSuccessPercent(result.successProbability)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">{t(`projections.risk.band.${band}`)}</p>
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

      {result.medianShortfallAge !== null && (
        <p className="mt-3 text-sm text-slate-700">
          {t("projections.risk.shortfallAge", { age: Math.round(result.medianShortfallAge) })}
        </p>
      )}

      <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-700">
        {t("projections.risk.chartTitle")}
      </h3>
      <MonteCarloFanChart
        data={result.fan}
        drawdownStartAge={result.drawdownStartAge}
        currencySymbol={currencySymbol}
        bandLabel={t("projections.risk.bandLabel")}
        medianLabel={t("projections.risk.medianLabel")}
      />

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.risk.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.risk.howRandom", { volatility: Math.round(result.volatilityPct * 10) / 10 })}</li>
          <li>{t("projections.risk.howMedian")}</li>
          <li>{t("projections.risk.howFixed")}</li>
          <li>
            {t("projections.risk.howTax", {
              percent: (result.taxShare * 100).toFixed(1),
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
