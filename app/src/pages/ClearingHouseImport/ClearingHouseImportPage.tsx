import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import {
  applyImport,
  ClearingHouseImportError,
  importClearingHouseFiles,
  type ImportPlan,
  type ParsedReport,
} from "../../domain/clearingHouseImport";
import { PasswordPrompt } from "./PasswordPrompt";
import { PickStage } from "./PickStage";
import { countPlan } from "./reviewState";
import { ReviewStage } from "./ReviewStage";

type Stage =
  | { name: "pick" }
  | { name: "password"; files: File[]; wrongPassword: boolean }
  | { name: "review"; parsed: ParsedReport }
  | { name: "done"; accounts: number; personal: number };

const ACCOUNTS_ROUTE = "/my-data/pension-savings";

export function ClearingHouseImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, updateProfile } = useProfile();
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function load(files: File[], password?: string) {
    setBusy(true);
    setErrorCode(null);
    try {
      const parsed = await importClearingHouseFiles(files, { password });
      setStage({ name: "review", parsed });
    } catch (error) {
      if (
        error instanceof ClearingHouseImportError &&
        (error.code === "passwordRequired" || error.code === "wrongPassword")
      ) {
        setStage({ name: "password", files, wrongPassword: error.code === "wrongPassword" });
      } else {
        setErrorCode(error instanceof ClearingHouseImportError ? error.code : "unknown");
        setStage({ name: "pick" });
      }
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setErrorCode(null);
    setStage({ name: "pick" });
  }

  function apply(plan: ImportPlan) {
    const counts = countPlan(plan);
    updateProfile(applyImport(profile, plan));
    setStage({ name: "done", accounts: counts.accounts, personal: counts.personal });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">{t("clearingHouse.title")}</h1>

      {stage.name === "pick" && (
        <PickStage
          busy={busy}
          errorMessage={errorCode ? t(`clearingHouse.errors.${errorCode}`) : null}
          onFiles={(files) => void load(files)}
        />
      )}

      {stage.name === "password" && (
        <PasswordPrompt
          busy={busy}
          errorMessage={stage.wrongPassword ? t("clearingHouse.errors.wrongPassword") : null}
          onSubmit={(password) => void load(stage.files, password)}
          onChooseOther={startOver}
        />
      )}

      {stage.name === "review" && (
        <ReviewStage parsed={stage.parsed} onApply={apply} onStartOver={startOver} />
      )}

      {stage.name === "done" && (
        <section className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-sm font-semibold text-brand-900">{t("clearingHouse.done.title")}</h2>
          <p className="text-sm text-brand-900">
            {t("clearingHouse.done.summary", { accounts: stage.accounts, personal: stage.personal })}
          </p>
          <p className="text-xs text-brand-800">{t("clearingHouse.done.reminder")}</p>
          <div>
            <button
              type="button"
              onClick={() => navigate(ACCOUNTS_ROUTE)}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("clearingHouse.done.toAccounts")}
            </button>
          </div>
        </section>
      )}

      {stage.name !== "done" && stage.name !== "review" && (
        <div>
          <button
            type="button"
            onClick={() => navigate(ACCOUNTS_ROUTE)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("clearingHouse.backToAccounts")}
          </button>
        </div>
      )}
    </div>
  );
}
