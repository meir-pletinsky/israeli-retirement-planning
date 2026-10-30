import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import { BituachLeumiCard } from "../components/BituachLeumiCard";
import { NetWorthChart } from "../components/charts/NetWorthChart";
import { DataGapsCard } from "../components/DataGapsCard";
import { EmptyState } from "../components/EmptyState";
import { FeasibilityCard } from "../components/FeasibilityCard";
import { KpiCard } from "../components/KpiCard";
import { SourceAccessCard } from "../components/SourceAccessCard";
import { StatusBanner } from "../components/StatusBanner";
import { TaxCard } from "../components/TaxCard";
import {
  MAX_RETIREMENT_SEARCH_AGE,
  aggregateCurrentNetWorth,
  calculateFundingGap,
  estimateNetIncome,
  estimateRetirementIncome,
  findDataGaps,
  findEarliestFeasibleRetirementAge,
  projectNetWorth,
  yearsToRetirement,
} from "../domain";

export function Dashboard() {
  const { t } = useTranslation();
  const { onboarded, profile } = useProfile();
  const currencySymbol = t("common.currencySymbol");

  if (!onboarded) {
    return (
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
    );
  }

  const data = projectNetWorth(profile, "standard");
  const netWorthToday = aggregateCurrentNetWorth(profile);
  const { monthlyIncomeTodayMoney, members, access, householdRetirementAge } =
    estimateRetirementIncome(profile, "standard");
  const isCouple = members.length > 1;
  const netIncome = estimateNetIncome(profile, "standard");
  const fundingGap = calculateFundingGap(profile, "standard");
  const isShortfall = fundingGap.status === "shortfall";
  const feasibility = findEarliestFeasibleRetirementAge(profile);
  const hasTarget = feasibility.status !== "noTarget";
  const gaps = findDataGaps(profile);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("dashboard.kpi.monthlyIncome")}
          value={`${currencySymbol}${netIncome.netMonthlyIncome.toLocaleString()}`}
        />
        <KpiCard
          label={t("dashboard.kpi.netWorth")}
          value={`${currencySymbol}${Math.round(netWorthToday).toLocaleString()}`}
        />
        <KpiCard
          label={t("dashboard.kpi.fundingGap")}
          value={hasTarget ? `${currencySymbol}${fundingGap.monthlyGap.toLocaleString()}` : "—"}
          status={hasTarget ? (isShortfall ? "negative" : "positive") : "neutral"}
        />
        <KpiCard
          label={t("dashboard.kpi.yearsToRetirement")}
          value={yearsToRetirement(profile, "standard")}
        />
      </div>

      {hasTarget && (
        <StatusBanner
          status={isShortfall ? "shortfall" : "onTrack"}
          message={
            isShortfall
              ? t("dashboard.statusShortfall")
              : t("dashboard.statusOnTrack")
          }
        />
      )}

      <DataGapsCard gaps={gaps} />

      <FeasibilityCard
        feasibility={feasibility}
        maxSearchAge={MAX_RETIREMENT_SEARCH_AGE}
      />

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
        <NetWorthChart
          data={data}
          retirementAge={householdRetirementAge}
          currencySymbol={currencySymbol}
        />
        {isCouple && (
          <p className="mt-2 text-xs text-slate-500">{t("dashboard.householdChartNote")}</p>
        )}
      </div>
    </div>
  );
}
