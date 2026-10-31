import { useTranslation } from "react-i18next";

import type { PensionAccount } from "../../types";
import { sumBalances } from "./pensionPeople";
import {
  EMPTY_CELL,
  formatCurrency,
  formatPercent,
} from "./summaryFormat";
import { SummaryTable, type SummaryColumn } from "./SummaryTable";

const FIELDS = "myData.steps.pensionSavings";

interface PensionSummaryTableProps {
  /** One person's accounts; the total row adds up exactly these. */
  accounts: readonly PensionAccount[];
}

/** Read-only overview of one person's pension and savings accounts, above the cards that edit them. */
export function PensionSummaryTable({ accounts }: PensionSummaryTableProps) {
  const { t } = useTranslation();
  if (accounts.length === 0) return null;

  const currency = t("common.currencySymbol");

  const categoryLabel = (account: PensionAccount) =>
    account.productCategory ? t(`${FIELDS}.options.productCategory.${account.productCategory}`) : null;

  const columns: SummaryColumn<PensionAccount>[] = [
    {
      key: "provider",
      header: t(`${FIELDS}.fields.providerName`),
      cell: (account) => {
        const references = [
          account.policyNumber && t(`${FIELDS}.policyNumberShort`, { value: account.policyNumber }),
          account.fundId && t(`${FIELDS}.fundIdShort`, { value: account.fundId }),
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <>
            <span className="block font-medium text-slate-900">
              {account.providerName || categoryLabel(account) || t(`${FIELDS}.untitledAccount`)}
            </span>
            {references && <span className="block text-xs text-slate-400">{references}</span>}
          </>
        );
      },
    },
    {
      key: "category",
      header: t(`${FIELDS}.fields.productCategory`),
      cell: (account) => categoryLabel(account) ?? EMPTY_CELL,
    },
    {
      key: "status",
      header: t(`${FIELDS}.fields.accountStatus`),
      cell: (account) =>
        account.accountStatus ? t(`${FIELDS}.options.accountStatus.${account.accountStatus}`) : EMPTY_CELL,
    },
    {
      key: "balance",
      header: t(`${FIELDS}.fields.totalAccumulatedBalance`),
      numeric: true,
      cell: (account) => formatCurrency(account.totalAccumulatedBalance, currency),
      total: formatCurrency(sumBalances(accounts), currency),
    },
    {
      key: "employee",
      header: t(`${FIELDS}.fields.employeeRatePercent`),
      numeric: true,
      cell: (account) => formatPercent(account.contributions.employeeRatePercent),
    },
    {
      key: "employer",
      header: t(`${FIELDS}.fields.employerRatePercent`),
      numeric: true,
      cell: (account) => formatPercent(account.contributions.employerRatePercent),
    },
    {
      key: "severance",
      header: t(`${FIELDS}.fields.severanceRatePercent`),
      numeric: true,
      cell: (account) => formatPercent(account.contributions.severanceRatePercent),
    },
    {
      key: "fee",
      header: t(`${FIELDS}.fields.feeFromAccumulationPercent`),
      numeric: true,
      cell: (account) => formatPercent(account.investmentAndFees.feeFromAccumulationPercent),
    },
    {
      key: "annuity",
      header: t(`${FIELDS}.fields.estimatedMonthlyAnnuity`),
      numeric: true,
      cell: (account) => formatCurrency(account.annuityParameters.estimatedMonthlyAnnuity, currency),
    },
  ];

  return (
    <SummaryTable
      id="pension-summary"
      title={t("myData.summary.pensionTitle")}
      rows={accounts}
      rowKey={(account) => account.id}
      columns={columns}
    />
  );
}
