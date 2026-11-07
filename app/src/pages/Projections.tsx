import clsx from "clsx";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../app/ProfileContext";
import { ActiveAssumptions } from "../components/ActiveAssumptions";
import { AssumedRetirementAgeBanner } from "../components/AssumedRetirementAgeBanner";
import { BalanceTable, PathEventsList } from "../components/BalancePathNotes";
import { BudgetCard } from "../components/BudgetCard";
import { CashFlowCard } from "../components/CashFlowCard";
import { BalancesByKindChart } from "../components/charts/BalancesByKindChart";
import { ChartFrame } from "../components/charts/ChartFrame";
import { IncomeBreakdownTable, NetIncomeTable } from "../components/charts/ChartTables";
import { useChartTakeaways } from "../components/charts/chartTakeaways";
import { IncomeBreakdownChart } from "../components/charts/IncomeBreakdownChart";
import { NetIncomeChart } from "../components/charts/NetIncomeChart";
import { netWorthMarkers } from "../components/charts/netWorthMarkers";
import { CoverOptionsCard } from "../components/CoverOptionsCard";
import { FeasibilityCard } from "../components/FeasibilityCard";
import { HistoricalBacktestCard } from "../components/HistoricalBacktestCard";
import { IncomeSplitNote } from "../components/IncomeSplitNote";
import { IrregularCostsCard } from "../components/IrregularCostsCard";
import { LiquidityLadderCard } from "../components/LiquidityLadderCard";
import { LongevityCard } from "../components/LongevityCard";
import { RetirementTimeline } from "../components/RetirementTimeline";
import { RiskAnalysisCard } from "../components/RiskAnalysisCard";
import { RiskBasisCard } from "../components/RiskBasisCard";
import { ScenarioComparison } from "../components/ScenarioComparison";
import { ScenarioTag, ScenarioTitle } from "../components/ScenarioTag";
import { IncomeBasisNote, NetWorthBasisNote } from "../components/SpendingBasisNotes";
import { SourceCostCard } from "../components/SourceCostCard";
import { StressTestCard } from "../components/StressTestCard";
import { UnvestedSharesCard } from "../components/UnvestedSharesCard";
import { useRetirementFeasibility } from "../components/useRetirementFeasibility";
import { useScenarioLabel } from "../components/useScenarioLabel";
import { WithdrawalStrategyCard } from "../components/WithdrawalStrategyCard";
import {
  MAX_RETIREMENT_SEARCH_AGE,
  MIN_RETIREMENT_AGE,
  type IncomeBandKey,
  type SourceKind,
  buildLeavingEarlyCost,
  buildLiquidityLadder,
  buildLongevityTest,
  buildRetirementTimeline,
  buildSourceCostTable,
  buildStressTest,
  calculateFundingGap,
  compareCoverOptions,
  compareWithdrawalStrategies,
  continuingPaymentsMonthly,
  desiredRetirementMonthly,
  estimateIncomeBreakdown,
  estimateNetIncome,
  groupPathEvents,
  isHouseholdActive,
  planForOption,
  projectBalancePath,
  projectCashFlow,
  projectSpendingFunding,
  resolveRetirementAge,
  runMonteCarlo,
  savedCoverPlan,
  spouseAgeAt,
} from "../domain";
import type { AccountOwner, CoverOption, RetirementScenario } from "../types";

const SCENARIOS: RetirementScenario[] = ["early", "standard", "delayed"];
const TIMELINE_BASES = ["sustainable", "planned"] as const;
type TimelineBasis = (typeof TIMELINE_BASES)[number];

