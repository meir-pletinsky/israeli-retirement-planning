import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ru: "Русский",
  he: "עברית",
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <select
      aria-label="Language"
      value={i18n.language}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none"
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <option key={lng} value={lng}>
          {LANGUAGE_LABELS[lng]}
        </option>
      ))}
    </select>
  );
}
