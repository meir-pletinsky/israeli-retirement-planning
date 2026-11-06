import clsx from "clsx";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../app/ProfileContext";
import { ActiveAssumptions } from "../components/ActiveAssumptions";
import { IncomeBreakdownChart } from "../components/charts/IncomeBreakdownChart";
import { NetIncomeChart } from "../components/charts/NetIncomeChart";
import { NetWorthChart } from "../components/charts/NetWorthChart";
import { CoverOptionsCard } from "../components/CoverOptionsCard";
import { FeasibilityCard } from "../components/FeasibilityCard";
import { HistoricalBacktestCard } from "../components/HistoricalBacktestCard";
import { LiquidityLadderCard } from "../components/LiquidityLadderCard";
import { RetirementTimeline } from "../components/RetirementTimeline";
import { RiskAnalysisCard } from "../components/RiskAnalysisCard";
import { ScenarioComparison } from "../components/ScenarioComparison";
import { ScenarioTag, ScenarioTitle } from "../components/ScenarioTag";
import { SourceCostCard } from "../components/SourceCostCard";
import { StressTestCard } from "../components/StressTestCard";
import { UnvestedSharesCard } from "../components/UnvestedSharesCard";
import { useScenarioLabel } from "../components/useScenarioLabel";
import { WithdrawalStrategyCard } from "../components/WithdrawalStrategyCard";
import {
  MAX_RETIREMENT_SEARCH_AGE,
  MIN_RETIREMENT_AGE,
  type IncomeBandKey,
  buildLeavingEarlyCost,
  buildLiquidityLadder,
  buildRetirementTimeline,
  buildSourceCostTable,
  buildStressTest,
  compareCoverOptions,
  compareWithdrawalStrategies,
  desiredRetirementMonthly,
  estimateIncomeBreakdown,
  estimateNetIncome,
  findEarliestFeasibleRetirementAge,
  isHouseholdActive,
  planForOption,
  projectNetWorth,
  resolveRetirementAge,
  runMonteCarlo,
  savedCoverPlan,
  spouseAgeAt,
} from "../domain";
import type { AccountOwner, CoverOption, RetirementScenario } from "../types";

const SCENARIOS: RetirementScenario[] = ["early", "standard", "delayed"];

