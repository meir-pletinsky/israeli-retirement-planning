import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import { NetWorthChart } from "../components/charts/NetWorthChart";
import { EmptyState } from "../components/EmptyState";
import { KpiCard } from "../components/KpiCard";
import { StatusBanner } from "../components/StatusBanner";
import { getMockNetWorthProjection, MOCK_KPIS } from "../data/mockData";

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
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            {t("dashboard.emptyCta")}
          </Link>
        }
      />
    );
  }

  const data = getMockNetWorthProjection("standard");
  const isShortfall = MOCK_KPIS.fundingGap < 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("dashboard.kpi.monthlyIncome")}
          value={`${currencySymbol}${MOCK_KPIS.monthlyIncome.toLocaleString()}`}
        />
        <KpiCard
          label={t("dashboard.kpi.netWorth")}
          value={`${currencySymbol}${MOCK_KPIS.netWorth.toLocaleString()}`}
        />
        <KpiCard
          label={t("dashboard.kpi.fundingGap")}
          value={`${currencySymbol}${MOCK_KPIS.fundingGap.toLocaleString()}`}
          status={isShortfall ? "negative" : "positive"}
        />
        <KpiCard
          label={t("dashboard.kpi.yearsToRetirement")}
          value={MOCK_KPIS.yearsToRetirement}
        />
      </div>

      <StatusBanner
        status={isShortfall ? "shortfall" : "onTrack"}
        message={
          isShortfall
            ? t("dashboard.statusShortfall")
            : t("dashboard.statusOnTrack")
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            {t("dashboard.chartTitle")}
          </h2>
          <Link
            to="/my-data/assumptions"
            className="text-xs font-medium text-teal-700 hover:underline"
          >
            {t("dashboard.adjustAssumptions")}
          </Link>
        </div>
        <NetWorthChart
          data={data}
          retirementAge={profile.personal.retirementAge ?? 67}
          currencySymbol={currencySymbol}
        />
      </div>
    </div>
  );
}
