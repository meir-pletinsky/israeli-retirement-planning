import { useTranslation } from "react-i18next";

import { ImportanceBadge, type FieldImportance } from "../../components/fields/FieldLabel";

const LEVELS: FieldImportance[] = ["required", "recommended", "reference"];

/** Explains the tags beside the My Data fields, so users know what they must fill in. */
export function FieldLegend() {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("myData.importance.legendTitle")}
      className="max-w-lg rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"
    >
      <h2 className="font-semibold text-slate-700">{t("myData.importance.legendTitle")}</h2>
      <ul className="mt-2 flex flex-col gap-1.5">
        {LEVELS.map((level) => (
          <li key={level}>
            <span className="me-2">
              <ImportanceBadge importance={level} />
            </span>
            {t(`myData.importance.legend.${level}`)}
          </li>
        ))}
      </ul>
      <p className="mt-2">{t("myData.importance.legendOptional")}</p>
    </section>
  );
}
