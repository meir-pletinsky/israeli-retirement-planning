import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  DEFAULT_BACKTEST_STOCK_SHARE_PCT,
  resolveVolatility,
  type StressTest,
} from "../domain";
import { formatNumber } from "../i18n/formatters";
import { formatPercent } from "../pages/MyData/summaryFormat";
import type { Assumptions } from "../types";
import { ScenarioTitle } from "./ScenarioTag";

interface RiskBasisCardProps {
  assumptions: Assumptions;
  /** Null when there are no dollar holdings. */
  stress: StressTest | null;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

/**
 * Says what the risk analysis and the historical backtest actually simulate, so nobody reads them
 * as a replay of their own bank deposits, shares and pension tracks. The one thing the tests leave
 * out of the model, the dollar and employer shares, is named with a link to its stress cases.
 */
export function RiskBasisCard({ assumptions, stress, scenarioTag }: RiskBasisCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${formatNumber(Math.round(amount))}`);
  const volatility = Math.round(resolveVolatility(assumptions.volatilityPct) * 1000) / 10;
  const employerValue = stress?.employerValue ?? 0;

  return (
    <section
      aria-labelledby="risk-basis-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="risk-basis-title" tag={scenarioTag}>
        {t("projections.riskBasis.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.riskBasis.intro")}</p>

      <ul className="mt-3 space-y-2 text-sm text-slate-700">
        <li>
          <span className="font-medium text-slate-900">{t("projections.riskBasis.riskLabel")}</span>{" "}
          {t("projections.riskBasis.risk", {
            returnPct: isolate(formatPercent(assumptions.investmentReturnPct)),
            volatility: isolate(formatPercent(volatility)),
          })}{" "}
          <Link to="/my-data/assumptions" className="font-medium text-brand-700 hover:underline">
            {t("assumptionsSummary.change")}
          </Link>
        </li>
        <li>
          <span className="font-medium text-slate-900">{t("projections.riskBasis.backtestLabel")}</span>{" "}
          {t("projections.riskBasis.backtest", {
            stocks: isolate(`${DEFAULT_BACKTEST_STOCK_SHARE_PCT}%`),
            bonds: isolate(`${100 - DEFAULT_BACKTEST_STOCK_SHARE_PCT}%`),
          })}
        </li>
        {stress && (
          <li>
            <span className="font-medium text-slate-900">{t("projections.riskBasis.exposureLabel")}</span>{" "}
            {t("projections.stress.exposureDollar", { amount: money(stress.dollarValue) })}
            {employerValue >= 0.5 && (
              <> {t("projections.stress.exposureEmployer", { amount: money(employerValue) })}</>
            )}{" "}
            {t("projections.riskBasis.exposureNote")}{" "}
            <a href="#stress-test" className="font-medium text-brand-700 hover:underline">
              {t("projections.riskBasis.exposureLink")}
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}
