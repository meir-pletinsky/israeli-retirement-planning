import type { SupportedLanguage } from "../i18n";

const DEMO_BASE_URL = "https://demos.gimlai.app";

export const demoVideoUrl = (language: SupportedLanguage) => `${DEMO_BASE_URL}/gimlai_${language}.mp4`;
