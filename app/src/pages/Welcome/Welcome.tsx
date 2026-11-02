import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { LogoMark } from "../components/LogoMark";
import { Toast } from "../components/Toast";
import { importProfileFromFile } from "../storage/profileIO";

export function Welcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { updateProfile, completeOnboarding } = useProfile();
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"default" | "error">("default");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImportFile(file: File) {
    try {
      const imported = await importProfileFromFile(file);
      updateProfile(imported);
      completeOnboarding();
      navigate("/dashboard");
    } catch {
      setToastTone("error");
      setToast(t("settings.importError"));
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md text-center">
        <LogoMark size={80} className="mx-auto mb-6 drop-shadow-sm" />
        <h1  className="text-2xl font-semibold text-slate-900">
          {t("welcome.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{t("welcome.subtitle")}</p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate("/my-data/personal")}
            className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("welcome.start")}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {t("welcome.import")}
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
        </div>
        <p className="mt-6 text-xs text-slate-400">
          {t("welcome.privacyNote")}
        </p>
      </div>
      <Toast message={toast} tone={toastTone} onClear={() => setToast(null)} />
    </div>
  );
}
