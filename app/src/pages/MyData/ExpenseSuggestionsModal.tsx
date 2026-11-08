import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FormModal } from "../../components/FormModal";
import { EXPENSE_SUGGESTIONS, itemFromSuggestion } from "../../domain";
import { EXPENSE_CATEGORIES, type ExpenseItem } from "../../types";
import { EXPENSES, expenseFrequencyLabel } from "./expenseLabels";

interface ExpenseSuggestionsModalProps {
  /** Suggestions already in the user's list, matched by their key. */
  existingKeys: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (items: ExpenseItem[]) => void;
}

/** The built-in suggestions to tick, each with an optional amount; the ticked ones become list items. */
export function ExpenseSuggestionsModal({
  existingKeys,
  onClose,
  onAdd,
}: ExpenseSuggestionsModalProps) {
  const { t } = useTranslation();
  const currency = t("common.currencySymbol");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [amounts, setAmounts] = useState<Readonly<Record<string, number | null>>>({});

  function toggle(key: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setAmount(key: string, text: string) {
    const amount = text === "" ? null : Number(text);
    setAmounts((current) => ({ ...current, [key]: amount }));
    // Typing an amount means the user wants the row.
    if (amount !== null) toggle(key, true);
  }

  function handleAdd() {
    onAdd(
      EXPENSE_SUGGESTIONS.filter((suggestion) => checked.has(suggestion.key)).map((suggestion) =>
        itemFromSuggestion(suggestion, amounts[suggestion.key] ?? null),
      ),
    );
  }

  return (
    <FormModal
      open
      title={t(`${EXPENSES}.suggestions.title`)}
      closeLabel={t("common.close")}
      onClose={onClose}
      note={<p className="text-sm text-slate-600">{t(`${EXPENSES}.suggestions.intro`)}</p>}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost text-slate-700 hover:bg-slate-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={checked.size === 0}
            className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t(`${EXPENSES}.suggestions.add`, { count: checked.size })}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {EXPENSE_CATEGORIES.map((category) => {
          const suggestions = EXPENSE_SUGGESTIONS.filter((s) => s.category === category);
          if (suggestions.length === 0) return null;
          return (
            <fieldset key={category} className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold text-slate-700">
                {t(`${EXPENSES}.category.${category}`)}
              </legend>
              {suggestions.map((suggestion) => {
                const name = t(`${EXPENSES}.catalog.${suggestion.key}`);
                const already = existingKeys.has(suggestion.key);
                return (
                  <div
                    key={suggestion.key}
                    className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${already ? "bg-slate-50" : "hover:bg-slate-50"}`}
                  >
                    <label className="flex min-w-0 flex-1 items-start gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={already || checked.has(suggestion.key)}
                        disabled={already}
                        onChange={(event) => toggle(suggestion.key, event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        {name}
                        <span className="block text-xs text-slate-500">
                          {already
                            ? t(`${EXPENSES}.suggestions.added`)
                            : expenseFrequencyLabel(
                                {
                                  frequency: suggestion.frequency,
                                  everyYears: suggestion.everyYears ?? null,
                                },
                                t,
                              )}
                        </span>
                      </span>
                    </label>
                    {!already && (
                      <div className="field-control flex h-11 w-28 shrink-0 items-center">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          dir="ltr"
                          aria-label={t(`${EXPENSES}.suggestions.amountLabel`, { name })}
                          value={amounts[suggestion.key] ?? ""}
                          onChange={(event) => setAmount(suggestion.key, event.target.value)}
                          className="min-w-0 w-full rounded-lg px-2 py-1 text-slate-900"
                        />
                        <span className="pe-2 text-sm text-slate-400">{currency}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </fieldset>
          );
        })}
      </div>
    </FormModal>
  );
}
