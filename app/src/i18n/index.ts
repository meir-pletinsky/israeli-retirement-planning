import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";

export const SUPPORTED_LANGUAGES = ["en", "ru", "he"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  ru: "Русский",
  he: "עברית",
};

export const RTL_LANGUAGES: SupportedLanguage[] = ["he"];

export function isRtl(language: string): boolean {
  return RTL_LANGUAGES.includes(language as SupportedLanguage);
}

const LANGUAGE_STORAGE_KEY = "irp_language";

/** The language a link asks for with `?lng=` (`he`, `en`, `ru`; a region such as `he-IL` is fine), if the app has it. */
export function languageFromSearch(search: string): SupportedLanguage | null {
  const requested = new URLSearchParams(search).get("lng")?.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.find((language) => language === requested) ?? null;
}

function readSavedLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSavedLanguage(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    else window.localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
  } catch {
    // Storage is not available, so there is nothing to keep.
  }
}

// A language in the link wins over the saved one, but only for this visit. Some test suites run
// without a window.
const linkLanguage = typeof window === "undefined" ? null : languageFromSearch(window.location.search);
const savedLanguage = linkLanguage ? readSavedLanguage() : null;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      he: { translation: he },
    },
    lng: linkLanguage ?? undefined,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
  });

// i18next saves whatever language it starts with, which would turn the link's language into the
// saved one. Putting the earlier value back leaves only a choice made in the language switcher saved.
if (linkLanguage) writeSavedLanguage(savedLanguage);

export default i18n;
