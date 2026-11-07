import { useTranslation } from "react-i18next";

import type { SourceKind } from "../../domain";

/** The words every chart shares: axis captions, the tooltip heading for an age, and the names of the kinds of savings. */
export function useChartTexts() {
  const { t } = useTranslation();
  const kindLabels: Record<SourceKind, string> = {
    pensionFund: t("projections.sourcePension"),
    providentFund: t("projections.sourceProvidentFund"),
    managersInsurance: t("projections.sourceManagersInsurance"),
    studyFund: t("projections.sourceStudyFund"),
    otherInvestments: t("projections.sourceInvestments"),
  };
  return {
    ageAxis: t("charts.axis.age"),
    retirementAgeAxis: t("charts.axis.retirementAge"),
    balanceAxis: t("charts.axis.balance"),
    monthlyAxis: t("charts.axis.monthly"),
    netWorth: t("charts.table.netWorth"),
    total: t("projections.path.total"),
    ageHeading: (age: unknown) => t("charts.tooltip.age", { age: String(age) }),
    retireAtHeading: (age: unknown) => t("charts.tooltip.retireAt", { age: String(age) }),
    kindLabels,
  };
}
