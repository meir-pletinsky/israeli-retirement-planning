import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import {
  assessOwner,
  matchCandidates,
  suggestOwner,
  withAnnuityFields,
  type ImportPlan,
  type ParsedReport,
  type PersonalFieldKey,
  type ReportMapResult,
} from "../../domain/clearingHouseImport";
import { hasProfileData, type AccountOwner, type PensionAccount } from "../../types";
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
import { SampleBanner } from "./SampleBanner";
import { WarningList } from "./WarningList";

const NO_ACCOUNTS: PensionAccount[] = [];

interface ReviewStageProps {
  parsed: ParsedReport;
  /** The bundled demonstration report: matched against nothing, and confirmed before it joins real data. */
  sample: boolean;
  onApply: (plan: ImportPlan) => void;
  onStartOver: () => void;
}

export function ReviewStage({ parsed, sample, onApply, onStartOver }: ReviewStageProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { result } = parsed;
  const [owner, setOwner] = useState<AccountOwner>(() => (sample ? "self" : suggestOwner(result, profile)));
  const [suggestedSpouse] = useState(owner === "spouse");
  const [confirmed, setConfirmed] = useState(false);

  const selfConcerns = useMemo(
    () => (sample ? [] : assessOwner(result, profile, "self").concerns),
    [sample, result, profile],
  );
  const assessment = useMemo(
    () => (sample ? null : assessOwner(result, profile, owner)),
    [sample, result, profile, owner],
  );
  const canChooseOwner =
    owner === "spouse" ||
    selfConcerns.length > 0 ||
    profile.personal.maritalStatus === "married" ||
    profile.pensionSavings.accounts.some((account) => account.owner === "spouse");

  const sampleIntoData = sample && hasProfileData(profile);
  const needsConfirmation = sampleIntoData || (assessment?.concerns.length ?? 0) > 0;

  function chooseOwner(next: AccountOwner) {
    setOwner(next);
    if (!sample) setConfirmed(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900">{t("clearingHouse.review.title")}</h2>

      {sample && <SampleBanner />}

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
                  onChange={() => chooseOwner(value)}
                  className="accent-brand-600"
                />
                {t(value === "self" ? "clearingHouse.review.whoseSelf" : "clearingHouse.review.whoseSpouse")}
              </label>
            ))}
          </div>
          {suggestedSpouse && owner === "spouse" && (
            <p className="mt-2 text-xs text-slate-600">{t("clearingHouse.review.ownerSuggestedSpouse")}</p>
          )}
        </fieldset>
      )}

      {owner === "spouse" && profile.personal.maritalStatus !== "married" && (
        <p role="note" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {t("clearingHouse.review.partnerNotCounted")}
        </p>
      )}

      {needsConfirmation && (
        <section
          aria-labelledby="clearing-house-confirm-title"
          className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          {assessment && assessment.concerns.length > 0 ? (
            <>
              <h3 id="clearing-house-confirm-title" className="text-sm font-semibold text-amber-900">
                {t("clearingHouse.review.ownerCheck.title")}
              </h3>
              <p className="text-xs text-amber-900">{t("clearingHouse.review.ownerCheck.intro")}</p>
              <ul className="list-disc ps-5 text-sm text-amber-900">
                {assessment.concerns.map((concern) => (
                  <li key={concern}>
                    {t(`clearingHouse.review.ownerCheck.${concern}`, {
                      context: owner,
                      reportAge: assessment.reportAge,
                      profileAge: assessment.profileAge,
                    })}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p id="clearing-house-confirm-title" className="text-xs text-amber-900">
              {t("clearingHouse.sample.confirmHelp")}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-brand-600"
            />
            {sample ? t("clearingHouse.sample.confirm") : t(`clearingHouse.review.ownerCheck.confirm`, { context: owner })}
          </label>
        </section>
      )}

      <ReviewBody
        key={owner}
        owner={owner}
        result={result}
        sample={sample}
        blocked={needsConfirmation && !confirmed}
        onApply={onApply}
        onStartOver={onStartOver}
      />
    </div>
  );
}

interface ReviewBodyProps {
  owner: AccountOwner;
  result: ReportMapResult;
  sample: boolean;
  /** An unconfirmed warning stands between the user and importing. */
  blocked: boolean;
  onApply: (plan: ImportPlan) => void;
  onStartOver: () => void;
}

/** Remounted when the owner changes, so the matches and starting ticks are recomputed. */
function ReviewBody({ owner, result, sample, blocked, onApply, onStartOver }: ReviewBodyProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const currency = t("common.currencySymbol");
  const { personal, skipped } = result;
  // The sample is made up, so it must never update (or be mistaken for) one of the user's real accounts.
  const accounts = sample ? NO_ACCOUNTS : profile.pensionSavings.accounts;
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
  // Made-up personal details are never pre-ticked into a profile that already holds real ones.
  const [selectedPersonal, setSelectedPersonal] = useState<PersonalFieldKey[]>(() =>
    sample && hasProfileData(profile) ? [] : defaultSelectedPersonal(personal, profile, owner),
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
        {blocked ? (
          <p className="text-xs text-amber-800">{t("clearingHouse.review.confirmFirst")}</p>
        ) : (
          counts.values === 0 && <p className="text-xs text-slate-500">{t("clearingHouse.review.nothingSelected")}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={blocked || counts.values === 0}
            onClick={() => onApply(plan)}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t(sample ? "clearingHouse.sample.apply" : "clearingHouse.review.apply")}
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
