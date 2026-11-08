import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import {
  assessOwner,
  defaultSelectedFields,
  matchCandidates,
  reportInfoFor,
  suggestOwner,
  withAnnuityFields,
  type ImportPlan,
  type ParsedReport,
  type PersonalFieldKey,
  type ReportMapResult,
} from "../../domain/clearingHouseImport";
import { formatDate } from "../../i18n/formatters";
import { hasProfileData, type AccountOwner, type PensionAccount } from "../../types";
import { reportPersonLabel } from "../MyData/reportSource";
import { AccountReviewCard } from "./AccountReviewCard";
import { FieldRow } from "./FieldRow";
import { formatMoney, formatPersonalValue, productKindLabel } from "./formatFieldValue";
import {
  accountValueRows,
  buildImportPlan,
  candidateBalance,
  countPlan,
  countWarnings,
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

const LINK_BUTTON =
  "rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600";
interface ReviewStageProps {
  parsed: ParsedReport;
  /** The bundled demonstration report: matched against nothing, and confirmed before it joins real data. */
  sample: boolean;
  /** The person the user started the import for; overrides the guess made from the report. */
  initialOwner?: AccountOwner | null;
  onApply: (plan: ImportPlan) => void;
  onStartOver: () => void;
}

export function ReviewStage({ parsed, sample, initialOwner = null, onApply, onStartOver }: ReviewStageProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { result } = parsed;
  const [owner, setOwner] = useState<AccountOwner>(
    () => initialOwner ?? (sample ? "self" : suggestOwner(result, profile)),
  );
  const [suggestedSpouse] = useState(initialOwner === null && owner === "spouse");
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
  const mixedPeople = assessment?.concerns.includes("multiplePeople") ?? false;
  const reportPerson = result.people.length === 1 ? result.people[0] : null;
  const recognised = assessment?.recognisedReport?.owner === owner ? assessment.recognisedReport : null;

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
        {reportPerson && (reportPerson.firstName !== null || reportPerson.age !== null) && (
          <p>
            {t("clearingHouse.review.reportOf", {
              person: reportPersonLabel({ firstName: reportPerson.firstName, ageAtImport: reportPerson.age }, t),
            })}
          </p>
        )}
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
        <fieldset className="card">
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
          {suggestedSpouse && owner === "spouse" && !recognised && (
            <p className="mt-2 text-xs text-slate-600">{t("clearingHouse.review.ownerSuggestedSpouse")}</p>
          )}
          {recognised && (
            <p role="note" className="mt-2 text-xs text-slate-600">
              {t("clearingHouse.review.recognised", { date: formatDate(recognised.importedAt) })}
            </p>
          )}
        </fieldset>
      )}

      {!canChooseOwner && recognised && (
        <p role="note" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {t("clearingHouse.review.recognised", { date: formatDate(recognised.importedAt) })}
        </p>
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
                {t(mixedPeople ? "clearingHouse.review.ownerCheck.titleMixed" : "clearingHouse.review.ownerCheck.title")}
              </h3>
              <p className="text-xs text-amber-900">
                {t(mixedPeople ? "clearingHouse.review.ownerCheck.introMixed" : "clearingHouse.review.ownerCheck.intro")}
              </p>
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
            {sample
              ? t("clearingHouse.sample.confirm")
              : mixedPeople
                ? t("clearingHouse.review.ownerCheck.confirmMixed", { context: owner })
                : t(`clearingHouse.review.ownerCheck.confirm`, { context: owner })}
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
  const retirementAge = targetRetirementAge(profile, owner, personal);

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

  const [report] = useState(() => reportInfoFor(result, new Date(), sample));
  const plan = buildImportPlan(owner, candidates, states, personal, selectedPersonal, report);
  const counts = countPlan(plan);
  const personalRows = suggestedPersonal(personal, owner);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [onlySelected, setOnlySelected] = useState(false);

  const existingFor = (key: string, state: AccountReviewState) => {
    const matchedId = matches.get(key);
    return state.updateAccountId && matchedId
      ? (accounts.find((account) => account.id === matchedId) ?? null)
      : null;
  };
  const accountsWithBalance = candidates.map(candidateBalance).filter((value): value is number => value !== null);
  const totalBalance = accountsWithBalance.reduce((sum, value) => sum + value, 0);
  const valuesToConfirm = candidates.reduce((sum, candidate) => {
    const state = states[candidate.key];
    if (!state.include) return sum;
    return sum + accountValueRows(candidate, existingFor(candidate.key, state)).filter((row) => row.attention).length;
  }, 0);
  const warningCount = countWarnings(candidates, result.warnings);
  const allExpanded = candidates.length > 0 && candidates.every((candidate) => expanded[candidate.key]);
  const shownCandidates = onlySelected
    ? candidates.filter((candidate) => {
        const state = states[candidate.key];
        const rows = accountValueRows(candidate, existingFor(candidate.key, state));
        return state.include && rows.some((row) => row.diff !== "same" && state.selected.includes(row.key));
      })
    : candidates;

  function togglePersonal(key: PersonalFieldKey, checked: boolean) {
    setSelectedPersonal((current) =>
      checked ? [...current.filter((entry) => entry !== key), key] : current.filter((entry) => entry !== key),
    );
  }

  function setAllIncluded(include: boolean) {
    setStates((current) =>
      Object.fromEntries(
        candidates.map((candidate) => {
          const state = current[candidate.key];
          const selected =
            include && state.selected.length === 0
              ? defaultSelectedFields(candidate, existingFor(candidate.key, state))
              : state.selected;
          return [candidate.key, { ...state, include, selected }];
        }),
      ),
    );
  }

  function setAllExpanded(open: boolean) {
    setExpanded(Object.fromEntries(candidates.map((candidate) => [candidate.key, open])));
  }

  const summary = [
    {
      label: t("clearingHouse.review.summary.accountsSelected"),
      value: t("clearingHouse.review.summary.ofTotal", { selected: counts.accounts, total: candidates.length }),
    },
    {
      label: t("clearingHouse.review.summary.totalBalance"),
      value: accountsWithBalance.length > 0 ? formatMoney(Math.round(totalBalance), currency) : "\u2014",
    },
    { label: t("clearingHouse.review.summary.valuesSelected"), value: String(counts.values) },
    { label: t("clearingHouse.review.summary.valuesToConfirm"), value: String(valuesToConfirm) },
    { label: t("clearingHouse.review.summary.warnings"), value: String(warningCount) },
  ];

  return (
    <div className="flex flex-col gap-4 pb-28">
      <section
        aria-labelledby="clearing-house-summary-title"
        className="card"
      >
        <h3 id="clearing-house-summary-title" className="text-sm font-semibold text-slate-700">
          {t("clearingHouse.review.summary.title")}
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summary.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="break-words text-base font-semibold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {personalRows.length > 0 && (
        <section className="card">
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
        {candidates.length > 1 && (
          <div
            role="group"
            aria-label={t("clearingHouse.review.controls.label")}
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <button type="button" onClick={() => setAllIncluded(true)} className={LINK_BUTTON}>
              {t("clearingHouse.review.controls.selectAll")}
            </button>
            <button type="button" onClick={() => setAllIncluded(false)} className={LINK_BUTTON}>
              {t("clearingHouse.review.controls.clearAll")}
            </button>
            {!onlySelected && (
              <button type="button" onClick={() => setAllExpanded(!allExpanded)} className={LINK_BUTTON}>
                {t(allExpanded ? "clearingHouse.review.controls.collapseAll" : "clearingHouse.review.controls.expandAll")}
              </button>
            )}
            <label className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(e) => setOnlySelected(e.target.checked)}
                className="accent-brand-600"
              />
              {t("clearingHouse.review.controls.onlySelected")}
            </label>
          </div>
        )}
        {onlySelected && candidates.length > 0 && (
          <p className="text-xs text-slate-600">
            {shownCandidates.length > 0
              ? t("clearingHouse.review.controls.shown", { shown: shownCandidates.length, total: candidates.length })
              : t("clearingHouse.review.controls.noneSelected")}
          </p>
        )}
        {shownCandidates.map((candidate) => {
          const matchedId = matches.get(candidate.key);
          return (
            <AccountReviewCard
              key={candidate.key}
              candidate={candidate}
              matched={matchedId ? (accounts.find((account) => account.id === matchedId) ?? null) : null}
              state={states[candidate.key]}
              retirementAge={retirementAge}
              currency={currency}
              expanded={expanded[candidate.key] ?? false}
              onToggleExpanded={() =>
                setExpanded((current) => ({ ...current, [candidate.key]: !current[candidate.key] }))
              }
              onlySelected={onlySelected}
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

      <div
        data-fixed-actions
        role="region"
        aria-label={t("clearingHouse.review.actionBar.label")}
        className="fixed inset-x-0 bottom-16 z-20 flex flex-col gap-1.5 border-t border-slate-200 bg-white px-4 py-2 shadow-[0_-2px_8px_rgba(15,23,42,0.08)] md:bottom-0 md:start-60 md:px-6 md:py-3"
      >
        <p className="text-xs font-medium text-slate-700">
          {t("clearingHouse.review.actionBar.selection", {
            accounts: counts.accounts,
            total: candidates.length,
            values: counts.values,
          })}
        </p>
        {blocked ? (
          <p className="text-xs text-amber-800">{t("clearingHouse.review.confirmFirst")}</p>
        ) : (
          counts.values === 0 && <p className="text-xs text-slate-500">{t("clearingHouse.review.nothingSelected")}</p>
        )}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button
            type="button"
            disabled={blocked || counts.values === 0}
            onClick={() => onApply(plan)}
            className="btn btn-primary disabled:cursor-not-allowed disabled:bg-slate-300 md:py-2"
          >
            {t(sample ? "clearingHouse.sample.apply" : "clearingHouse.review.apply")}
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 md:py-2"
          >
            {t("clearingHouse.review.startOver")}
          </button>
        </div>
      </div>
    </div>
  );
}
