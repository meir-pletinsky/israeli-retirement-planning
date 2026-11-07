import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import { ActiveAssumptions } from "../components/ActiveAssumptions";
import { AssumedRetirementAgeBanner } from "../components/AssumedRetirementAgeBanner";
import { PathEventsList } from "../components/BalancePathNotes";
import { BituachLeumiCard } from "../components/BituachLeumiCard";
import { BudgetCard } from "../components/BudgetCard";
import { ChartFrame } from "../components/charts/ChartFrame";
import { NetWorthTable } from "../components/charts/ChartTables";
import { useChartTakeaways } from "../components/charts/chartTakeaways";
import { NetWorthChart } from "../components/charts/NetWorthChart";
import { netWorthMarkers } from "../components/charts/netWorthMarkers";
import { CoverNoticeCard } from "../components/CoverNoticeCard";
import { DataGapsCard } from "../components/DataGapsCard";
import { EmptyState } from "../components/EmptyState";
import { FeasibilityCard } from "../components/FeasibilityCard";
import { IrregularCostsCard } from "../components/IrregularCostsCard";
import { KpiCard } from "../components/KpiCard";
import { PortfolioSummaryCard } from "../components/PortfolioSummaryCard";
import { RetireAgeChecksCard } from "../components/RetireAgeChecksCard";
import { RetirementSnapshot } from "../components/RetirementSnapshot";
import { formatSuccessPercent } from "../components/riskFormat";
import { ShortfallLevers } from "../components/ShortfallLevers";
import { SourceAccessCard } from "../components/SourceAccessCard";
import { NetWorthBasisNote, PlannedSpendingLine } from "../components/SpendingBasisNotes";
import { StatusBanner } from "../components/StatusBanner";
import { TaxCard } from "../components/TaxCard";
import { useFormatAge } from "../components/useFormatAge";
import { useRetirementFeasibility } from "../components/useRetirementFeasibility";
import {
  MAX_PLANNING_AGE,
  MAX_RETIREMENT_SEARCH_AGE,
  MONTE_CARLO_CONFIDENCE,
  aggregateCurrentNetWorth,
  assumedRetirementAges,
  breakdownPortfolio,
  calculateFundingGap,
  calculateRetirementKpis,
  checkRetirementAges,
  estimateNetIncome,
  estimateRetirementIncome,
  findDataGaps,
  findCoverNotices,
  findShortfallLevers,
  groupPathEvents,
  irregularCosts,
  projectBalancePath,
  projectSpendingFunding,
  retirementWhen,
  runMonteCarlo,
  successBand,
  successPercent,
} from "../domain";

const SUCCESS_STATUS = { strong: "positive", fair: "neutral", weak: "negative" } as const;

/** Keeps an interpolated number in its own bidi run, so it does not reorder inside Hebrew text. */
const isolate = (text: string) => `\u2066${text}\u2069`;

