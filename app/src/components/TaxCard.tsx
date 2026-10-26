import { useTranslation } from "react-i18next";

import { type NetIncomeEstimate, TAX_RATES } from "../domain";

interface TaxCardProps {
  net: NetIncomeEstimate;
  /** True when the plan covers two people, who are taxed separately. */
  isCouple: boolean;
}

/** ISO date (2026-01-01) to the day-first format used in Israel (01.01.2026). */
const formatEffectiveDate = (iso: string) => iso.split("-").reverse().join(".");

const exemptionPercent = Math.round(
  (TAX_RATES.qualifyingAnnuityFixedExemptionRate +
    TAX_RATES.qualifyingAnnuityConditionalExemptionRate) *
    1000,
) / 10;

export function TaxCard({ net, isCouple }: TaxCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;

  if (net.grossMonthlyIncome <= 0) return null;

  const rows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: t("dashboard.tax.gross"), value: money(net.grossMonthlyIncome) },
    { label: t("dashboard.tax.tax"), value: money(net.taxMonthly) },
    { label: t("dashboard.tax.net"), value: money(net.netMonthlyIncome), emphasis: true },
  ];

  return (
    <section
      aria-labelledby="tax-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="tax-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.tax.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("dashboard.tax.intro")}</p>

      <dl className="mt-3 flex flex-col gap-1">
        {rows.map(({ label, value, emphasis }) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd
              className={
                emphasis
                  ? "text-lg font-semibold tabular-nums text-slate-900"
                  : "text-sm tabular-nums text-slate-800"
              }
            >
              <span dir="ltr">{value}</span>
            </dd>
          </div>
        ))}
      </dl>

      {net.taxMonthly > 0 ? (
        <p className="mt-3 text-sm text-slate-700">
          {t("dashboard.tax.effectiveRate", {
            percent: (net.effectiveTaxRate * 100).toFixed(1),
          })}
        </p>
      ) : (
        <p className="mt-3 text-sm text-slate-700">{t("dashboard.tax.noTax")}</p>
      )}

      {net.lowestNetAge !== null && (
        <p className="mt-1 text-xs text-slate-500">
          {t("dashboard.tax.lowestYear", { age: Math.floor(net.lowestNetAge) })}
        </p>
      )}
      {isCouple && (
        <p className="mt-1 text-xs text-slate-500">{t("dashboard.tax.perSpouse")}</p>
      )}

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-teal-700">
          {t("dashboard.tax.includedTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("dashboard.tax.includedBrackets", { year: TAX_RATES.effectiveDate.slice(0, 4) })}</li>
          <li>
            {t("dashboard.tax.includedExemption", {
              percent: exemptionPercent,
              ceiling: money(TAX_RATES.qualifyingAnnuityMonthlyCeiling),
            })}
          </li>
          <li>
            {t("dashboard.tax.includedCapitalGains", {
              rate: Math.round(TAX_RATES.capitalGainsRate * 100),
            })}
          </li>
          <li>{t("dashboard.tax.includedExempt")}</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">{t("dashboard.tax.notIncluded")}</p>
      </details>

      <p className="mt-3 text-xs text-slate-500">
        {t("dashboard.tax.ratesAsOf", { date: formatEffectiveDate(TAX_RATES.effectiveDate) })}{" "}
        <a
          href={TAX_RATES.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-teal-700 hover:underline"
        >
          {t("dashboard.tax.source")}
        </a>
      </p>
    </section>
  );
}
