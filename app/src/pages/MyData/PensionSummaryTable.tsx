import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ImportedReport, PensionAccount } from "../../types";
import { sumBalances } from "./pensionPeople";
import { accountSourceLabel } from "./reportSource";
import { RowActions } from "./RowActions";
import {
  EMPTY_CELL,
  formatCurrency,
  formatPercent,
} from "./summaryFormat";
import { SummaryTable, type SummaryColumn } from "./SummaryTable";

const FIELDS = "myData.steps.pensionSavings";

interface PensionSummaryTableProps {
  title: string;
  /** One person's accounts; the total row adds up exactly these. */
  accounts: readonly PensionAccount[];
  /** The imported reports, to say which one each account came from. */
  reports: readonly ImportedReport[];
  /** The Add and Import buttons, above the table. */
  toolbar: ReactNode;
  /** Shown instead of the table while the person has no accounts. */
  emptyMessage: ReactNode;
  onEdit: (account: PensionAccount) => void;
  onRemove: (account: PensionAccount) => void;
  /** Notes shown under the table. */
  children?: ReactNode;
}

/** One person's pension and savings accounts, with the buttons to add, import, edit and remove them. */
export function PensionSummaryTable({
  title,
  accounts,
  reports,
  toolbar,
  emptyMessage,
  onEdit,
  onRemove,
  children,
}: PensionSummaryTableProps) {
  const { t } = useTranslation();

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
    {
      key: "source",
      header: t(`${FIELDS}.fields.source`),
      cell: (account) => accountSourceLabel(account, reports, t),
    },
  ];

  return (
    <SummaryTable
      id="pension-summary"
      title={title}
      rows={accounts}
      rowKey={(account) => account.id}
      columns={columns}
      toolbar={toolbar}
      emptyMessage={emptyMessage}
      rowActions={(account, describedBy) => (
        <RowActions
          describedBy={describedBy}
          onEdit={() => onEdit(account)}
          onRemove={() => onRemove(account)}
        />
      )}
    >
      {children}
    </SummaryTable>
  );
}