export function Dashboard() {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const { onboarded, profile } = useProfile();
  const currencySymbol = t("common.currencySymbol");
  const takeaways = useChartTakeaways();
  // Only the success rate is shown here, so the search for a dependable spending level is skipped
  // unless the rate is below the dependable bar; then the banner quotes that spending.
  const risk = useMemo(() => {
    const quick = runMonteCarlo(profile, "standard", { findConfidentSpending: false });
    if (!quick || successBand(quick.successProbability) === "strong") return quick;
    return runMonteCarlo(profile, "standard");
  }, [profile]);
  const { feasibility, confidentAge } = useRetirementFeasibility(profile);
  // The saving lever searches the funding-gap model about twenty times, so it is computed once per profile.
  const levers = useMemo(
    () => (onboarded ? findShortfallLevers(profile, feasibility) : null),
    [onboarded, profile, feasibility],
  );
  // The retire-at checks run the funding-gap model several times, so they are computed once per profile.
  const snapshot = useMemo(
    () =>
      onboarded
        ? { kpis: calculateRetirementKpis(profile), ageChecks: checkRetirementAges(profile) }
        : null,
    [onboarded, profile],
  );

  if (!onboarded || !snapshot) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-slate-900">{t("dashboard.title")}</h1>
        <EmptyState
          title={t("dashboard.emptyTitle")}
          body={t("dashboard.emptyBody")}
          action={
            <Link
              to="/my-data/personal"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("dashboard.emptyCta")}
            </Link>
          }
        />
      </div>
    );
  }

  const balancePath = projectBalancePath(profile, "standard");
  const eventGroups = groupPathEvents(balancePath.events);
  const funding = projectSpendingFunding(profile, "standard");
  const netWorthToday = aggregateCurrentNetWorth(profile);
  const { monthlyIncomeTodayMoney, members, access } = estimateRetirementIncome(profile, "standard");
  const isCouple = members.length > 1;
  const netIncome = estimateNetIncome(profile, "standard");
  const fundingGap = calculateFundingGap(profile, "standard");
  const irregular = irregularCosts(profile.expenses);
  const isShortfall = fundingGap.status === "shortfall";
  const hasTarget = feasibility.status !== "noTarget";
  // The funding gap uses the average return every year, so it can look fine while many simulated markets run short.
  const coveragePercent = risk ? successPercent(risk.successProbability) : null;
  const averageOnly =
    hasTarget && !isShortfall && risk !== null && successBand(risk.successProbability) !== "strong";
  const plannedMonthly = fundingGap.estimatedMonthlyIncome - fundingGap.monthlyGap;
  const gapPercent =
    plannedMonthly > 0 ? Math.round((Math.abs(fundingGap.monthlyGap) / plannedMonthly) * 100) : null;
  const confidencePercent = Math.round(MONTE_CARLO_CONFIDENCE * 100);
  const gaps = findDataGaps(profile);
  const coverNotices = findCoverNotices(profile);
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;
  const netWorthTakeaway = takeaways.netWorth(balancePath.points, funding.shortfallAge);
  const timing = retirementWhen(profile, "standard");
  const assumedAges = assumedRetirementAges(profile);
  const ageText = (age: number, assumed: boolean) =>
    assumed ? t("dashboard.kpi.ageAssumed", { age: formatAge(age) }) : formatAge(age);
  const yearsAway = (yearsToGo: number) =>
    yearsToGo === 0
      ? t("dashboard.kpi.retiringNow")
      : t("dashboard.kpi.yearsAway", { count: yearsToGo });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">{t("dashboard.title")}</h1>

      <AssumedRetirementAgeBanner />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label={t("dashboard.kpi.monthlyIncome")}
          value={money(netIncome.netMonthlyIncome)}
          note={
            <div className="flex flex-col gap-1">
              <p>{t("dashboard.kpi.incomeSustained", { age: MAX_PLANNING_AGE })}</p>
              {netIncome.lowestNetAge !== null && (
                <>
                  <p>
                    {t("dashboard.kpi.incomeBasis", { age: Math.floor(netIncome.lowestNetAge) })}
                  </p>
                  <p>
                    {netIncome.taxMonthly > 0
                      ? t("dashboard.kpi.incomeReconciliation", {
                          gross: money(netIncome.grossMonthlyIncome),
                          tax: money(netIncome.taxMonthly),
                        })
                      : t("dashboard.kpi.incomeNoTax", { gross: money(netIncome.grossMonthlyIncome) })}
                  </p>
                </>
              )}
              <PlannedSpendingLine funding={funding} />
            </div>
          }
        />
        <KpiCard
          label={t("dashboard.kpi.netWorth")}
          value={`${currencySymbol}${Math.round(netWorthToday).toLocaleString()}`}
          note={
            <div className="flex flex-col gap-1">
              <p>{t("dashboard.kpi.netWorthNote")}</p>
              <a
                href="#portfolio-summary"
                className="font-medium text-brand-700 hover:underline"
              >
                {t("dashboard.kpi.netWorthBreakdown")}
              </a>
            </div>
          }
        />
        <KpiCard
          label={t(
            !hasTarget
              ? "dashboard.kpi.surplusOrShortfall"
              : isShortfall
                ? "dashboard.kpi.monthlyShortfall"
                : "dashboard.kpi.monthlySurplus",
          )}
          value={
            hasTarget
              ? `${currencySymbol}${Math.abs(fundingGap.monthlyGap).toLocaleString()}`
              : "—"
          }
          status={hasTarget ? (isShortfall ? "negative" : averageOnly ? "neutral" : "positive") : "neutral"}
          note={
            hasTarget ? (
              <div className="flex flex-col gap-1">
                <p>{t(isShortfall ? "dashboard.kpi.shortfallNote" : "dashboard.kpi.surplusNote")}</p>
                {gapPercent !== null && (
                  <p>
                    {t(isShortfall ? "dashboard.kpi.shortfallScale" : "dashboard.kpi.surplusScale", {
                      percent: isolate(String(gapPercent)),
                      planned: isolate(money(plannedMonthly)),
                    })}
                  </p>
                )}
                {averageOnly && coveragePercent !== null && (
                  <p>{t("dashboard.kpi.surplusAverageOnly", { percent: isolate(String(coveragePercent)) })}</p>
                )}
              </div>
            ) : (
              t("dashboard.kpi.noSpendingNote")
            )
          }
        />
        <KpiCard
          label={t("dashboard.kpi.successProbability", { age: MAX_PLANNING_AGE })}
          value={risk ? formatSuccessPercent(risk.successProbability) : "—"}
          status={risk ? SUCCESS_STATUS[successBand(risk.successProbability)] : "neutral"}
          note={
            risk ? (
              <div className="flex flex-col gap-1">
                <p>
                  {t(
                    successPercent(risk.successProbability) === 100
                      ? "dashboard.kpi.successNoteAll"
                      : "dashboard.kpi.successNoteShare",
                    { paths: risk.paths.toLocaleString() },
                  )}
                </p>
                <p>{t("dashboard.kpi.successQualifier")}</p>
                <p>
                  {t("dashboard.kpi.successAssumptions", {
                    returnPct: profile.assumptions.investmentReturnPct,
                    inflationPct: profile.assumptions.inflationPct,
                    volatilityPct: Math.round(risk.volatilityPct * 10) / 10,
                  })}
                </p>
                <Link to="/projections" className="font-medium text-brand-700 hover:underline">
                  {t("dashboard.kpi.successLearnMore")}
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p>
                  {hasTarget
                    ? t("projections.risk.noYears", { age: MAX_PLANNING_AGE })
                    : t("dashboard.kpi.noSpendingNote")}
                </p>
                {!hasTarget && (
                  <Link to="/my-data/expenses" className="font-medium text-brand-700 hover:underline">
                    {t("dashboard.kpi.addExpenses")}
                  </Link>
                )}
              </div>
            )
          }
        />
        <KpiCard
          label={t(
            timing.spouse
              ? "dashboard.kpi.yearsToHouseholdRetirement"
              : "dashboard.kpi.yearsToRetirement",
          )}
          value={timing.householdYears}
          note={
            <div className="flex flex-col gap-1">
              <p>
                {t("dashboard.kpi.retirementSelf", {
                  age: ageText(timing.self.retirementAge, assumedAges.self),
                  away: yearsAway(timing.self.yearsToGo),
                })}
              </p>
              {timing.spouse && (
                <>
                  <p>
                    {t("dashboard.kpi.retirementSpouse", {
                      age: ageText(timing.spouse.retirementAge, assumedAges.spouse),
                      away: yearsAway(timing.spouse.yearsToGo),
                    })}
                  </p>
                  <p>{t("dashboard.kpi.householdTimingNote")}</p>
                </>
              )}
            </div>
          }
        />
      </div>

      <ActiveAssumptions assumptions={profile.assumptions} />

      {hasTarget && (
        <StatusBanner
          status={isShortfall ? "shortfall" : averageOnly ? "caution" : "onTrack"}
          message={
            isShortfall
              ? levers
                ? t("dashboard.statusShortfallLevers")
                : t("dashboard.statusShortfall")
              : averageOnly
                ? t("dashboard.statusOnTrackAverage")
                : t("dashboard.statusOnTrack")
          }
          details={
            averageOnly && risk && coveragePercent !== null
              ? [
                  t("dashboard.statusAverageDetail", { percent: isolate(String(coveragePercent)) }),
                  ...(risk.confidentNetMonthly !== null && risk.confidentNetMonthly < risk.targetNetMonthly
                    ? [
                        t("dashboard.statusConfidentSpending", {
                          percent: isolate(String(confidencePercent)),
                          amount: isolate(money(risk.confidentNetMonthly)),
                          target: isolate(money(risk.targetNetMonthly)),
                        }),
                      ]
                    : []),
                ]
              : undefined
          }
          action={
            averageOnly ? (
              <Link to="/projections" className="text-brand-700 hover:underline">
                {t("dashboard.statusSeeRisk")}
              </Link>
            ) : undefined
          }
        >
          {isShortfall && levers && <ShortfallLevers levers={levers} />}
        </StatusBanner>
      )}

      <PortfolioSummaryCard portfolio={breakdownPortfolio(profile)} />

      <RetirementSnapshot kpis={snapshot.kpis} irregularMonthly={irregular?.monthly} />

      <BudgetCard expenses={profile.expenses} netMonthlyIncome={fundingGap.estimatedMonthlyIncome} />

      <IrregularCostsCard expenses={profile.expenses} />

      <DataGapsCard gaps={gaps} />

      <CoverNoticeCard notices={coverNotices} />

      <FeasibilityCard
        feasibility={feasibility}
        confidentAge={confidentAge}
        maxSearchAge={MAX_RETIREMENT_SEARCH_AGE}
      />

      {snapshot.ageChecks && <RetireAgeChecksCard checks={snapshot.ageChecks} />}

      <SourceAccessCard access={access} />

      <BituachLeumiCard
        members={members}
        monthlyIncomeTodayMoney={monthlyIncomeTodayMoney}
      />

      <TaxCard
        net={netIncome}
        isCouple={isCouple}
        hasEmployerStock={profile.equity.holdings.some(
          (holding) => holding.investmentCategory === "employerGrantedStock",
        )}
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            {t("dashboard.chartTitle")}
          </h2>
          <Link
            to="/my-data/assumptions"
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {t("dashboard.adjustAssumptions")}
          </Link>
        </div>
        <NetWorthBasisNote funding={funding} />
        <ChartFrame
          takeaway={netWorthTakeaway}
          table={<NetWorthTable points={balancePath.points} caption={t("dashboard.chartTitle")} />}
        >
          <NetWorthChart
            name={t("dashboard.chartTitle")}
            description={netWorthTakeaway ?? t("dashboard.chartTitle")}
            data={balancePath.points}
            markers={netWorthMarkers(eventGroups)}
            currencySymbol={currencySymbol}
            shortfallAge={funding.shortfallAge}
            shortfallLabel={t("projections.basis.shortfallMarker")}
          />
        </ChartFrame>
        <PathEventsList groups={eventGroups} funding={funding} />
        {isCouple && (
          <p className="mt-2 text-xs text-slate-500">{t("dashboard.householdChartNote")}</p>
        )}
      </div>
    </div>
  );
}
