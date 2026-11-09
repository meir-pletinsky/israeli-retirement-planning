import type { SupportedLanguage } from "../i18n";

const DEMO_BASE_URL = "https://demos.gimlai.app";

export const demoVideoUrl = (language: SupportedLanguage) => `${DEMO_BASE_URL}/gimlai_${language}.mp4`;

/** Official Pension Clearing House tutorials on YouTube; Hebrew only. */
export const SWIFTNESS_TUTORIALS = [
  { key: "signUp", youtubeId: "jmVEs4GDEcM" },
  { key: "requestReport", youtubeId: "toAxoB2qgog" },
] as const;

export const youtubeEmbedUrl = (youtubeId: string) => `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`;
