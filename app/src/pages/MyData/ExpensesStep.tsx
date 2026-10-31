import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { ConfirmModal } from "../../components/ConfirmModal";
import { NumberField } from "../../components/fields/NumberField";
import { FormModal } from "../../components/FormModal";
import { expenseTotals } from "../../domain";
import {
  createEmptyExpenseItem,
  type ExpenseItem,
  type ExpensesMode,
} from "../../types";
import { ExpenseItemForm } from "./ExpenseItemForm";
import { ExpenseItemsTable } from "./ExpenseItemsTable";
import { EXPENSES } from "./expenseLabels";
import { ExpenseSuggestionsModal } from "./ExpenseSuggestionsModal";
import { StepFooter } from "./StepFooter";
import { formatCurrency } from "./summaryFormat";

const MODES: readonly ExpensesMode[] = ["totals", "detailed"];

const MODE_LABEL_KEY: Record<ExpensesMode, string> = {
  totals: "modeTotals",
  detailed: "modeDetailed",
};

const MODE_HINT_KEY: Record<ExpensesMode, string> = {
  totals: "modeHintTotals",
  detailed: "modeHintDetailed",
};

export function ExpensesStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { expenses } = profile;
  const currency = t("common.currencySymbol");

  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  function saveItems(items: ExpenseItem[]) {
    updateProfile({ expenses: { ...expenses, items } });
  }

  function handleSave() {
    if (!editingItem) return;
    const exists = expenses.items.some((item) => item.id === editingItem.id);
    saveItems(
      exists
        ? expenses.items.map((item) => (item.id === editingItem.id ? editingItem : item))
        : [...expenses.items, editingItem],
    );
    setEditingItem(null);
  }

  function handleRemove(id: string) {
    saveItems(expenses.items.filter((item) => item.id !== id));
    setRemovingId(null);
  }

  function handleAddSuggested(added: ExpenseItem[]) {
    saveItems([...expenses.items, ...added]);
    setSuggestionsOpen(false);
  }

  const totals = expenseTotals(expenses.items);
  const money = (value: number) => formatCurrency(Math.round(value), currency);

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-lg">
        <span id="expenses-mode-label" className="block text-sm font-medium text-slate-700">
          {t(`${EXPENSES}.modeLabel`)}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="expenses-mode-label"
          className="mt-1 inline-flex rounded-lg border border-slate-300 bg-white p-0.5"
        >
          {MODES.map((mode) => (
            <label
              key={mode}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                expenses.mode === mode
                  ? "bg-brand-600 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <input
                type="radio"
                name="expenses-mode"
                value={mode}
                checked={expenses.mode === mode}
                onChange={() => updateProfile({ expenses: { ...expenses, mode } })}
                className="sr-only"
              />
              {t(`${EXPENSES}.${MODE_LABEL_KEY[mode]}`)}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t(`${EXPENSES}.${MODE_HINT_KEY[expenses.mode]}`)}
        </p>
      </div>

      {expenses.mode === "totals" ? (
        <div className="max-w-lg">
          <NumberField
            label={t(`${EXPENSES}.retirementMonthly`)}
            importance="recommended"
            helperText={t(`${EXPENSES}.retirementMonthlyHelper`)}
            value={expenses.retirementMonthly}
            onChange={(retirementMonthly) =>
              updateProfile({ expenses: { ...expenses, retirementMonthly } })
            }
            suffix={currency}
          />
        </div>
      ) : (
        <>
          <section
            aria-labelledby="expenses-planned-title"
            className="max-w-lg rounded-xl border border-brand-200 bg-brand-50 p-4"
          >
            <h2 id="expenses-planned-title" className="text-sm font-semibold text-brand-900">
              {t(`${EXPENSES}.plannedTitle`)}
            </h2>
            <p className="mt-1 text-2xl font-semibold text-brand-900">
              <span dir="ltr">{money(totals.total)}</span>
            </p>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt>{t(`${EXPENSES}.essentialTotal`)}:</dt>
                <dd className="font-medium" dir="ltr">
                  {money(totals.essential)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt>{t(`${EXPENSES}.discretionaryTotal`)}:</dt>
                <dd className="font-medium" dir="ltr">
                  {money(totals.discretionary)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-600">{t(`${EXPENSES}.plannedHelper`)}</p>
            {expenses.retirementMonthly !== null && (
              <p className="mt-1 text-xs text-slate-600">
                {t(`${EXPENSES}.typedTotalKept`, {
                  amount: formatCurrency(expenses.retirementMonthly, currency),
                })}
              </p>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-700">
              {t(`${EXPENSES}.itemsTitle`)}
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSuggestionsOpen(true)}
                className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
              >
                {t(`${EXPENSES}.addFromSuggestions`)}
              </button>
              <button
                type="button"
                onClick={() => setEditingItem(createEmptyExpenseItem())}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {t(`${EXPENSES}.addItem`)}
              </button>
            </div>
          </div>

          {expenses.items.length === 0 ? (
            <p className="max-w-lg rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              {t(`${EXPENSES}.noItems`)}
            </p>
          ) : (
            <ExpenseItemsTable
              items={expenses.items}
              onEdit={setEditingItem}
              onRemove={(item) => setRemovingId(item.id)}
            />
          )}
        </>
      )}

      <div className="max-w-lg">
        <StepFooter currentKey="expenses" />
      </div>

      <FormModal
        open={editingItem !== null}
        title={t(`${EXPENSES}.form.title`)}
        closeLabel={t("common.close")}
        onClose={() => setEditingItem(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingItem(null)}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        {editingItem && (
          <ExpenseItemForm
            item={editingItem}
            onChange={(patch) =>
              setEditingItem((current) => (current ? { ...current, ...patch } : current))
            }
          />
        )}
      </FormModal>

      {suggestionsOpen && (
        <ExpenseSuggestionsModal
          existingKeys={
            new Set(
              expenses.items.flatMap((item) => (item.catalogKey ? [item.catalogKey] : [])),
            )
          }
          onClose={() => setSuggestionsOpen(false)}
          onAdd={handleAddSuggested}
        />
      )}

      <ConfirmModal
        open={removingId !== null}
        title={t(`${EXPENSES}.removeConfirmTitle`)}
        body={t(`${EXPENSES}.removeConfirmBody`)}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setRemovingId(null)}
        onConfirm={() => removingId && handleRemove(removingId)}
      />
    </div>
  );
}
