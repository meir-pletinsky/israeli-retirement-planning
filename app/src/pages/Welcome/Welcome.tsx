import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { LogoMark } from "../../components/LogoMark";
import { Toast } from "../../components/Toast";
import { importProfileFromFile } from "../../storage/profileIO";
import { AboutBox } from "./AboutBox";
import { FastTrackCard } from "./FastTrackCard";
import { GetStartedFlow } from "./GetStartedFlow";
import { PrivacyBox } from "./PrivacyBox";
import { PlayIcon } from "./WelcomeCard";

const GET_STARTED_ID = "get-started";

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

  function scrollToGetStarted() {
    const section = document.getElementById(GET_STARTED_ID);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  return (
    <div className="relative min-h-screen bg-surface px-4 py-12 sm:px-6">
      <div className="absolute top-4 end-4">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="mx-auto w-full max-w-md text-center">
          <LogoMark size={80} className="mx-auto mb-6 drop-shadow-sm" />
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-slate-900">{t("welcome.title")}</h1>
          <p className="mt-3 text-base text-pretty text-slate-600">{t("welcome.subtitle")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={scrollToGetStarted}
              className="btn btn-primary min-h-12 text-base"
            >
              {t("welcome.getStarted")}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary min-h-12 text-base"
            >
              {t("welcome.loadSaved")}
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
          <p className="mt-3 text-xs text-slate-500">{t("welcome.loadSavedHint")}</p>
          <Link to="/demo" className="btn btn-ghost mt-4">
            <PlayIcon />
            {t("welcome.watchDemo")}
          </Link>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <AboutBox />
          <PrivacyBox />
        </div>
        <GetStartedFlow id={GET_STARTED_ID} />
        <FastTrackCard />
      </div>
      <Toast message={toast} tone={toastTone} onClear={() => setToast(null)} />
    </div>
  );
}