export function Projections() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const [chosenScenario, setScenario] = useState<RetirementScenario>("standard");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [chosenTimelineBasis, setTimelineBasis] = useState<TimelineBasis>("sustainable");
  const currencySymbol = t("common.currencySymbol");
  const takeaways = useChartTakeaways();
  const scenarioLabel = useScenarioLabel(profile);
  const earlyAtStandard =
    resolveRetirementAge(profile, "early") === resolveRetirementAge(profile, "standard");
  // An Early that matches Standard is switched off; a choice made before the ages met is dropped.
  const scenario: RetirementScenario = earlyAtStandard && chosenScenario === "early" ? "standard" : chosenScenario;
  const scenarioTag = <ScenarioTag profile={profile} scenario={scenario} />;

  // The simulation is the slowest calculation here, so it only reruns when the plan or scenario
  // changes, and a deferred scenario lets the scenario buttons answer before it finishes.
  const riskScenario = useDeferredValue(scenario);
  const riskAnalysis = useMemo(() => runMonteCarlo(profile, riskScenario), [profile, riskScenario]);
  const riskUpdating = riskScenario !== scenario;
  const desiredMonthly = desiredRetirementMonthly(profile.expenses);
  const hasTarget = desiredMonthly !== null && desiredMonthly > 0;

  const balancePath = projectBalancePath(profile, scenario);
  const eventGroups = groupPathEvents(balancePath.events);
  const funding = projectSpendingFunding(profile, scenario);
  const incomeData = estimateIncomeBreakdown(profile, scenario);
  const netIncomeYears = estimateNetIncome(profile, scenario).years;
  const hasNetIncome = netIncomeYears.some((year) => year.grossMonthly > 0);
  const hasBankDeposits = profile.bankDeposits.some((deposit) => (deposit.amount ?? 0) > 0);
  const timeline = buildRetirementTimeline(incomeData);
  const cashFlow = useMemo(() => projectCashFlow(profile, scenario), [profile, scenario]);
  // Without planned spending there is no planned timeline to switch to.
  const timelineBasis: TimelineBasis = cashFlow ? chosenTimelineBasis : "sustainable";
  const plannedTimeline = useMemo(() => (cashFlow ? buildRetirementTimeline(cashFlow.years) : []), [cashFlow]);
  const hasInvestmentsBand = incomeData.some((point) => point.investments > 0);
  const ladder = useMemo(() => buildLiquidityLadder(profile, scenario), [profile, scenario]);
  const leavingEarly = useMemo(() => buildLeavingEarlyCost(profile, scenario), [profile, scenario]);
  const sourceCosts = useMemo(() => buildSourceCostTable(profile, scenario), [profile, scenario]);
  const stress = useMemo(() => buildStressTest(profile, scenario), [profile, scenario]);
  const longevity = useMemo(() => buildLongevityTest(profile, scenario), [profile, scenario]);
  const continuingMonthly = continuingPaymentsMonthly(incomeData);
  const withdrawalComparison = useMemo(
    () => compareWithdrawalStrategies(profile, scenario),
    [profile, scenario],
  );
  const { feasibility, confidentAge } = useRetirementFeasibility(profile);
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
  const netWorthTakeaway = takeaways.netWorth(balancePath.points, funding.shortfallAge);
  const incomeTakeaway = takeaways.income(incomeData);
  const netIncomeTakeaway = takeaways.netIncome(
    netIncomeYears,
    funding.monthlySpending > 0 ? funding.monthlySpending : undefined,
  );
  const bandLabels: Record<IncomeBandKey, string> = {
    pensionFund: t("projections.sourcePension"),
    providentFund: t("projections.sourceProvidentFund"),
    managersInsurance: t("projections.sourceManagersInsurance"),
    studyFund: t("projections.sourceStudyFund"),
    investments: t("projections.sourceInvestments"),
    bituachLeumi: t("projections.sourceBituachLeumi"),
  };
  const kindLabels: Record<SourceKind, string> = {
    pensionFund: bandLabels.pensionFund,
    providentFund: bandLabels.providentFund,
    managersInsurance: bandLabels.managersInsurance,
    studyFund: bandLabels.studyFund,
    otherInvestments: bandLabels.investments,
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">
        {t("projections.title")}
      </h1>

      <AssumedRetirementAgeBanner />

      <ActiveAssumptions assumptions={profile.assumptions} />

      <FeasibilityCard
        feasibility={feasibility}
        confidentAge={confidentAge}
        maxSearchAge={MAX_RETIREMENT_SEARCH_AGE}
      />

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
          {SCENARIOS.map((s) => {
            const duplicate = s === "early" && earlyAtStandard;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={scenario === s}
                disabled={duplicate}
                onClick={() => setScenario(s)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  scenario === s ? "bg-white text-brand-700 shadow" : "text-slate-500",
                  duplicate && "cursor-not-allowed opacity-50",
                )}
              >
                {scenarioLabel(s)}
              </button>
            );
          })}
        </div>
        {earlyAtStandard && (
          <p className="mt-2 text-xs text-slate-500">
            {t("projections.scenarioEarlyFloor", { age: MIN_RETIREMENT_AGE })}
          </p>
        )}
        {isCouple && <p className="mt-2 text-xs text-slate-500">{t("projections.householdNote")}</p>}
      </section>

      <BudgetCard
        expenses={profile.expenses}
        netMonthlyIncome={calculateFundingGap(profile, scenario).estimatedMonthlyIncome}
        scenarioTag={scenarioTag}
      />

      <IrregularCostsCard expenses={profile.expenses} />

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
        <NetWorthBasisNote funding={funding} />
        {netWorthTakeaway && <p className="mb-2 text-sm text-slate-700">{netWorthTakeaway}</p>}
        {view === "chart" ? (
          <>
            <BalancesByKindChart
              name={t("projections.netWorthChart")}
              description={netWorthTakeaway ?? t("projections.netWorthChart")}
              points={balancePath.points}
              kinds={balancePath.kinds}
              kindLabels={kindLabels}
              totalLabel={t("projections.path.total")}
              markers={netWorthMarkers(eventGroups)}
              currencySymbol={currencySymbol}
              shortfallAge={funding.shortfallAge}
              shortfallLabel={t("projections.basis.shortfallMarker")}
            />
            <PathEventsList groups={eventGroups} funding={funding} />
            {cashFlow && funding.shortfallAge !== null && (
              <p className="mt-2 text-xs">
                <a href="#cash-flow" className="font-medium text-brand-700 hover:underline">
                  {t("projections.cashFlow.seeLink")}
                </a>
              </p>
            )}
          </>
        ) : (
          <BalanceTable path={balancePath} />
        )}
      </div>

      {cashFlow && <CashFlowCard plan={cashFlow} labels={bandLabels} scenarioTag={scenarioTag} />}

      {hasTarget && (
        <RiskBasisCard assumptions={profile.assumptions} stress={stress} scenarioTag={scenarioTag} />
      )}

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
          <IncomeBasisNote funding={funding} continuingMonthly={continuingMonthly} />
          <IncomeSplitNote variant="full" showInvestmentsPool={hasInvestmentsBand} />
        </div>
        <ChartFrame
          takeaway={incomeTakeaway}
          table={
            <IncomeBreakdownTable
              points={incomeData}
              labels={bandLabels}
              caption={t("projections.incomeChart")}
            />
          }
        >
          <IncomeBreakdownChart
            name={t("projections.incomeChart")}
            description={incomeTakeaway ?? t("projections.incomeChart")}
            data={incomeData}
            currencySymbol={currencySymbol}
            labels={bandLabels}
            texts={{
              payments: t("projections.split.payments"),
              withdrawals: t("projections.split.withdrawals"),
              total: t("projections.split.total"),
              paymentOf: (source) => t("projections.split.paymentOf", { source }),
              withdrawalOf: (source) => t("projections.split.withdrawalOf", { source }),
            }}
          />
        </ChartFrame>
      </div>

      {hasNetIncome && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <ScenarioTitle tag={scenarioTag}>{t("projections.netIncomeChart")}</ScenarioTitle>
          <p className="mb-2 mt-1 text-xs text-slate-500">
            {t("projections.netIncomeNote")}
            {funding.monthlySpending > 0 && ` ${t("projections.netIncomePlannedNote")}`}
          </p>
          <ChartFrame
            takeaway={netIncomeTakeaway}
            table={<NetIncomeTable years={netIncomeYears} caption={t("projections.netIncomeChart")} />}
          >
            <NetIncomeChart
              name={t("projections.netIncomeChart")}
              description={netIncomeTakeaway ?? t("projections.netIncomeChart")}
              data={netIncomeYears}
              currencySymbol={currencySymbol}
              netLabel={t("projections.netIncomeKept")}
              taxLabel={t("projections.netIncomeTax")}
              plannedMonthly={funding.monthlySpending}
              plannedLabel={t("projections.netIncomePlanned")}
            />
          </ChartFrame>
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

      <LongevityCard longevity={longevity} scenarioTag={scenarioTag} />

      <RetirementTimeline
        segments={timelineBasis === "planned" ? plannedTimeline : timeline}
        labels={bandLabels}
        currencySymbol={currencySymbol}
        spouseAgeAt={isCouple ? (age) => spouseAgeAt(profile, age) : undefined}
        scenarioTag={scenarioTag}
        controls={
          cashFlow && (
            <div
              role="group"
              aria-label={t("projections.timeline.basisGroup")}
              className="mt-3 inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1"
            >
              {TIMELINE_BASES.map((basis) => (
                <button
                  key={basis}
                  type="button"
                  aria-pressed={timelineBasis === basis}
                  onClick={() => setTimelineBasis(basis)}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    timelineBasis === basis ? "bg-white text-brand-700 shadow" : "text-slate-500",
                  )}
                >
                  {t(`projections.timeline.basis.${basis}`)}
                </button>
              ))}
            </div>
          )
        }
        basisNote={
          <>
            {timelineBasis === "planned" && cashFlow ? (
              <p className="mt-1 text-xs text-slate-500">
                {t("projections.timeline.plannedBasis", {
                  amount: `\u2066${currencySymbol}${Math.round(cashFlow.monthlySpending).toLocaleString()}\u2069`,
                })}
              </p>
            ) : (
              <IncomeBasisNote funding={funding} continuingMonthly={continuingMonthly} />
            )}
            <IncomeSplitNote variant="short" />
          </>
        }
      />
    </div>
  );
}
