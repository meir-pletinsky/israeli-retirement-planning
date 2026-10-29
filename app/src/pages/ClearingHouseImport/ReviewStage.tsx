import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import {
  matchCandidates,
  withAnnuityFields,
  type ImportPlan,
  type ParsedReport,
  type PersonalFieldKey,
  type ReportMapResult,
} from "../../domain/clearingHouseImport";
import type { AccountOwner } from "../../types";
import { AccountReviewCard } from "./AccountReviewCard";
import { FieldRow } from "./FieldRow";
import { formatPersonalValue, productKindLabel } from "./formatFieldValue";
import {
  buildImportPlan,
  countPlan,
  currentPersonalValue,
  defaultSelectedPersonal,
  initialAccountState,
  personalDiff,
  suggestedPersonal,
  targetRetirementAge,
  type AccountReviewState,
} from "./reviewState";
import { WarningList } from "./WarningList";

interface ReviewStageProps {
  parsed: ParsedReport;
  onApply: (plan: ImportPlan) => void;
  onStartOver: () => void;
}

export function ReviewStage({ parsed, onApply, onStartOver }: ReviewStageProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [owner, setOwner] = useState<AccountOwner>("self");
  const canChooseOwner =
    profile.personal.maritalStatus === "married" ||
    profile.pensionSavings.accounts.some((account) => account.owner === "spouse");
  const { result } = parsed;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900">{t("clearingHouse.review.title")}</h2>

      <div className="text-sm text-slate-600">
        <p>
          {t("clearingHouse.review.found", {
            accounts: result.candidates.length,
            skipped: result.skipped.length,
          })}
        </p>
        {parsed.ignoredFiles > 0 && (
          <p>{t("clearingHouse.review.ignored", { count: parsed.ignoredFiles })}</p>
        )}
      </div>

      {result.warnings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-700">{t("clearingHouse.review.warningsTitle")}</h3>
          <WarningList warnings={result.warnings} />
        </section>
      )}

      {canChooseOwner && (
        <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <legend className="px-1 text-sm font-semibold text-slate-700">
            {t("clearingHouse.review.whoseTitle")}
          </legend>
          <p className="text-xs text-slate-500">{t("clearingHouse.review.whoseHelp")}</p>
          <div className="mt-2 flex gap-4 text-sm text-slate-700">
            {(["self", "spouse"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="clearing-house-owner"
                  checked={owner === value}
                  onChange={() => setOwner(value)}
                  className="accent-teal-600"
                />
                {t(value === "self" ? "clearingHouse.review.whoseSelf" : "clearingHouse.review.whoseSpouse")}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <ReviewBody key={owner} owner={owner} result={result} onApply={onApply} onStartOver={onStartOver} />
    </div>
  );
}

interface ReviewBodyProps {
  owner: AccountOwner;
  result: ReportMapResult;
  onApply: (plan: ImportPlan) => void;
  onStartOver: () => void;
}

/** Remounted when the owner changes, so the matches and starting ticks are recomputed. */
function ReviewBody({ owner, result, onApply, onStartOver }: ReviewBodyProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const currency = t("common.currencySymbol");
  const { personal, skipped } = result;
  const accounts = profile.pensionSavings.accounts;
  const retirementAge = targetRetirementAge(profile, owner);

  const [candidates] = useState(() => withAnnuityFields(result.candidates, retirementAge));
  const [matches] = useState(() => matchCandidates(candidates, accounts, owner));
  const [states, setStates] = useState<Record<string, AccountReviewState>>(() =>
    Object.fromEntries(
      candidates.map((candidate) => {
        const matchedId = matches.get(candidate.key);
        const existing = matchedId ? (accounts.find((account) => account.id === matchedId) ?? null) : null;
        return [candidate.key, initialAccountState(candidate, existing)];
      }),
    ),
  );
  const [selectedPersonal, setSelectedPersonal] = useState<PersonalFieldKey[]>(() =>
    defaultSelectedPersonal(personal, profile, owner),
  );

  const plan = buildImportPlan(owner, candidates, states, personal, selectedPersonal);
  const counts = countPlan(plan);
  const personalRows = suggestedPersonal(personal, owner);

  function togglePersonal(key: PersonalFieldKey, checked: boolean) {
    setSelectedPersonal((current) =>
      checked ? [...current.filter((entry) => entry !== key), key] : current.filter((entry) => entry !== key),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {personalRows.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700">
            {t(owner === "self" ? "clearingHouse.review.personalTitleSelf" : "clearingHouse.review.personalTitleSpouse")}
          </h3>
          <p className="text-xs text-slate-500">{t("clearingHouse.review.personalHelp")}</p>
          <ul className="mt-1 divide-y divide-slate-100">
            {personalRows.map(({ key, imported }) => {
              const current = currentPersonalValue(profile, owner, key);
              return (
                <FieldRow
                  key={key}
                  id={`personal-${key}`}
                  label={t(`myData.steps.personal.${key}`)}
                  value={formatPersonalValue(key, imported.value, t, currency)}
                  confidence={imported.confidence}
                  diff={personalDiff(current, imported.value)}
                  currentValue={formatPersonalValue(key, current, t, currency)}
                  checked={selectedPersonal.includes(key)}
                  disabled={false}
                  onChange={(checked) => togglePersonal(key, checked)}
                />
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-700">{t("clearingHouse.review.accountsTitle")}</h3>
        {candidates.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            {t("clearingHouse.review.nothingToImport")}
          </p>
        )}
        {candidates.map((candidate) => {
          const matchedId = matches.get(candidate.key);
          return (
            <AccountReviewCard
              key={candidate.key}
              candidate={candidate}
              matched={matchedId ? (accounts.find((account) => account.id === matchedId) ?? null) : null}
              state={states[candidate.key]}
              retirementAge={retirementAge}
              currency={currency}
              onChange={(state) => setStates((current) => ({ ...current, [candidate.key]: state }))}
            />
          );
        })}
      </section>

      {skipped.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-slate-700">{t("clearingHouse.review.skippedTitle")}</h3>
          <ul className="flex flex-col gap-1 text-xs text-slate-500">
            {skipped.map((record, index) => (
              <li key={`${record.reason}-${index}`}>
                {t(`clearingHouse.review.skippedReason.${record.reason}`, {
                  kind: productKindLabel(record.productTypeCode, t),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2">
        {counts.values === 0 && (
          <p className="text-xs text-slate-500">{t("clearingHouse.review.nothingSelected")}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={counts.values === 0}
            onClick={() => onApply(plan)}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t("clearingHouse.review.apply")}
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("clearingHouse.review.startOver")}
          </button>
        </div>
      </div>
    </div>
  );
}
