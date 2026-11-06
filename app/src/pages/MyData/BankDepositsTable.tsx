import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { bankDepositValueIls, engineNowMs, formatDate } from "../../domain";
import type { BankDeposit } from "../../types";
import { RowActions } from "./RowActions";
import { EMPTY_CELL, formatCurrency, formatPercent } from "./summaryFormat";
import { SummaryTable, type SummaryColumn } from "./SummaryTable";

const FIELDS = "myData.steps.bankDeposits";

function sumValueIls(deposits: readonly BankDeposit[], inflationPct: number, nowMs: number): number {
  return deposits.reduce((sum, deposit) => sum + bankDepositValueIls(deposit, inflationPct, nowMs), 0);
}

interface BankDepositsTableProps {
  deposits: readonly BankDeposit[];
  toolbar: ReactNode;
  emptyMessage: ReactNode;
  onEdit: (deposit: BankDeposit) => void;
  onRemove: (deposit: BankDeposit) => void;
}

/** Bank deposits (always NIS), each with its rate type, interest rate and CPI link, and their current estimated value. */
export function BankDepositsTable({ deposits, toolbar, emptyMessage, onEdit, onRemove }: BankDepositsTableProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const currency = t("common.currencySymbol");
  const nowMs = engineNowMs();
  const inflationPct = profile.assumptions.inflationPct;
  const totalValue = sumValueIls(deposits, inflationPct, nowMs);

  const columns: SummaryColumn<BankDeposit>[] = [
    {
      key: "bankName",
      header: t(`${FIELDS}.fields.bankName`),
      cell: (deposit) => deposit.bankName || t(`${FIELDS}.untitledDeposit`),
    },
    {
      key: "amount",
      header: t(`${FIELDS}.fields.amount`),
      numeric: true,
      primary: true,
      cell: (deposit) => formatCurrency(deposit.amount, currency),
    },
    {
      key: "rateType",
      header: t(`${FIELDS}.fields.rateType`),
      cell: (deposit) =>
        deposit.rateType ? t(`${FIELDS}.options.rateType.${deposit.rateType}`) : EMPTY_CELL,
    },
    {
      key: "interestRate",
      header: t(`${FIELDS}.fields.annualInterestRatePercent`),
      numeric: true,
      cell: (deposit) => formatPercent(deposit.annualInterestRatePercent),
    },
    {
      key: "cpiLinked",
      header: t(`${FIELDS}.fields.cpiLinked`),
      cell: (deposit) => t(`${FIELDS}.${deposit.cpiLinked ? "yes" : "no"}`),
    },
    {
      key: "startDate",
      header: t(`${FIELDS}.fields.startDate`),
      numeric: true,
      cell: (deposit) => deposit.startDate ? formatDate(deposit.startDate) : EMPTY_CELL,
    },
    {
      key: "maturityDate",
      header: t(`${FIELDS}.fields.maturityDate`),
      numeric: true,
      cell: (deposit) => deposit.maturityDate ? formatDate(deposit.maturityDate) : EMPTY_CELL,
    },
    {
      key: "currentValue",
      header: t(`${FIELDS}.currentValue`),
      numeric: true,
      primary: true,
      cell: (deposit) =>
        formatCurrency(Math.round(bankDepositValueIls(deposit, inflationPct, nowMs)), currency),
      total: formatCurrency(Math.round(totalValue), currency),
    },
  ];

  return (
    <SummaryTable
      id="bank-deposits-summary"
      title={t(`${FIELDS}.title`)}
      rows={deposits}
      rowKey={(deposit) => deposit.id}
      columns={columns}
      toolbar={toolbar}
      emptyMessage={emptyMessage}
      rowActions={(deposit, describedBy) => (
        <RowActions
          describedBy={describedBy}
          onEdit={() => onEdit(deposit)}
          onRemove={() => onRemove(deposit)}
        />
      )}
    />
  );
}
