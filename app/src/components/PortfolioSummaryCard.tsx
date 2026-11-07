import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { formatDate, type PortfolioBreakdown } from "../domain";
import { PORTFOLIO_KIND_COLORS } from "./charts/portfolioColors";
import { PORTFOLIO_INPUT_TARGET } from "./portfolioInputTargets";

/** The anchor the Net Worth Today figure on the Dashboard links to. */
const PORTFOLIO_SUMMARY_ID = "portfolio-summary";

/**
 * What you have: Net Worth Today, drawn as one bar split by kind of asset, and the same split as
 * rows that add up to the figure (the rows are the bar's legend). Employer shares that have not
 * vested are listed apart as left out, with the exchange rate that turned dollar share prices
 * into shekels.
 */
export function PortfolioSummaryCard({ portfolio }: { portfolio: PortfolioBreakdown }) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;

  if (portfolio.rows.length === 0) return null;

  const { fx } = portfolio;
  const shareOf = (amount: number) => (portfolio.total > 0 ? (amount / portfolio.total) * 100 : 0);
  const percentText = (share: number) => (share < 1 ? "<1%" : `${Math.round(share)}%`);
  const employer = portfolio.rows.find((row) => row.key === "employerShares");
  const employerPercent = employer ? percentText(shareOf(employer.amount)) : null;
  return (
    <section
      id={PORTFOLIO_SUMMARY_ID}
      aria-labelledby="portfolio-summary-title"
      className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="portfolio-summary-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.portfolio.title")}
      </h2>

      <div className="mt-2">
        <p className="text-xs font-medium text-slate-500">{t("dashboard.kpi.netWorth")}</p>
        <p className="text-2xl font-semibold tabular-nums text-slate-900">
          <span dir="ltr">{money(portfolio.total)}</span>
        </p>
        <p className="text-xs text-slate-500">{t("dashboard.kpi.netWorthNote")}</p>
      </div>

      <div
        aria-hidden="true"
        className="mt-3 flex h-4 overflow-hidden rounded-sm ring-1 ring-slate-200"
      >
        {portfolio.rows.map((row) => (
          <span
            key={row.key}
            className="block h-full"
            style={{ flexGrow: row.amount, flexBasis: 0, backgroundColor: PORTFOLIO_KIND_COLORS[row.key] }}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t("dashboard.portfolio.intro")}</p>

      <table className="mt-2 w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">{t("dashboard.portfolio.kind")}</th>
            <th scope="col">{t("dashboard.portfolio.amount")}</th>
            <th scope="col">{t("dashboard.portfolio.share")}</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.rows.map((row) => (
            <tr key={row.key} className="border-t border-slate-100">
              <th scope="row" className="py-2 pe-3 text-start font-normal text-slate-700">
                <span
                  aria-hidden="true"
                  className="me-2 inline-block h-2.5 w-2.5 rounded-sm align-baseline"
                  style={{ backgroundColor: PORTFOLIO_KIND_COLORS[row.key] }}
                />
                <Link
                  to={PORTFOLIO_INPUT_TARGET[row.key]}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {t(`dashboard.portfolio.rows.${row.key}`)}
                </Link>
              </th>
              <td className="py-2 text-end tabular-nums text-slate-900">
                <span dir="ltr">{money(row.amount)}</span>
              </td>
              <td className="w-14 py-2 ps-3 text-end text-xs tabular-nums text-slate-500">
                <span dir="ltr">{percentText(shareOf(row.amount))}</span>
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
            <td />
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
