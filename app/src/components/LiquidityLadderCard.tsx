import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  ACCESS_RULES,
  type LadderItem,
  type LiquidityLadder,
} from "../domain";
import { formatDate as formatIsoDate, formatNumber } from "../i18n/formatters";
import { BankDepositsNote } from "./BankDepositsNote";
import { ScenarioTitle } from "./ScenarioTag";
import { useFormatAge } from "./useFormatAge";

interface LiquidityLadderCardProps {
  ladder: LiquidityLadder;
  /** Whether the plan covers a spouse, so each line says whose it is. */
  isCouple: boolean;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
  /** Whether bank deposits are entered, so the investments line can say they are part of it. */
  hasBankDeposits?: boolean;
}

const ITEM_LABEL_KEYS: Record<LadderItem["kind"], string> = {
  pensionFund: "projections.sourcePension",
  providentFund: "projections.sourceProvidentFund",
  managersInsurance: "projections.sourceManagersInsurance",
  studyFund: "projections.sourceStudyFund",
  otherInvestments: "projections.sourceInvestments",
  bituachLeumi: "projections.sourceBituachLeumi",
  annuity: "projections.ladder.annuity",
  spouseSupplement: "projections.ladder.spouseSupplement",
};

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

const formatDate = (iso: string) => isolate(formatIsoDate(iso));

export function LiquidityLadderCard({ ladder, isCouple, scenarioTag, hasBankDeposits }: LiquidityLadderCardProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${formatNumber(amount)}`;

  if (ladder.rungs.length === 0) {
    return null;
  }

  const when = (age: number, year: number) =>
    t("projections.ladder.when", { age: formatAge(age), year: isolate(String(year)) });

  const itemText = (item: LadderItem) => {
    const label = t(ITEM_LABEL_KEYS[item.kind]);
    return isCouple
      ? t("projections.ladder.itemOf", { item: label, member: t(`projections.ladder.member.${item.member}`) })
      : label;
  };
  const amountText = (item: LadderItem) =>
    item.type === "income"
      ? t("projections.ladder.perMonth", { amount: money(item.amount) })
      : money(item.amount);

  return (
    <section
      aria-labelledby="liquidity-ladder-title"
      className="card"
    >
      <ScenarioTitle id="liquidity-ladder-title" tag={scenarioTag}>
        {t("projections.ladder.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.ladder.intro")}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.ladder.whenColumn")}
              </th>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.ladder.opensColumn")}
              </th>
              <th className="py-1 text-start font-medium text-slate-500">
                {t("projections.ladder.usableColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {ladder.rungs.map((rung) => (
              <tr key={rung.month} className="border-t border-slate-100 align-top">
                <td className="py-2 pe-3">
                  {rung.month === 0 ? (
                    <>
                      <span className="block font-medium">{t("projections.ladder.atRetirement")}</span>
                      <span className="block text-xs text-slate-500">{when(rung.age, rung.year)}</span>
                    </>
                  ) : (
                    <span>{when(rung.age, rung.year)}</span>
                  )}
                </td>
                <td className="py-2 pe-3">
                  <ul className="flex flex-col gap-0.5">
                    {rung.items.map((item) => (
                      <li key={`${item.member}-${item.kind}`} className="flex flex-wrap gap-x-2">
                        <span>{itemText(item)}</span>
                        <span className="text-slate-500 tabular-nums">{amountText(item)}</span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-2 font-medium tabular-nums">
                  {rung.usableTotal > 0 ? money(rung.usableTotal) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasBankDeposits &&
        ladder.rungs.some((rung) => rung.items.some((item) => item.kind === "otherInvestments")) && (
          <BankDepositsNote />
        )}

      {ladder.lateVesting && (
        <p role="status" className="mt-3 text-sm text-amber-800">
          {t("projections.ladder.lateVesting", {
            amount: money(ladder.lateVesting.value),
            date: formatDate(ladder.lateVesting.firstVestDate),
          })}
        </p>
      )}

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.ladder.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.ladder.howValues")}</li>
          <li>
            {t("projections.ladder.howRules", {
              age: ACCESS_RULES.earliestAnnuityAge,
              years: ACCESS_RULES.studyFundLiquidityYears,
              count: ACCESS_RULES.studyFundLiquidityYears,
            })}
          </li>
          <li>{t("projections.ladder.howPayments")}</li>
          <li>{t("projections.ladder.howReadOnly")}</li>
        </ul>
      </details>
    </section>
  );
}
