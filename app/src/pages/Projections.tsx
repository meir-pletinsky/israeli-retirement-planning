import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../app/ProfileContext";
import { IncomeBreakdownChart } from "../components/charts/IncomeBreakdownChart";
import { NetIncomeChart } from "../components/charts/NetIncomeChart";
import { NetWorthChart } from "../components/charts/NetWorthChart";
import { FeasibilityCard } from "../components/FeasibilityCard";
import { RetirementTimeline } from "../components/RetirementTimeline";
import { ScenarioComparison } from "../components/ScenarioComparison";
import {
  MAX_RETIREMENT_SEARCH_AGE,
  type IncomeBandKey,
  buildRetirementTimeline,
  estimateIncomeBreakdown,
  estimateNetIncome,
  findEarliestFeasibleRetirementAge,
  isHouseholdActive,
  projectNetWorth,
  spouseAgeAt,
} from "../domain";
import type { RetirementScenario } from "../types";

const SCENARIOS: RetirementScenario[] = ["early", "standard", "delayed"];

function scenarioLabelKey(scenario: RetirementScenario): string {
  return `projections.scenario${scenario.charAt(0).toUpperCase()}${scenario.slice(1)}`;
}

export function Projections() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [scenario, setScenario] = useState<RetirementScenario>("standard");
  const [view, setView] = useState<"chart" | "table">("chart");
  const currencySymbol = t("common.currencySymbol");

  const netWorthData = projectNetWorth(profile, scenario);
  const incomeData = estimateIncomeBreakdown(profile, scenario);
  const netIncomeYears = estimateNetIncome(profile, scenario).years;
  const hasNetIncome = netIncomeYears.some((year) => year.grossMonthly > 0);
  const timeline = buildRetirementTimeline(incomeData);
  const feasibility = findEarliestFeasibleRetirementAge(profile);
  const isCouple = isHouseholdActive(profile);
  const bandLabels: Record<IncomeBandKey, string> = {
    pensionFund: t("projections.sourcePension"),
    providentFund: t("projections.sourceProvidentFund"),
    managersInsurance: t("projections.sourceManagersInsurance"),
    studyFund: t("projections.sourceStudyFund"),
    investments: t("projections.sourceInvestments"),
    bituachLeumi: t("projections.sourceBituachLeumi"),
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">
        {t("projections.title")}
      </h1>

      <FeasibilityCard feasibility={feasibility} maxSearchAge={MAX_RETIREMENT_SEARCH_AGE} />

      <ScenarioComparison profile={profile} />

      <div>
        <span className="text-sm font-medium text-slate-700">
          {t("projections.scenario")}
        </span>
        <div className="mt-2 inline-flex rounded-full bg-slate-100 p-1">
          {SCENARIOS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScenario(s)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                scenario === s
                  ? "bg-white text-teal-700 shadow"
                  : "text-slate-500",
              )}
            >
              {t(scenarioLabelKey(s))}
            </button>
          ))}
        </div>
      </div>

      {isCouple && (
        <p className="-mt-3 text-xs text-slate-500">{t("projections.householdNote")}</p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            {t("projections.netWorthChart")}
          </h2>
          <button
            type="button"
            onClick={() => setView(view === "chart" ? "table" : "chart")}
            className="text-xs font-medium text-teal-700 hover:underline"
          >
            {view === "chart"
              ? t("projections.viewTable")
              : t("projections.viewChart")}
          </button>
        </div>
        {view === "chart" ? (
          <NetWorthChart data={netWorthData} currencySymbol={currencySymbol} />
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="py-1 text-start text-slate-500">
                    {t("myData.steps.personal.age")}
                  </th>
                  <th className="py-1 text-start text-slate-500">
                    {t("dashboard.kpi.netWorth")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {netWorthData.map((point) => (
                  <tr key={point.age} className="border-t border-slate-100">
                    <td className="py-1">{point.age}</td>
                    <td className="py-1">
                      {currencySymbol}
                      {point.netWorth.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          {t("projections.incomeChart")}
        </h2>
        <IncomeBreakdownChart
          data={incomeData}
          currencySymbol={currencySymbol}
          labels={bandLabels}
        />
      </div>

      {hasNetIncome && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">
            {t("projections.netIncomeChart")}
          </h2>
          <p className="mb-2 mt-1 text-xs text-slate-500">{t("projections.netIncomeNote")}</p>
          <NetIncomeChart
            data={netIncomeYears}
            currencySymbol={currencySymbol}
            netLabel={t("projections.netIncomeKept")}
            taxLabel={t("projections.netIncomeTax")}
          />
        </div>
      )}

      <RetirementTimeline
        segments={timeline}
        labels={bandLabels}
        currencySymbol={currencySymbol}
        spouseAgeAt={isCouple ? (age) => spouseAgeAt(profile, age) : undefined}
      />
    </div>
  );
}
