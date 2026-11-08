import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../app/ProfileContext";
import {
  MAX_RETIREMENT_SEARCH_AGE,
  VerificationPackLeakError,
  buildVerificationPack,
  resolveCurrentAge,
  resolveRetirementTiming,
  serializeVerificationPack,
  type RedactionKey,
  type RetirementScenario,
  type VerificationTarget,
} from "../domain";
import { downloadJsonFile } from "../storage/profileIO";

type Choice = RetirementScenario | "age";

const CHOICES: Choice[] = ["early", "standard", "delayed", "age"];

const BUTTON =
  "btn btn-secondary justify-start text-start disabled:cursor-not-allowed";

interface Props {
  onNotify: (message: string, tone: "default" | "error") => void;
}

/**
 * Exports the full calculation trace of one scenario or retirement age, with
 * identifying text redacted, plus a separate local-only key that maps the
 * aliases back to the real accounts.
 */
export function VerificationExport({ onNotify }: Props) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [choice, setChoice] = useState<Choice>("standard");
  const [ageText, setAgeText] = useState(() => String(resolveRetirementTiming(profile, "standard").selfAge));
  const [key, setKey] = useState<RedactionKey | null>(null);

  const minAge = Math.ceil(resolveCurrentAge(profile));
  const age = Number(ageText);
  const ageValid = Number.isInteger(age) && age >= minAge && age <= MAX_RETIREMENT_SEARCH_AGE;
  const canExport = choice !== "age" || ageValid;

  function handleExportPack() {
    const target: VerificationTarget =
      choice === "age" ? { kind: "age", age } : { kind: "scenario", scenario: choice };
    try {
      const built = buildVerificationPack({ profile, target });
      downloadJsonFile(serializeVerificationPack(built.pack), "-verification-pack");
      setKey(built.redactionKey);
      onNotify(t("settings.verification.packExported"), "default");
    } catch (error) {
      setKey(null);
      const message =
        error instanceof VerificationPackLeakError
          ? t("settings.verification.leakError")
          : t("settings.verification.error");
      onNotify(message, "error");
    }
  }

  function handleExportKey() {
    if (!key) return;
    downloadJsonFile(JSON.stringify(key, null, 2), "-verification-key");
    onNotify(t("settings.verification.keyExported"), "default");
  }

  return (
    <section
      aria-labelledby="verification-title"
      className="card"
    >
      <h2 id="verification-title" className="mb-1 text-sm font-semibold text-slate-700">
        {t("settings.verification.title")}
      </h2>
      <p className="mb-3 text-xs text-slate-500">{t("settings.verification.intro")}</p>

      <span className="text-sm font-medium text-slate-700">{t("settings.verification.target")}</span>
      <div className="mt-2 inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-slate-400">
        {CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={choice === option}
            onClick={() => setChoice(option)}
            className={clsx(
              "min-h-10 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              choice === option ? "bg-white font-semibold text-brand-800 shadow-sm ring-1 ring-slate-400" : "text-slate-600",
            )}
          >
            {option === "age"
              ? t("settings.verification.ageOption")
              : t(`projections.scenario${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
          </button>
        ))}
      </div>

      {choice === "age" && (
        <div className="mt-3">
          <label htmlFor="verification-age" className="text-sm font-medium text-slate-700">
            {t("settings.verification.ageLabel")}
          </label>
          <input
            id="verification-age"
            type="number"
            inputMode="numeric"
            min={minAge}
            max={MAX_RETIREMENT_SEARCH_AGE}
            value={ageText}
            aria-invalid={!ageValid}
            onChange={(e) => setAgeText(e.target.value)}
            className="field-control mt-1 block h-11 w-24 px-2"
          />
          <p className="mt-1 text-xs text-slate-500">
            {t("settings.verification.ageHelp", { min: minAge, max: MAX_RETIREMENT_SEARCH_AGE })}
          </p>
        </div>
      )}

      <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
        {t("settings.verification.privacy")}
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <button type="button" onClick={handleExportPack} disabled={!canExport} className={BUTTON}>
          {t("settings.verification.exportPack")}
        </button>
        {key && (
          <>
            <button type="button" onClick={handleExportKey} className={BUTTON}>
              {t("settings.verification.exportKey")}
            </button>
            <p className="text-xs text-slate-500">{t("settings.verification.keyHelp")}</p>
          </>
        )}
      </div>
    </section>
  );
}
