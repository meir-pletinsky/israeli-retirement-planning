import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { Toast } from "../components/Toast";

export function Welcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("welcome.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{t("welcome.subtitle")}</p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate("/my-data/personal")}
            className="rounded-md bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
          >
            {t("welcome.start")}
          </button>
          <button
            type="button"
            onClick={() => setToast(t("settings.notImplemented"))}
            className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {t("welcome.import")}
          </button>
        </div>
        <p className="mt-6 text-xs text-slate-400">
          {t("welcome.privacyNote")}
        </p>
      </div>
      <Toast message={toast} onClear={() => setToast(null)} />
    </div>
  );
}
