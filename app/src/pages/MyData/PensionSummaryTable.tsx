import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { aggregatePensionBalance, isHouseholdActive } from "../../domain";
import type { PensionAccount } from "../../types";
import {
  EMPTY_CELL,
  formatCurrency,
  formatPercent,
} from "./summaryFormat";
import { SummaryTable, type SummaryColumn } from "./SummaryTable";

const FIELDS = "myData.steps.pensionSavings";

/** Read-only overview of every pension and savings account, above the cards that edit them. */
export function PensionSummaryTable() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { accounts } = profile.pensionSavings;
  if (accounts.length === 0) return null;

  const currency = t("common.currencySymbol");
  const householdActive = isHouseholdActive(profile);
  const showOwner =
    profile.personal.maritalStatus === "married" ||
    accounts.some((account) => account.owner === "spouse");
  const notCounted = (account: PensionAccount) => account.owner === "spouse" && !householdActive;
  const anyNotCounted = accounts.some(notCounted);

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
    ...(showOwner
      ? [
          {
            key: "owner",
            header: t(`${FIELDS}.fields.owner`),
            cell: (account: PensionAccount) =>
              notCounted(account) ? (
                <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {t(`${FIELDS}.ownerNotCounted`)}
                </span>
              ) : (
                t(`${FIELDS}.options.owner.${account.owner}`)
              ),
          },
        ]
      : []),
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
      total: formatCurrency(aggregatePensionBalance(profile), currency),
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
    >
      {anyNotCounted && (
        <p className="mt-3 text-xs text-slate-500">{t("myData.summary.pensionNotCountedNote")}</p>
      )}
    </SummaryTable>
  );
}
