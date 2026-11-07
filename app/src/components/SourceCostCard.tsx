import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { SOURCE_COST_NET_STEP, type SourceCostGroup, type SourceCostRow } from "../domain";
import { formatNumber } from "../i18n/formatters";
import { BankDepositsNote } from "./BankDepositsNote";
import { ScenarioTitle } from "./ScenarioTag";
import { useFormatAge } from "./useFormatAge";

interface SourceCostCardProps {
  rows: SourceCostRow[];
  /** Whether the plan covers a spouse, so each line says whose it is. */
  isCouple: boolean;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
  /** Whether bank deposits are entered, so the investments row can say they are part of it. */
  hasBankDeposits?: boolean;
}

const GROUP_LABEL_KEYS: Record<SourceCostGroup, string> = {
  studyFund: "projections.sourceStudyFund",
  investments: "projections.sourceInvestments",
  investmentProvidentFund: "projections.sourceCost.group.investmentProvidentFund",
  section102Shares: "projections.sourceCost.group.section102Shares",
  ordinaryIncomeShares: "projections.sourceCost.group.ordinaryIncomeShares",
  providentFund: "projections.sourceProvidentFund",
  managersInsurance: "projections.sourceManagersInsurance",
  pensionFund: "projections.sourcePension",
};

const GIVE_UP_KEYS: Record<SourceCostGroup, string> = {
  studyFund: "projections.sourceCost.giveUp.studyFund",
  investments: "projections.sourceCost.giveUp.investments",
  investmentProvidentFund: "projections.sourceCost.giveUp.investmentProvidentFund",
  section102Shares: "projections.sourceCost.giveUp.section102Shares",
  ordinaryIncomeShares: "projections.sourceCost.giveUp.ordinaryIncomeShares",
  providentFund: "projections.sourceCost.giveUp.pension",
  managersInsurance: "projections.sourceCost.giveUp.pension",
  pensionFund: "projections.sourceCost.giveUp.pension",
};

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

export function SourceCostCard({ rows, isCouple, scenarioTag, hasBankDeposits }: SourceCostCardProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${formatNumber(Math.round(amount))}`);

  if (rows.length === 0) {
    return null;
  }

  const step = money(SOURCE_COST_NET_STEP);

  const sourceText = (row: SourceCostRow) => {
    const label = t(GROUP_LABEL_KEYS[row.group]);
    return isCouple
      ? t("projections.ladder.itemOf", { item: label, member: t(`projections.ladder.member.${row.member}`) })
      : label;
  };

  return (
    <section
      aria-labelledby="source-cost-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="source-cost-title" tag={scenarioTag}>
        {t("projections.sourceCost.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.sourceCost.intro", { step })}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.sourceCost.sourceColumn")}
              </th>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.sourceCost.taxColumn", { step })}
              </th>
              <th className="py-1 text-start font-medium text-slate-500">
                {t("projections.sourceCost.giveUpColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const hasTax = row.taxPerStep >= 0.5;
              return (
                <tr key={`${row.member}-${row.group}`} className="border-t border-slate-100 align-top">
                  <td className="py-2 pe-3">
                    <span className="block font-medium">{sourceText(row)}</span>
                    <span className="block text-xs text-slate-500">
                      {t("projections.sourceCost.usableFrom", {
                        age: formatAge(row.age),
                        year: isolate(String(row.year)),
                      })}
                    </span>
                  </td>
                  <td className="py-2 pe-3 tabular-nums">
                    <span className="block font-medium">
                      {hasTax
                        ? t("projections.sourceCost.taxAmount", { amount: money(row.taxPerStep) })
                        : t("projections.sourceCost.noTax")}
                    </span>
                    {hasTax && (
                      <span className="block text-xs text-slate-500">
                        {t("projections.sourceCost.drawAmount", { amount: money(row.drawPerStep), step })}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-slate-600">
                    <span className="block">{t(GIVE_UP_KEYS[row.group])}</span>
                    {row.managementFeePercent !== null && (
                      <span className="mt-0.5 block text-slate-500">
                        {t("projections.sourceCost.managementFee", {
                          percent: isolate(`${formatNumber(Number(row.managementFeePercent.toFixed(2)))}%`),
                        })}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasBankDeposits && rows.some((row) => row.group === "investments") && <BankDepositsNote />}

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.sourceCost.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.sourceCost.howMarginal", { step })}</li>
          <li>{t("projections.sourceCost.howSame")}</li>
          <li>{t("projections.sourceCost.howGroups")}</li>
          <li>{t("projections.sourceCost.howFee")}</li>
          <li>{t("projections.sourceCost.howReadOnly")}</li>
        </ul>
      </details>
    </section>
  );
}
