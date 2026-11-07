import type { PortfolioRowKey } from "../domain";

/**
 * Where each row of the Net Worth Today breakdown is entered: the My Data step and, after the `#`,
 * the section or field on it. One table lists every kind of pension and savings account. Private
 * shares start at the ESPP table, which sits directly above the private trades.
 */
export const PORTFOLIO_INPUT_TARGET: Record<PortfolioRowKey, string> = {
  pensionFund: "/my-data/pension-savings#pension-summary",
  providentFund: "/my-data/pension-savings#pension-summary",
  managersInsurance: "/my-data/pension-savings#pension-summary",
  studyFund: "/my-data/pension-savings#pension-summary",
  bankDeposits: "/my-data/equity#bank-deposits-summary",
  privateShares: "/my-data/equity#equity-summary-employerEsppDiscount",
  employerShares: "/my-data/equity#equity-summary-employerGrantedStock",
  cashAndOther: "/my-data/pension-savings#other-assets",
};
