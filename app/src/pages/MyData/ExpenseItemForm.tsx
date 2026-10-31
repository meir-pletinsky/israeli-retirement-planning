import { useTranslation } from "react-i18next";

import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import { TextField } from "../../components/fields/TextField";
import { monthlyEquivalent, monthsBetweenPayments } from "../../domain";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
  type ExpenseCategory,
  type ExpenseFrequency,
  type ExpenseItem,
  type ExpenseNecessity,
} from "../../types";
import { EXPENSES, expenseName } from "./expenseLabels";
import { formatCurrency } from "./summaryFormat";

interface ExpenseItemFormProps {
  item: ExpenseItem;
  onChange: (patch: Partial<ExpenseItem>) => void;
}

export function ExpenseItemForm({ item, onChange }: ExpenseItemFormProps) {
  const { t } = useTranslation();
  const f = (key: string) => t(`${EXPENSES}.form.${key}`);
  const currency = t("common.currencySymbol");

  const showsPerMonth = item.amount !== null && monthsBetweenPayments(item) !== null;

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={f("name")}
        value={item.name}
        placeholder={item.catalogKey ? expenseName(item, t) : undefined}
        onChange={(name) => onChange({ name })}
      />
      <SelectField
        label={f("category")}
        value={item.category}
        options={EXPENSE_CATEGORIES.map((category) => ({
          value: category,
          label: t(`${EXPENSES}.category.${category}`),
        }))}
        onChange={(category) => onChange({ category: category as ExpenseCategory })}
      />
      <NumberField
        label={f("amount")}
        helperText={f("amountHelper")}
        value={item.amount}
        onChange={(amount) => onChange({ amount })}
        suffix={currency}
        min={0}
      />
      <SelectField
        label={f("frequency")}
        value={item.frequency}
        options={EXPENSE_FREQUENCIES.map((frequency) => ({
          value: frequency,
          label: t(`${EXPENSES}.frequency.${frequency}`),
        }))}
        onChange={(frequency) => onChange({ frequency: frequency as ExpenseFrequency })}
      />
      {item.frequency === "everyYears" && (
        <NumberField
          label={f("everyYears")}
          value={item.everyYears}
          onChange={(everyYears) => onChange({ everyYears })}
          min={0.5}
          step={0.5}
        />
      )}
      {showsPerMonth && (
        <p className="text-sm font-medium text-brand-700">
          {t(`${EXPENSES}.form.perMonth`, {
            amount: formatCurrency(Math.round(monthlyEquivalent(item)), currency),
          })}
        </p>
      )}
      <SelectField
        label={f("necessity")}
        value={item.necessity}
        options={[
          { value: "essential", label: f("necessityEssential") },
          { value: "discretionary", label: f("necessityDiscretionary") },
        ]}
        onChange={(necessity) => onChange({ necessity: necessity as ExpenseNecessity })}
      />
      <TextField label={f("notes")} value={item.notes} onChange={(notes) => onChange({ notes })} />
    </div>
  );
}
