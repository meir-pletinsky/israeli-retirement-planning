import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import {
  applyImport,
  ClearingHouseImportError,
  importClearingHouseFiles,
  SAMPLE_REPORT_DATE,
  SAMPLE_REPORT_FILE_NAME,
  SAMPLE_REPORT_PATH,
  type ImportPlan,
  type ParsedReport,
} from "../../domain/clearingHouseImport";
import type { AccountOwner } from "../../types";
import { PERSON_PARAM, parsePerson } from "../MyData/activePerson";
import { PasswordPrompt } from "./PasswordPrompt";
import { PickStage } from "./PickStage";
import { countPlan } from "./reviewState";
import { ReviewStage } from "./ReviewStage";
import { SampleBadge } from "./SampleBanner";

type Stage =
  | { name: "pick" }
  | { name: "password"; files: File[]; wrongPassword: boolean }
  | { name: "review"; parsed: ParsedReport; sample: boolean }
  | { name: "done"; accounts: number; personal: number; sample: boolean; owner: AccountOwner };

const ACCOUNTS_ROUTE = "/my-data/pension-savings";

/** The accounts page, opened on the tab of the person whose report was imported. */
function accountsRoute(owner: AccountOwner | null): string {
  return owner ? `${ACCOUNTS_ROUTE}?${PERSON_PARAM}=${owner}` : ACCOUNTS_ROUTE;
}

export function ClearingHouseImportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Set when the user starts from a person's tab, so the report goes to that person.
  const requestedOwner = parsePerson(searchParams.get("owner"));
  const { profile, updateProfile } = useProfile();
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function load(files: File[], password?: string) {
    setBusy(true);
    setErrorCode(null);
    try {
      const parsed = await importClearingHouseFiles(files, { password });
      setStage({ name: "review", parsed, sample: false });
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

  async function loadSample() {
    setBusy(true);
    setErrorCode(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${SAMPLE_REPORT_PATH}`);
      if (!response.ok) throw new ClearingHouseImportError("sampleUnavailable");
      const file = new File([await response.arrayBuffer()], SAMPLE_REPORT_FILE_NAME, { type: "application/zip" });
      const parsed = await importClearingHouseFiles([file], { now: SAMPLE_REPORT_DATE });
      setStage({ name: "review", parsed, sample: true });
    } catch {
      setErrorCode("sampleUnavailable");
      setStage({ name: "pick" });
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setErrorCode(null);
    setStage({ name: "pick" });
  }

  function apply(plan: ImportPlan) {
    if (stage.name !== "review") return;
    const counts = countPlan(plan);
    updateProfile(applyImport(profile, plan));
    setStage({
      name: "done",
      accounts: counts.accounts,
      personal: counts.personal,
      sample: stage.sample,
      owner: plan.owner,
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">{t("clearingHouse.title")}</h1>

      {requestedOwner && stage.name !== "done" && (
        <p className="text-sm font-medium text-slate-700">
          {t("clearingHouse.importingFor", { person: t(`myData.person.${requestedOwner}`) })}
        </p>
      )}
      {stage.name === "pick" && (
        <PickStage
          busy={busy}
          errorMessage={errorCode ? t(`clearingHouse.errors.${errorCode}`) : null}
          onFiles={(files) => void load(files)}
          onSample={() => void loadSample()}
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
        <ReviewStage
          parsed={stage.parsed}
          sample={stage.sample}
          initialOwner={requestedOwner}
          onApply={apply}
          onStartOver={startOver}
        />
      )}

      {stage.name === "done" && (
        <section className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center gap-2">
            {stage.sample && <SampleBadge />}
            <h2 className="text-sm font-semibold text-brand-900">
              {t(stage.sample ? "clearingHouse.sample.doneTitle" : "clearingHouse.done.title")}
            </h2>
          </div>
          <p className="text-sm text-brand-900">
            {t(stage.sample ? "clearingHouse.sample.doneSummary" : "clearingHouse.done.summary", {
              accounts: stage.accounts,
              personal: stage.personal,
            })}
          </p>
          <p className="text-xs text-brand-800">
            {t(stage.sample ? "clearingHouse.sample.doneReminder" : "clearingHouse.done.reminder")}
          </p>
          <div>
            <button
              type="button"
              onClick={() => navigate(accountsRoute(stage.owner))}
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
