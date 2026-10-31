import { useTranslation } from "react-i18next";

import { monthlyEquivalent, monthsBetweenPayments } from "../../domain";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseItem } from "../../types";
import { EXPENSES, expenseFrequencyLabel, expenseName } from "./expenseLabels";
import { RowActions } from "./RowActions";
import { EMPTY_CELL, formatCurrency } from "./summaryFormat";
import { SummaryTable, type SummaryColumn } from "./SummaryTable";

function perMonthCell(item: ExpenseItem, currency: string): string {
  if (item.amount === null || monthsBetweenPayments(item) === null) return EMPTY_CELL;
  return formatCurrency(Math.round(monthlyEquivalent(item)), currency);
}

interface CategoryTableProps {
  category: ExpenseCategory;
  items: readonly ExpenseItem[];
  onEdit: (item: ExpenseItem) => void;
  onRemove: (item: ExpenseItem) => void;
}

function CategoryTable({ category, items, onEdit, onRemove }: CategoryTableProps) {
  const { t } = useTranslation();
  const currency = t("common.currencySymbol");
  const monthlyTotal = items.reduce((sum, item) => sum + monthlyEquivalent(item), 0);

  const columns: SummaryColumn<ExpenseItem>[] = [
    {
      key: "name",
      header: t(`${EXPENSES}.columns.name`),
      cell: (item) => (
        <>
          <span className="block font-medium text-slate-900">{expenseName(item, t)}</span>
          {item.notes && <span className="block text-xs text-slate-500">{item.notes}</span>}
        </>
      ),
    },
    {
      key: "amount",
      header: t(`${EXPENSES}.columns.amount`),
      numeric: true,
      cell: (item) => formatCurrency(item.amount, currency),
    },
    {
      key: "frequency",
      header: t(`${EXPENSES}.columns.frequency`),
      cell: (item) => expenseFrequencyLabel(item, t),
    },
    {
      key: "type",
      header: t(`${EXPENSES}.columns.type`),
      cell: (item) => t(`${EXPENSES}.necessity.${item.necessity}`),
    },
    {
      key: "perMonth",
      header: t(`${EXPENSES}.columns.perMonth`),
      numeric: true,
      cell: (item) => perMonthCell(item, currency),
      total: formatCurrency(Math.round(monthlyTotal), currency),
    },
  ];

  return (
    <SummaryTable
      id={`expense-summary-${category}`}
      title={t(`${EXPENSES}.category.${category}`)}
      rows={items}
      rowKey={(item) => item.id}
      columns={columns}
      rowActions={(item, describedBy) => (
        <RowActions
          describedBy={describedBy}
          onEdit={() => onEdit(item)}
          onRemove={() => onRemove(item)}
        />
      )}
    />
  );
}

interface ExpenseItemsTableProps {
  items: readonly ExpenseItem[];
  onEdit: (item: ExpenseItem) => void;
  onRemove: (item: ExpenseItem) => void;
}

/** The itemised expenses, one table per category, with the buttons to edit and remove each one. */
export function ExpenseItemsTable({ items, onEdit, onRemove }: ExpenseItemsTableProps) {
  return (
    <>
      {EXPENSE_CATEGORIES.map((category) => {
        const inCategory = items.filter((item) => item.category === category);
        if (inCategory.length === 0) return null;
        return (
          <CategoryTable
            key={category}
            category={category}
            items={inCategory}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        );
      })}
    </>
  );
}
