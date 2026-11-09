import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";
import { demoVideoUrl } from "./demoVideos";

function currentLanguage(language: string): SupportedLanguage {
  return SUPPORTED_LANGUAGES.find((supported) => supported === language) ?? "en";
}

interface DemoPlayerProps {
  language: SupportedLanguage;
  preload: "metadata" | "none";
  onPlay: (video: HTMLVideoElement) => void;
}

function DemoPlayer({ language, preload, onPlay }: DemoPlayerProps) {
  const { t } = useTranslation();
  return (
    <video
      src={demoVideoUrl(language)}
      lang={language}
      controls
      playsInline
      preload={preload}
      aria-label={t("demo.videoLabel", { language: LANGUAGE_LABELS[language] })}
      onPlay={(event) => onPlay(event.currentTarget)}
      className="aspect-video w-full rounded-xl bg-black object-contain shadow-sm"
    />
  );
}

/** The demo video in the app's language, large, with the other two languages as small players below it. */
export function Demo() {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const language = currentLanguage(i18n.language);
  const others = SUPPORTED_LANGUAGES.filter((supported) => supported !== language);

  // Three voice-overs at once would be unintelligible, so starting one video stops the others.
  function pauseOthers(playing: HTMLVideoElement) {
    containerRef.current?.querySelectorAll("video").forEach((video) => {
      if (video !== playing) video.pause();
    });
  }

  return (
    <div ref={containerRef} className="flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("demo.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("demo.intro")}</p>
      </div>

      <section aria-labelledby="demo-main-title" className="flex flex-col gap-2">
        <h2 id="demo-main-title" className="text-sm font-semibold text-slate-700">
          {LANGUAGE_LABELS[language]}
        </h2>
        <DemoPlayer key={language} language={language} preload="metadata" onPlay={pauseOthers} />
      </section>

      <section aria-labelledby="demo-others-title" className="flex flex-col gap-3">
        <h2 id="demo-others-title" className="text-sm font-semibold text-slate-700">
          {t("demo.otherTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {others.map((other) => (
            <figure key={other} className="flex flex-col gap-2">
              <DemoPlayer language={other} preload="none" onPlay={pauseOthers} />
              <figcaption className="text-sm font-medium text-slate-700">{LANGUAGE_LABELS[other]}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <p className="text-xs text-slate-500">{t("demo.note")}</p>
    </div>
  );
}
