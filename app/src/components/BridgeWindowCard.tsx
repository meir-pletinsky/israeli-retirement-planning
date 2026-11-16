import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { BridgeWindow } from "../domain";
import { formatDate, formatNumber } from "../i18n/formatters";
import { ScenarioTitle } from "./ScenarioTag";
import { useFormatAge } from "./useFormatAge";

interface BridgeWindowCardProps {
  bridge: BridgeWindow;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
}

/** The most batches listed per person; the rest are counted. */
const MAX_BATCHES = 3;

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

const wholeAge = (age: number) => Math.floor(age + 1e-9);

/** What the tax-smart bridge does with the years before the pension starts, and what it saves. */
export function BridgeWindowCard({ bridge, scenarioTag }: BridgeWindowCardProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${formatNumber(Math.round(amount))}`);
  const couple = bridge.members.length > 1 || bridge.members.some((member) => member.owner === "spouse");
  const order = t(`projections.withdrawal.strategy.${bridge.comparedWith}.name`);
  const saved = Math.round(bridge.taxSaved);

  return (
    <section aria-labelledby="bridge-window-title" className="card">
      <ScenarioTitle id="bridge-window-title" tag={scenarioTag}>
        {t("projections.bridge.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.bridge.intro")}</p>

      <p role="status" className="mt-3 text-sm font-medium text-slate-800">
        {saved === 0
          ? t("projections.bridge.same", { order })
          : t(saved > 0 ? "projections.bridge.saved" : "projections.bridge.costs", {
              amount: money(Math.abs(saved)),
              order,
            })}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {[
          t("projections.bridge.mode", { mode: t(`whatIf.bridge.mode.${bridge.mode}.name`) }),
          ...(bridge.lumpSumSales ? [t("projections.bridge.lumpSum")] : []),
        ].join(" · ")}
      </p>
      <p className="mt-2 text-xs text-slate-600">
        {t(couple ? "projections.bridge.retirementYearCouple" : "projections.bridge.retirementYear")}
      </p>

      <ul className="mt-3 space-y-3">
        {bridge.members.map((member) => {
          const ages = { from: isolate(`${wholeAge(member.fromAge)}`), to: isolate(`${wholeAge(member.toAge)}`) };
          const years =
            member.endsWith === null || member.endsAtAge === null
              ? t("projections.bridge.years.open", ages)
              : t(`projections.bridge.years.${member.endsWith}`, { ...ages, end: formatAge(member.endsAtAge) });
          const listed = member.batches.slice(0, MAX_BATCHES);
          const hidden = member.batches.length - listed.length;
          return (
            <li key={member.owner} className="rounded-md border border-slate-200 p-3">
              {couple && (
                <h3 className="text-sm font-semibold text-slate-800">{t(`whatIf.sources.owner.${member.owner}`)}</h3>
              )}
              <p className="text-sm text-slate-700">{years}</p>
              <p className="mt-1 text-xs text-slate-600">
                {t("projections.bridge.room", { room: money(member.roomMonthly), sold: money(member.soldMonthly) })}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-600">{t("projections.bridge.firstSold")}</p>
              <ul className="divide-y divide-slate-100">
                {listed.map((batch) => (
                  <li key={`${batch.label}|${batch.grantDate ?? ""}`} className="py-1.5">
                    <span className="block text-sm font-medium text-slate-900">
                      {[
                        batch.label,
                        batch.grantDate
                          ? t("whatIf.sources.bridge.grantOf", { date: isolate(formatDate(batch.grantDate)) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {[
                        batch.ordinaryShare > 0
                          ? t("whatIf.sources.bridge.ordinaryShare", {
                              share: isolate(`${formatNumber(Math.round(batch.ordinaryShare * 100))}%`),
                            })
                          : t("whatIf.sources.bridge.gainsOnly"),
                        t("projections.bridge.sold", {
                          amount: money(batch.total),
                          age: isolate(`${wholeAge(batch.firstAge)}`),
                        }),
                      ].join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <p className="text-xs text-slate-500">{t("projections.bridge.more", { count: hidden })}</p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs">
        <Link to="/projections/what-if" className="font-medium text-brand-700 hover:underline">
          {t("projections.bridge.tryIt")}
        </Link>
      </p>
      <p className="mt-2 text-xs text-slate-500">{t("common.notTaxAdvice")}</p>
    </section>
  );
}
