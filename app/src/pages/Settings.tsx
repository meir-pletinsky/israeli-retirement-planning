import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  clearBeforeImportRestorePoint,
  loadBeforeImportRestorePoint,
  saveBeforeImportRestorePoint,
  type RestorePoint,
} from "../storage/db";
import { readProfileFile, type ProfileFile } from "../storage/profileIO";
import { currentBrowserIsSafari } from "../storage/persistentStorage";
import { areasEmptiedByImport, summarizePlan } from "../domain/planSummary";
import { formatDate, formatLocalDate, formatNumber } from "../i18n/formatters";
import { hasProfileData, type ProfileData } from "../types";
import { useBackupStatus } from "../app/backupStatus";
import { useProfile } from "../app/ProfileContext";
import { useExportBackup } from "../app/useExportBackup";
import { useLatestUsdIlsRate } from "../app/useLatestUsdIlsRate";
import { usePersistenceStatus } from "../app/usePersistenceStatus";
import { ConfirmModal } from "../components/ConfirmModal";
import { CheckboxField } from "../components/fields/CheckboxField";
import { ImportPreviewDialog } from "../components/ImportPreviewDialog";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Toast } from "../components/Toast";
import { VerificationExport } from "../components/VerificationExport";

export function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    profile,
    updateProfile,
    completeOnboarding,
    resetProfile,
    fxLookupEnabled,
    setFxLookupEnabled,
    cpiLookupEnabled,
    setCpiLookupEnabled,
  } = useProfile();
  const { rate: latestRate, settled: rateSettled } = useLatestUsdIlsRate(fxLookupEnabled);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<(ProfileFile & { fileName: string }) | null>(null);
  const [restorePoint, setRestorePoint] = useState<RestorePoint | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"default" | "error">("default");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportBackup = useExportBackup();
  const { lastExportedAt } = useBackupStatus();
  const persistence = usePersistenceStatus();
  const showSafariNote = currentBrowserIsSafari();

  useEffect(() => {
    let cancelled = false;
    void loadBeforeImportRestorePoint().then((point) => {
      if (!cancelled) setRestorePoint(point ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleExport() {
    exportBackup();
    setToastTone("default");
    setToast(t("settings.exportSuccess"));
  }

  async function handleImportFile(file: File) {
    try {
      const read = await readProfileFile(file);
      if (hasProfileData(profile)) {
        setPendingImport({ ...read, fileName: file.name });
      } else {
        await applyImport(read.profile);
      }
    } catch {
      setToastTone("error");
      setToast(t("settings.importError"));
    }
  }

  async function applyImport(imported: ProfileData) {
    const replacing = hasProfileData(profile);
    if (replacing) {
      await saveBeforeImportRestorePoint(profile);
      setRestorePoint(await loadBeforeImportRestorePoint() ?? null);
    }
    updateProfile(imported);
    completeOnboarding();
    setToastTone("default");
    setToast(t(replacing ? "settings.importSuccessWithRestore" : "settings.importSuccess"));
  }

  async function confirmImport() {
    const pending = pendingImport;
    setPendingImport(null);
    if (!pending) return;
    try {
      await applyImport(pending.profile);
    } catch {
      setToastTone("error");
      setToast(t("settings.importError"));
    }
  }

  async function restorePreviousPlan() {
    const point = restorePoint;
    setRestoreConfirmOpen(false);
    if (!point) return;
    updateProfile(point.data);
    completeOnboarding();
    await clearBeforeImportRestorePoint();
    setRestorePoint(null);
    setToastTone("default");
    setToast(t("settings.restore.done"));
  }

  return (
    <div className="flex w-full max-w-[40rem] flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {t("settings.title")}
      </h1>

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          {t("privacy.section.title")}
        </h2>
        <ul className="list-disc space-y-1.5 ps-5 text-sm text-slate-600">
          <li>{t("privacy.section.stored")}</li>
          <li>{t("privacy.section.rates")}</li>
          <li>{t("privacy.section.cpi")}</li>
          <li>{t("privacy.section.stocks")}</li>
          <li>{t("privacy.section.files")}</li>
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          {t("settings.language")}
        </h2>
        <LanguageSwitcher />
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          {t("settings.exchangeRates")}
        </h2>
        <CheckboxField
          label={t("settings.fxLookup")}
          checked={fxLookupEnabled}
          onChange={setFxLookupEnabled}
        />
        {fxLookupEnabled && (
          <p role="status" className="mt-3 text-sm text-slate-700">
            {latestRate
              ? t("settings.fxCurrent", {
                  rate: formatNumber(latestRate.rate, {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 4,
                  }),
                  date: formatDate(latestRate.date),
                })
              : t(rateSettled ? "settings.fxCurrentUnavailable" : "settings.fxCurrentLoading")}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">{t("settings.fxLookupPrivacy")}</p>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          {t("settings.inflationData")}
        </h2>
        <CheckboxField
          label={t("settings.cpiLookup")}
          checked={cpiLookupEnabled}
          onChange={setCpiLookupEnabled}
        />
        <p className="mt-2 text-xs text-slate-500">{t("settings.cpiLookupPrivacy")}</p>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          {t("settings.dataManagement")}
        </h2>
        <div className="mb-3 flex flex-col gap-1.5 text-sm text-slate-700">
          <p>
            {lastExportedAt
              ? t("settings.backup.lastExported", { date: `\u2066${formatLocalDate(lastExportedAt)}\u2069` })
              : t("settings.backup.neverExported")}
          </p>
          {persistence.status !== null && (
            <p aria-live="polite">
              {t(`settings.persistence.${persistence.status}`)}
              {persistence.status === "notPersisted" && persistence.declined && (
                <> {t("settings.persistence.declined")}</>
              )}
            </p>
          )}
          {persistence.status === "notPersisted" && (
            <button
              type="button"
              onClick={() => void persistence.ask()}
              className="btn btn-sm btn-secondary self-start"
            >
              {t("settings.persistence.ask")}
            </button>
          )}
          {showSafariNote && (
            <p className="text-xs text-slate-500">{t("settings.persistence.safari")}</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="btn btn-secondary justify-start text-start"
          >
            {t("settings.export")}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary justify-start text-start"
          >
            {t("settings.import")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImportFile(file);
            }}
          />
          {restorePoint && (
            <div>
              <button
                type="button"
                onClick={() => setRestoreConfirmOpen(true)}
                className="btn btn-secondary w-full justify-start text-start"
              >
                {t("settings.restore.button")}
              </button>
              <p className="mt-1 text-xs text-slate-500">
                {t("settings.restore.hint", { date: formatDate(restorePoint.savedAt) })}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="btn btn-secondary justify-start text-start"
          >
            {t("settings.reset")}
          </button>
        </div>
      </section>

      <VerificationExport
        onNotify={(message, tone) => {
          setToastTone(tone);
          setToast(message);
        }}
      />

      {pendingImport && (
        <ImportPreviewDialog
          fileName={pendingImport.fileName}
          current={summarizePlan(profile)}
          incoming={summarizePlan(pendingImport.profile)}
          emptiedAreas={areasEmptiedByImport(profile, pendingImport.sections)}
          onConfirm={() => void confirmImport()}
          onCancel={() => setPendingImport(null)}
        />
      )}
      <ConfirmModal
        open={restoreConfirmOpen && restorePoint !== null}
        title={t("settings.restore.confirmTitle")}
        body={t("settings.restore.confirmBody", {
          date: restorePoint ? formatDate(restorePoint.savedAt) : "",
        })}
        confirmLabel={t("settings.restore.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setRestoreConfirmOpen(false)}
        onConfirm={() => void restorePreviousPlan()}
      />

      <ConfirmModal
        open={confirmOpen}
        title={t("settings.resetConfirmTitle")}
        body={t("settings.resetConfirmBody")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          resetProfile();
          setConfirmOpen(false);
          navigate("/");
        }}
      />
      <Toast message={toast} tone={toastTone} onClear={() => setToast(null)} />
    </div>
  );
}
