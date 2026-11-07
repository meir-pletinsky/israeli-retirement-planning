import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { CashFlowPlan, IncomeBandKey } from "../domain";
import { downloadCsvFile } from "../storage/profileIO";
import { toCsv } from "../storage/csv";
import { CashFlowTable } from "./charts/CashFlowTable";
import { useCashFlowColumns } from "./charts/cashFlowColumns";
import { ChartFrame } from "./charts/ChartFrame";
import { useChartTakeaways } from "./charts/chartTakeaways";
import { IncomeBreakdownChart } from "./charts/IncomeBreakdownChart";
import { ScenarioTitle } from "./ScenarioTag";

const isolate = (text: string) => `\u2066${text}\u2069`;

interface CashFlowCardProps {
  plan: CashFlowPlan;
  labels: Record<IncomeBandKey, string>;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
}

/**
 * Year by year at the planned spending: where the money comes from (payments, then withdrawals
 * from each kind of savings), the tax, the spending and the part nobody pays, as a chart and as
 * a table, with a CSV of the table. It is the planned-spending counterpart of the sustainable
 * income charts, which keep showing full payments after the savings have run out.
 */
export function CashFlowCard({ plan, labels, scenarioTag }: CashFlowCardProps) {
  const { t } = useTranslation();
  const takeaways = useChartTakeaways();
  const columns = useCashFlowColumns(plan, labels);
  const currencySymbol = t("common.currencySymbol");
  const amount = (value: number) => isolate(`${currencySymbol}${Math.round(value).toLocaleString()}`);
  const takeaway = takeaways.cashFlow(plan);
  const title = t("projections.cashFlow.title");

  const downloadCsv = () => {
    const header = [t("charts.table.age"), t("projections.cashFlow.year"), ...columns.map((column) => column.header)];
    const rows = plan.years.map((year) => [year.age, year.calendarYear, ...columns.map((column) => column.value(year))]);
    downloadCsvFile(toCsv([header, ...rows]), "-cash-flow");
  };

  return (
    <section
      id="cash-flow"
      aria-labelledby="cash-flow-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="cash-flow-title" tag={scenarioTag}>
        {title}
      </ScenarioTitle>
      <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500">
        <p>{t("projections.cashFlow.intro", { amount: amount(plan.monthlySpending) })}</p>
        <p>{t("projections.cashFlow.taxNote")}</p>
        {plan.irregularMonthly > 0 && (
          <p>{t("projections.cashFlow.irregularNote", { amount: amount(plan.irregularMonthly) })}</p>
        )}
        {plan.hasCover && <p>{t("projections.cashFlow.coverNote")}</p>}
      </div>
      <div className="mt-3">
        <ChartFrame
          takeaway={takeaway}
          table={<CashFlowTable years={plan.years} columns={columns} caption={title} />}
        >
          <IncomeBreakdownChart
            name={title}
            description={takeaway ?? title}
            data={plan.years}
            currencySymbol={currencySymbol}
            labels={labels}
            texts={{
              payments: t("projections.split.payments"),
              withdrawals: t("projections.split.withdrawals"),
              total: t("projections.split.total"),
              paymentOf: (source) => t("projections.split.paymentOf", { source }),
              withdrawalOf: (source) => t("projections.split.withdrawalOf", { source }),
            }}
            planned={{ monthly: plan.monthlySpending, label: t("projections.cashFlow.plannedLine") }}
            unfundedLabel={t("projections.cashFlow.unfunded")}
          />
        </ChartFrame>
      </div>
      <button
        type="button"
        onClick={downloadCsv}
        className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {t("projections.cashFlow.downloadCsv")}
      </button>
    </section>
  );
}
