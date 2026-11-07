import { useTranslation } from "react-i18next";

import {
  INCOME_BAND_KEYS,
  type CashFlowPlan,
  type HistoricalBacktestResult,
  type IncomeBreakdownPoint,
  type MonteCarloFanPoint,
  type NetIncomeYear,
  type NetWorthPoint,
} from "../../domain";
import type { ComparisonChartPoint } from "./ComparisonChart";

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

/** The one-sentence takeaway printed above each chart; each reads the numbers off the same data the chart draws. */
export function useChartTakeaways() {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${Math.round(amount).toLocaleString()}`);
  const age = (value: number) => isolate(String(value));

  return {
    netWorth(points: NetWorthPoint[], shortfallAge: number | null): string | null {
      if (points.length === 0) return null;
      const peak = points.reduce((best, point) => (point.netWorth > best.netWorth ? point : best));
      const last = points[points.length - 1];
      if (shortfallAge != null) {
        return t("charts.takeaway.netWorthShortfall", {
          peak: money(peak.netWorth),
          peakAge: age(peak.age),
          shortfallAge: age(shortfallAge),
        });
      }
      if (peak.age === last.age) {
        return t("charts.takeaway.netWorthRising", { end: money(last.netWorth), endAge: age(last.age) });
      }
      return t("charts.takeaway.netWorth", {
        peak: money(peak.netWorth),
        peakAge: age(peak.age),
        end: money(last.netWorth),
        endAge: age(last.age),
      });
    },

    fan(fan: MonteCarloFanPoint[]): string | null {
      const last = fan[fan.length - 1];
      if (!last) return null;
      return t("charts.takeaway.fan", {
        age: age(last.age),
        low: money(last.p10),
        high: money(last.p90),
        median: money(last.p50),
      });
    },

    backtest(result: HistoricalBacktestResult, horizonAge: number): string {
      return t("charts.takeaway.backtest", {
        total: result.windows.length,
        funded: result.fundedCount,
        age: horizonAge,
      });
    },

    income(points: IncomeBreakdownPoint[]): string | null {
      if (points.length === 0) return null;
      const total = (point: IncomeBreakdownPoint) =>
        INCOME_BAND_KEYS.reduce((sum, band) => sum + point[band], 0);
      const first = points[0];
      const last = points[points.length - 1];
      return t("charts.takeaway.income", {
        first: money(total(first)),
        firstAge: age(first.age),
        last: money(total(last)),
        lastAge: age(last.age),
      });
    },

    cashFlow(plan: CashFlowPlan): string | null {
      const last = plan.years[plan.years.length - 1];
      if (!last) return null;
      const planned = money(plan.monthlySpending);
      if (plan.firstUnfundedAge === null) {
        return t("charts.takeaway.cashFlowFunded", { planned, lastAge: age(last.age) });
      }
      if (plan.firstUnfundedAge === plan.years[0].age) {
        return t("charts.takeaway.cashFlowFromStart", {
          planned,
          age: age(plan.firstUnfundedAge),
          unfunded: money(last.unfunded),
          lastAge: age(last.age),
        });
      }
      return t("charts.takeaway.cashFlowShortfall", {
        planned,
        coveredTo: age(plan.firstUnfundedAge - 1),
        unfunded: money(last.unfunded),
        lastAge: age(last.age),
      });
    },

    netIncome(years: NetIncomeYear[], plannedMonthly?: number): string | null {
      if (years.length === 0) return null;
      const lowest = years.reduce((best, year) => (year.netMonthly < best.netMonthly ? year : best));
      if (plannedMonthly != null && plannedMonthly > 0) {
        return t("charts.takeaway.netIncomePlanned", {
          net: money(lowest.netMonthly),
          age: age(lowest.age),
          planned: money(plannedMonthly),
        });
      }
      return t("charts.takeaway.netIncome", {
        net: money(lowest.netMonthly),
        age: age(lowest.age),
        tax: money(lowest.taxMonthly),
      });
    },

    compare(points: ComparisonChartPoint[]): string | null {
      const sorted = [...points].sort((a, b) => a.age - b.age);
      if (sorted.length === 0) return null;
      const from = sorted[0];
      const to = sorted[sorted.length - 1];
      if (sorted.length === 1) {
        return t("charts.takeaway.compareOne", { age: age(from.age), net: money(from.netMonthly) });
      }
      return t("charts.takeaway.compare", {
        fromAge: age(from.age),
        fromNet: money(from.netMonthly),
        toAge: age(to.age),
        toNet: money(to.netMonthly),
      });
    },
  };
}
