import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../app/ProfileContext";
import { IncomeBreakdownChart } from "../components/charts/IncomeBreakdownChart";
import { NetWorthChart } from "../components/charts/NetWorthChart";
import { estimateIncomeBreakdown, projectNetWorth } from "../domain";
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">
        {t("projections.title")}
      </h1>

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
          pensionLabel={t("projections.sourcePension")}
          investmentsLabel={t("projections.sourceInvestments")}
        />
      </div>
    </div>
  );
}
