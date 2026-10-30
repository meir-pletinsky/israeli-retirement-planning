import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { exportProfileToFile, importProfileFromFile } from "../storage/profileIO";
import { useProfile } from "../app/ProfileContext";
import { useLatestUsdIlsRate } from "../app/useLatestUsdIlsRate";
import { ConfirmModal } from "../components/ConfirmModal";
import { CheckboxField } from "../components/fields/CheckboxField";
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
  } = useProfile();
  const { rate: latestRate, settled: rateSettled } = useLatestUsdIlsRate(fxLookupEnabled);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"default" | "error">("default");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    exportProfileToFile(profile);
    setToastTone("default");
    setToast(t("settings.exportSuccess"));
  }

  async function handleImportFile(file: File) {
    try {
      const imported = await importProfileFromFile(file);
      updateProfile(imported);
      completeOnboarding();
      setToastTone("default");
      setToast(t("settings.importSuccess"));
    } catch {
      setToastTone("error");
      setToast(t("settings.importError"));
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">
        {t("settings.title")}
      </h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          {t("settings.language")}
        </h2>
        <LanguageSwitcher />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                  rate: latestRate.rate.toLocaleString(undefined, {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 4,
                  }),
                  date: latestRate.date,
                })
              : t(rateSettled ? "settings.fxCurrentUnavailable" : "settings.fxCurrentLoading")}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">{t("settings.fxLookupPrivacy")}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          {t("settings.dataManagement")}
        </h2>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-slate-300 px-4 py-2 text-start text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("settings.export")}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-slate-300 px-4 py-2 text-start text-sm font-medium text-slate-700 hover:bg-slate-50"
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
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-md border border-red-200 px-4 py-2 text-start text-sm font-medium text-red-600 hover:bg-red-50"
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