export function Projections() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const [scenario, setScenario] = useState<RetirementScenario>("standard");
  const [view, setView] = useState<"chart" | "table">("chart");
  const currencySymbol = t("common.currencySymbol");
  const scenarioLabel = useScenarioLabel(profile);
  const scenarioTag = <ScenarioTag profile={profile} scenario={scenario} />;
  const earlyAtStandard =
    resolveRetirementAge(profile, "early") === resolveRetirementAge(profile, "standard");

  // The simulation is the slowest calculation here, so it only reruns when the plan or scenario
  // changes, and a deferred scenario lets the scenario buttons answer before it finishes.
  const riskScenario = useDeferredValue(scenario);
  const riskAnalysis = useMemo(() => runMonteCarlo(profile, riskScenario), [profile, riskScenario]);
  const riskUpdating = riskScenario !== scenario;
  const desiredMonthly = desiredRetirementMonthly(profile.expenses);
  const hasTarget = desiredMonthly !== null && desiredMonthly > 0;

  const netWorthData = projectNetWorth(profile, scenario);
  const incomeData = estimateIncomeBreakdown(profile, scenario);
  const netIncomeYears = estimateNetIncome(profile, scenario).years;
  const hasNetIncome = netIncomeYears.some((year) => year.grossMonthly > 0);
  const hasBankDeposits = profile.bankDeposits.some((deposit) => (deposit.amount ?? 0) > 0);
  const timeline = buildRetirementTimeline(incomeData);
  const ladder = useMemo(() => buildLiquidityLadder(profile, scenario), [profile, scenario]);
  const leavingEarly = useMemo(() => buildLeavingEarlyCost(profile, scenario), [profile, scenario]);
  const sourceCosts = useMemo(() => buildSourceCostTable(profile, scenario), [profile, scenario]);
  const stress = useMemo(() => buildStressTest(profile, scenario), [profile, scenario]);
  const withdrawalComparison = useMemo(
    () => compareWithdrawalStrategies(profile, scenario),
    [profile, scenario],
  );
  const feasibility = findEarliestFeasibleRetirementAge(profile);
  const coverComparisons = useMemo(() => compareCoverOptions(profile), [profile]);
  const chooseCover = (person: AccountOwner, option: CoverOption) => {
    const next = planForOption(savedCoverPlan(profile, person), option);
    updateProfile(
      person === "spouse"
        ? { spouse: { ...profile.spouse, coverPlan: next } }
        : { personal: { ...profile.personal, coverPlan: next } },
    );
  };
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

      <ActiveAssumptions assumptions={profile.assumptions} />

      <FeasibilityCard feasibility={feasibility} maxSearchAge={MAX_RETIREMENT_SEARCH_AGE} />

      <ScenarioComparison profile={profile} />

      <section
        aria-labelledby="scenario-title"
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 id="scenario-title" className="text-sm font-semibold text-slate-700">
          {t("projections.scenario")}
        </h2>
        <p className="mt-1 text-xs text-slate-500">{t("projections.scenarioScope")}</p>
        <div
          role="group"
          aria-labelledby="scenario-title"
          className="mt-3 flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1"
        >
          {SCENARIOS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scenario === s}
              onClick={() => setScenario(s)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                scenario === s
                  ? "bg-white text-brand-700 shadow"
                  : "text-slate-500",
              )}
            >
              {scenarioLabel(s)}
            </button>
          ))}
        </div>
        {earlyAtStandard && (
          <p className="mt-2 text-xs text-slate-500">
            {t("projections.scenarioEarlyFloor", { age: MIN_RETIREMENT_AGE })}
          </p>
        )}
        {isCouple && <p className="mt-2 text-xs text-slate-500">{t("projections.householdNote")}</p>}
      </section>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <ScenarioTitle tag={scenarioTag}>{t("projections.netWorthChart")}</ScenarioTitle>
          <button
            type="button"
            onClick={() => setView(view === "chart" ? "table" : "chart")}
            className="text-xs font-medium text-brand-700 hover:underline"
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

      <RiskAnalysisCard
        result={riskAnalysis}
        hasTarget={hasTarget}
        updating={riskUpdating}
        scenarioTag={scenarioTag}
      />

      <HistoricalBacktestCard
        profile={profile}
        scenario={scenario}
        hasTarget={hasTarget}
        scenarioTag={scenarioTag}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2">
          <ScenarioTitle tag={scenarioTag}>{t("projections.incomeChart")}</ScenarioTitle>
        </div>
        <IncomeBreakdownChart
          data={incomeData}
          currencySymbol={currencySymbol}
          labels={bandLabels}
        />
      </div>

      {hasNetIncome && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <ScenarioTitle tag={scenarioTag}>{t("projections.netIncomeChart")}</ScenarioTitle>
          <p className="mb-2 mt-1 text-xs text-slate-500">{t("projections.netIncomeNote")}</p>
          <NetIncomeChart
            data={netIncomeYears}
            currencySymbol={currencySymbol}
            netLabel={t("projections.netIncomeKept")}
            taxLabel={t("projections.netIncomeTax")}
          />
        </div>
      )}

      {hasNetIncome && (
        <WithdrawalStrategyCard
          comparison={withdrawalComparison}
          onSelect={(withdrawalStrategy) =>
            updateProfile({ assumptions: { ...profile.assumptions, withdrawalStrategy } })
          }
          scenarioTag={scenarioTag}
        />
      )}

      <LiquidityLadderCard
        ladder={ladder}
        isCouple={isCouple}
        scenarioTag={scenarioTag}
        hasBankDeposits={hasBankDeposits}
      />

      <SourceCostCard
        rows={sourceCosts}
        isCouple={isCouple}
        scenarioTag={scenarioTag}
        hasBankDeposits={hasBankDeposits}
      />

      <UnvestedSharesCard cost={leavingEarly} scenarioTag={scenarioTag} />

      <CoverOptionsCard comparisons={coverComparisons} onSelect={chooseCover} />

      <StressTestCard stress={stress} scenarioTag={scenarioTag} />

      <RetirementTimeline
        segments={timeline}
        labels={bandLabels}
        currencySymbol={currencySymbol}
        spouseAgeAt={isCouple ? (age) => spouseAgeAt(profile, age) : undefined}
        scenarioTag={scenarioTag}
      />
    </div>
  );
}
