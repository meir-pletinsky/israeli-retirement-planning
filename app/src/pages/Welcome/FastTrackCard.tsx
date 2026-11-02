import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { BoltIcon } from "./WelcomeCard";

const PERSONAL_FIELDS = ["age", "gender", "salary", "marital"] as const;
const PENSION_FIELDS = ["accounts", "deposits", "fees", "annuity", "cover"] as const;

function FillList({ title, group, fields }: { title: string; group: string; fields: readonly string[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <ul className="mt-1.5 flex list-disc flex-col gap-1 ps-5 marker:text-amber-500">
        {fields.map((field) => (
          <li key={field}>{t(`welcome.fastTrack.${group}.${field}`)}</li>
        ))}
      </ul>
    </div>
  );
}

/** The recommended shortcut: import the Pension Clearing House report, and what that fills in. */
export function FastTrackCard() {
  const { t } = useTranslation();
  return (
    <section
      id="fast-track"
      aria-labelledby="welcome-fast-track-title"
      className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-sm leading-relaxed text-slate-700 shadow-sm sm:p-6"
    >
      <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-900">
        <span aria-hidden="true" className="[&>svg]:h-3.5 [&>svg]:w-3.5">
          <BoltIcon />
        </span>
        {t("welcome.fastTrack.badge")}
      </p>
      <h2 id="welcome-fast-track-title" className="mt-2 text-lg font-semibold text-slate-900">
        {t("welcome.fastTrack.title")}
      </h2>
      <p className="mt-1 max-w-2xl">{t("welcome.fastTrack.intro")}</p>

      <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-amber-900">
        {t("welcome.fastTrack.fillsTitle")}
      </h3>
      <div className="mt-2 grid gap-5 sm:grid-cols-2">
        <FillList
          title={t("myData.steps.personal.label")}
          group="personal"
          fields={PERSONAL_FIELDS}
        />
        <FillList
          title={t("myData.steps.pensionSavings.label")}
          group="pension"
          fields={PENSION_FIELDS}
        />
      </div>
      <p className="mt-4 rounded-lg bg-white/70 p-3">
        <span className="font-semibold text-slate-900">{t("welcome.fastTrack.stillYoursTitle")} </span>
        {t("welcome.fastTrack.stillYours")}
      </p>

      <ol className="mt-4 flex list-decimal flex-col gap-1 ps-5 marker:font-semibold">
        <li>{t("welcome.fastTrack.howOrder")}</li>
        <li>{t("welcome.fastTrack.howImport")}</li>
        <li>{t("welcome.fastTrack.howReview")}</li>
      </ol>

      <div className="mt-5 flex flex-col items-start gap-2">
        <Link
          to="/import/clearing-house"
          className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t("clearingHouse.entryButton")}
        </Link>
        <p className="text-xs text-slate-600">{t("welcome.fastTrack.sampleHint")}</p>
      </div>
    </section>
  );
}
