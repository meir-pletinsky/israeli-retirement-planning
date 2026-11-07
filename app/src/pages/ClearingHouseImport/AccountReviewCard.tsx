import { useTranslation } from "react-i18next";

import {
  defaultSelectedFields,
  nearestProjection,
  readField,
  type AccountFieldKey,
  type ImportedAccountCandidate,
} from "../../domain/clearingHouseImport";
import { formatDate } from "../../i18n/formatters";
import type { PensionAccount } from "../../types";
import { FieldRow } from "./FieldRow";
import { formatAccountValue, formatMoney, productKindLabel } from "./formatFieldValue";
import {
  accountValueRows,
  candidateBalance,
  initialAccountState,
  selectableKeys,
  type AccountReviewState,
} from "./reviewState";
import { WarningList } from "./WarningList";

interface AccountReviewCardProps {
  candidate: ImportedAccountCandidate;
  /** The existing account this one was matched to, if any; it is the target of "update". */
  matched: PensionAccount | null;
  state: AccountReviewState;
  retirementAge: number;
  currency: string;
  /** Every value is listed; otherwise only the ones worth a look. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** List only the values that will be imported. */
  onlySelected: boolean;
  onChange: (state: AccountReviewState) => void;
}

const LINK_BUTTON =
  "rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600";

export function AccountReviewCard({
  candidate,
  matched,
  state,
  retirementAge,
  currency,
  expanded,
  onToggleExpanded,
  onlySelected,
  onChange,
}: AccountReviewCardProps) {
  const { t } = useTranslation();
  const existing = state.updateAccountId ? matched : null;
  const providerName = candidate.fields.providerName?.value;
  const category = candidate.fields.productCategory
    ? t(`myData.steps.pensionSavings.options.productCategory.${candidate.fields.productCategory.value}`)
    : productKindLabel(candidate.productTypeCode, t);
  const title = providerName || category;
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

  const rows = accountValueRows(candidate, existing);
  const selectable = selectableKeys(rows);
  const isSelected = (key: AccountFieldKey, diff: string) =>
    state.include && diff !== "same" && state.selected.includes(key);
  const selectedCount = rows.filter((row) => isSelected(row.key, row.diff)).length;
  const attentionCount = rows.filter((row) => row.attention).length;
  const visibleRows = onlySelected
    ? rows.filter((row) => isSelected(row.key, row.diff))
    : expanded
      ? rows
      : rows.filter((row) => row.attention);
  const canExpand = !onlySelected && rows.length > attentionCount;
  const balance = candidateBalance(candidate);
  const detailsId = `${candidate.key}-details`;
  const detailsLabel = t(
    expanded ? "clearingHouse.review.account.hideDetails" : "clearingHouse.review.account.showDetails",
  );
  const selectAllLabel = t("clearingHouse.review.account.selectAllValues");
  const clearLabel = t("clearingHouse.review.account.clearValues");

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
          className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${candidate.key}-include`} className="block cursor-pointer">
            <span className="block break-words text-sm font-semibold text-slate-900">{title}</span>
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
              {t("clearingHouse.review.balanceDate", { date: formatDate(candidate.valuationDate) })}
            </p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            {balance !== null && (
              <span className="font-semibold text-slate-800">
                {t("clearingHouse.review.account.balance", { amount: formatMoney(balance, currency) })}
              </span>
            )}
            <span>
              {state.include
                ? t("clearingHouse.review.account.valuesSelected", {
                    selected: selectedCount,
                    total: selectable.length,
                  })
                : t("clearingHouse.review.account.notImported")}
            </span>
            {attentionCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                {t("clearingHouse.review.account.toCheck", { count: attentionCount })}
              </span>
            )}
          </p>
        </div>
      </div>

      {matched && (
        <fieldset className="mt-3 rounded-md bg-brand-50 p-3">
          <legend className="sr-only">{t("clearingHouse.review.modeLabel")}</legend>
          <p className="text-xs font-medium text-brand-800">{t("clearingHouse.review.matched")}</p>
          <div className="mt-2 flex flex-col gap-1.5 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${candidate.key}-mode`}
                checked={state.updateAccountId !== null}
                onChange={() => setMode(true)}
                className="accent-brand-600"
              />
              {t("clearingHouse.review.modeUpdate")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${candidate.key}-mode`}
                checked={state.updateAccountId === null}
                onChange={() => setMode(false)}
                className="accent-brand-600"
              />
              {t("clearingHouse.review.modeNew")}
            </label>
          </div>
        </fieldset>
      )}

      {(canExpand || (expanded && !onlySelected)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {canExpand && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              aria-label={`${detailsLabel} ${title}`}
              onClick={onToggleExpanded}
              className={LINK_BUTTON}
            >
              {detailsLabel}
            </button>
          )}
          {expanded && !onlySelected && (
            <>
              <button
                type="button"
                aria-label={`${selectAllLabel} ${title}`}
                onClick={() => onChange({ ...state, include: true, selected: selectable })}
                className={LINK_BUTTON}
              >
                {selectAllLabel}
              </button>
              <button
                type="button"
                aria-label={`${clearLabel} ${title}`}
                onClick={() => onChange({ ...state, selected: [] })}
                className={LINK_BUTTON}
              >
                {clearLabel}
              </button>
            </>
          )}
        </div>
      )}

      <div id={detailsId}>
        {visibleRows.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100">
            {visibleRows.map(({ key, imported, diff, attention }) => (
              <FieldRow
                key={key}
                id={`${candidate.key}-${key}`}
                label={t(`myData.steps.pensionSavings.fields.${key}`)}
                value={formatAccountValue(key, imported.value, t, currency)}
                confidence={imported.confidence}
                diff={diff}
                currentValue={formatAccountValue(key, existing ? readField(existing, key) : null, t, currency)}
                checked={state.selected.includes(key)}
                disabled={!state.include}
                highlight={attention}
                onChange={(checked) => toggleField(key, checked)}
              />
            ))}
          </ul>
        )}
      </div>

      {candidate.fields.conversionFactor &&
        !candidate.fields.hasGuaranteedFactor &&
        candidate.fields.productCategory?.value === "managersInsurance" && (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            {t("clearingHouse.review.factorNotGuaranteed")}
          </p>
        )}

      {candidate.warnings.length > 0 && (
        <div className="mt-3">
          <WarningList warnings={candidate.warnings} />
        </div>
      )}

      {expanded && !onlySelected && projection && projectionParts.length > 0 && (
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
