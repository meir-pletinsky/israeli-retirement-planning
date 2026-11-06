import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { formatDate, type PortfolioBreakdown, type PortfolioRowKey } from "../domain";

/** Where each kind of asset is entered, so a row can lead to its detail. */
const INPUT_ROUTE: Record<PortfolioRowKey, string> = {
  pensionFund: "/my-data/pension-savings",
  providentFund: "/my-data/pension-savings",
  managersInsurance: "/my-data/pension-savings",
  studyFund: "/my-data/pension-savings",
  bankDeposits: "/my-data/pension-savings",
  privateShares: "/my-data/equity",
  employerShares: "/my-data/equity",
  cashAndOther: "/my-data/pension-savings",
};

/** The anchor the Net Worth Today figure on the Dashboard links to. */
const PORTFOLIO_SUMMARY_ID = "portfolio-summary";

/**
 * What the Net Worth Today figure is made of, one row per kind of asset, adding up to the figure.
 * Employer shares that have not vested are listed apart as left out, with the exchange rate that
 * turned dollar share prices into shekels.
 */
export function PortfolioSummaryCard({ portfolio }: { portfolio: PortfolioBreakdown }) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;

  if (portfolio.rows.length === 0) return null;

  const { fx } = portfolio;
  const employer = portfolio.rows.find((row) => row.key === "employerShares");
  const employerShare = employer && portfolio.total > 0 ? (employer.amount / portfolio.total) * 100 : null;
  const employerPercent =
    employerShare === null ? null : employerShare < 1 ? "<1%" : `${Math.round(employerShare)}%`;
  return (
    <section
      id={PORTFOLIO_SUMMARY_ID}
      aria-labelledby="portfolio-summary-title"
      className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="portfolio-summary-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.portfolio.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("dashboard.portfolio.intro")}</p>

      <table className="mt-3 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t("dashboard.portfolio.kind")}</th>
            <th scope="col">{t("dashboard.portfolio.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.rows.map((row) => (
            <tr key={row.key} className="border-t border-slate-100">
              <th scope="row" className="py-2 pe-3 text-start font-normal text-slate-700">
                <Link
                  to={INPUT_ROUTE[row.key]}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {t(`dashboard.portfolio.rows.${row.key}`)}
                </Link>
              </th>
              <td className="py-2 text-end tabular-nums text-slate-900">
                <span dir="ltr">{money(row.amount)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-300 font-semibold text-slate-900">
            <th scope="row" className="py-2 pe-3 text-start">
              {t("dashboard.portfolio.total")}
            </th>
            <td className="py-2 text-end tabular-nums">
              <span dir="ltr">{money(portfolio.total)}</span>
            </td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
        {portfolio.includesSpouse && <p>{t("dashboard.portfolio.householdNote")}</p>}
        {employerPercent !== null && (
          <p>
            {t("dashboard.portfolio.employerShare", { percent: `\u2066${employerPercent}\u2069` })}{" "}
            <Link to="/projections" className="font-medium text-brand-700 hover:underline">
              {t("dashboard.portfolio.employerShareLink")}
            </Link>
          </p>
        )}
        {portfolio.unvestedEmployerShares > 0 && (
          <p>
            {t("dashboard.portfolio.unvested", { amount: money(portfolio.unvestedEmployerShares) })}
          </p>
        )}
        {fx && (
          <p>
            {t(`dashboard.portfolio.fx.${fx.source}`, {
              rate: fx.rate,
              date: fx.date ? formatDate(fx.date) : "",
            })}{" "}
            <Link to="/my-data/equity" className="font-medium text-brand-700 hover:underline">
              {t("dashboard.portfolio.fx.change")}
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}
