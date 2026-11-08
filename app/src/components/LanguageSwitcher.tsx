import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ru: "Русский",
  he: "עברית",
};

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <select
      aria-label={t("settings.language")}
      value={i18n.language}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      className="field-control h-11 shrink-0 px-2.5"
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <option key={lng} value={lng}>
          {LANGUAGE_LABELS[lng]}
        </option>
      ))}
    </select>
  );
}
