import { useTranslation } from "react-i18next";

import { CheckboxField } from "../../components/fields/CheckboxField";
import { DateField } from "../../components/fields/DateField";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import { TextField } from "../../components/fields/TextField";
import { BANK_DEPOSIT_RATE_TYPES, type BankDeposit, type BankDepositRateType } from "../../types";

interface BankDepositFormProps {
  deposit: BankDeposit;
  onChange: (change: Partial<BankDeposit>) => void;
}

/** A bank deposit, always in NIS: who holds it, how much, its term, and its rate (fixed/variable, with or without a CPI link). */
export function BankDepositForm({ deposit, onChange }: BankDepositFormProps) {
  const { t } = useTranslation();
  const f = (key: string) => t(`myData.steps.bankDeposits.fields.${key}`);
  const opt = (value: string) => t(`myData.steps.bankDeposits.options.rateType.${value}`);

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={f("bankName")}
        importance="recommended"
        value={deposit.bankName}
        onChange={(bankName) => onChange({ bankName })}
      />
      <NumberField
        label={f("amount")}
        importance="recommended"
        value={deposit.amount}
        onChange={(amount) => onChange({ amount })}
        suffix={t("common.currencySymbol")}
        min={0}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField
          label={f("startDate")}
          importance="recommended"
          value={deposit.startDate}
          onChange={(startDate) => onChange({ startDate })}
        />
        <DateField
          label={f("maturityDate")}
          importance="reference"
          value={deposit.maturityDate}
          onChange={(maturityDate) => onChange({ maturityDate })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label={f("rateType")}
          importance="recommended"
          value={deposit.rateType}
          onChange={(rateType) => onChange({ rateType: rateType as BankDepositRateType })}
          options={BANK_DEPOSIT_RATE_TYPES.map((value) => ({ value, label: opt(value) }))}
        />
        <NumberField
          label={f("annualInterestRatePercent")}
          importance="recommended"
          value={deposit.annualInterestRatePercent}
          onChange={(annualInterestRatePercent) => onChange({ annualInterestRatePercent })}
          suffix="%"
          min={0}
          step={0.01}
        />
      </div>
      <CheckboxField
        label={f("cpiLinked")}
        checked={deposit.cpiLinked}
        onChange={(cpiLinked) => onChange({ cpiLinked })}
      />
      <p className="-mt-2 text-xs text-slate-500">{t("myData.steps.bankDeposits.cpiLinkedHelper")}</p>
    </div>
  );
}
