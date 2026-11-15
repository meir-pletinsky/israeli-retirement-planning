import { useTranslation } from "react-i18next";

import type { IncomeBandKey } from "../domain";

/** The names of the income sources, as the Projections charts and the What-if page label them. */
export function useBandLabels(): Record<IncomeBandKey, string> {
  const { t } = useTranslation();
  return {
    pensionFund: t("projections.sourcePension"),
    providentFund: t("projections.sourceProvidentFund"),
    managersInsurance: t("projections.sourceManagersInsurance"),
    studyFund: t("projections.sourceStudyFund"),
    investments: t("projections.sourceInvestments"),
    bituachLeumi: t("projections.sourceBituachLeumi"),
  };
}
