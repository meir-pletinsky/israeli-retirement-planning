import { useTranslation } from "react-i18next";

import {
  ACCOUNT_FIELD_KEYS,
  defaultSelectedFields,
  diffField,
  readField,
  type AccountFieldKey,
  type ImportedAccountCandidate,
} from "../../domain/clearingHouseImport";
import type { PensionAccount } from "../../types";
import { FieldRow } from "./FieldRow";
import { formatAccountValue, formatMoney, productKindLabel } from "./formatFieldValue";
import { initialAccountState, nearestProjection, type AccountReviewState } from "./reviewState";
import { WarningList } from "./WarningList";

interface AccountReviewCardProps {
  candidate: ImportedAccountCandidate;
  /** The existing account this one was matched to, if any; it is the target of "update". */
  matched: PensionAccount | null;
  state: AccountReviewState;
  retirementAge: number;
  currency: string;
  onChange: (state: AccountReviewState) => void;
}

export function AccountReviewCard({
  candidate,
  matched,
  state,
  retirementAge,
  currency,
  onChange,
}: AccountReviewCardProps) {
  const { t } = useTranslation();
  const existing = state.updateAccountId ? matched : null;
  const providerName = candidate.fields.providerName?.value;
  const category = candidate.fields.productCategory
    ? t(`myData.steps.pensionSavings.options.productCategory.${candidate.fields.productCategory.value}`)
    : productKindLabel(candidate.productTypeCode, t);
  const projection = nearestProjection(candidate.projections, retirementAge);
  const projectionParts: string[] = [];
  if (projection && (projection.monthlyPension ?? 0) > 0) {
    projectionParts.push(
      t("clearingHouse.review.projection.pension", { amount: formatMoney(projection.monthlyPension!, currency) }),
    );
  }
  if (projection && (projection.accumulation ?? 0) > 0) {
    projectionParts.push(
      t("clearingHouse.review.projection.savings", { amount: formatMoney(projection.accumulation!, currency) }),
    );
  }

  function setInclude(include: boolean) {
    if (include && state.selected.length === 0) {
      onChange({ ...state, include, selected: defaultSelectedFields(candidate, existing) });
    } else {
      onChange({ ...state, include });
    }
  }

  function setMode(update: boolean) {
    onChange({ ...initialAccountState(candidate, update ? matched : null), include: state.include });
  }

  function toggleField(key: AccountFieldKey, checked: boolean) {
    const selected = checked
      ? [...state.selected.filter((entry) => entry !== key), key]
      : state.selected.filter((entry) => entry !== key);
    onChange({ ...state, selected });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <input
          id={`${candidate.key}-include`}
          type="checkbox"
          checked={state.include}
          onChange={(e) => setInclude(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-teal-600"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${candidate.key}-include`} className="block cursor-pointer">
            <span className="block break-words text-sm font-semibold text-slate-900">
              {providerName || category}
            </span>
            {providerName && <span className="block text-xs text-slate-500">{category}</span>}
            <span className="sr-only">{t("clearingHouse.review.include")}</span>
          </label>
          {candidate.display.planName && (
            <p className="break-words text-xs text-slate-500">
              {t("clearingHouse.review.plan", { value: candidate.display.planName })}
            </p>
          )}
          {candidate.display.employerName && (
            <p className="break-words text-xs text-slate-500">
              {t("clearingHouse.review.employer", { value: candidate.display.employerName })}
            </p>
          )}
          {candidate.valuationDate && (
            <p className="text-xs text-slate-500">
              {t("clearingHouse.review.balanceDate", { date: candidate.valuationDate })}
            </p>
          )}
        </div>
      </div>

      {matched && (
        <fieldset className="mt-3 rounded-md bg-teal-50 p-3">
          <legend className="sr-only">{t("clearingHouse.review.modeLabel")}</legend>
          <p className="text-xs font-medium text-teal-800">{t("clearingHouse.review.matched")}</p>
          <div className="mt-2 flex flex-col gap-1.5 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${candidate.key}-mode`}
                checked={state.updateAccountId !== null}
                onChange={() => setMode(true)}
                className="accent-teal-600"
              />
              {t("clearingHouse.review.modeUpdate")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${candidate.key}-mode`}
                checked={state.updateAccountId === null}
                onChange={() => setMode(false)}
                className="accent-teal-600"
              />
              {t("clearingHouse.review.modeNew")}
            </label>
          </div>
        </fieldset>
      )}

      <ul className="mt-2 divide-y divide-slate-100">
        {ACCOUNT_FIELD_KEYS.map((key) => {
          const imported = candidate.fields[key];
          if (!imported) return null;
          return (
            <FieldRow
              key={key}
              id={`${candidate.key}-${key}`}
              label={t(`myData.steps.pensionSavings.fields.${key}`)}
              value={formatAccountValue(key, imported.value, t, currency)}
              confidence={imported.confidence}
              diff={diffField(existing, key, imported.value)}
              currentValue={formatAccountValue(key, existing ? readField(existing, key) : null, t, currency)}
              checked={state.selected.includes(key)}
              disabled={!state.include}
              onChange={(checked) => toggleField(key, checked)}
            />
          );
        })}
      </ul>

      {candidate.warnings.length > 0 && (
        <div className="mt-3">
          <WarningList warnings={candidate.warnings} />
        </div>
      )}

      {projection && projectionParts.length > 0 && (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">
            {t("clearingHouse.review.projection.title", { age: projection.age })}
          </p>
          <p className="mt-0.5">{projectionParts.join(" \u00b7 ")}</p>
          <p className="mt-1 text-slate-500">{t("clearingHouse.review.projection.note")}</p>
        </div>
      )}
    </section>
  );
}
