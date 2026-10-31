import clsx from "clsx";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ImportanceBadge, type FieldImportance } from "../../components/fields/FieldLabel";

const LEVELS: FieldImportance[] = ["required", "recommended", "reference"];

function LegendList({ onTint = false }: { onTint?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {LEVELS.map((level) => (
          <li key={level}>
            <span className="me-2">
              <ImportanceBadge importance={level} onTint={onTint} />
            </span>
            {t(`myData.importance.legend.${level}`)}
          </li>
        ))}
      </ul>
      <p className="mt-2">{t("myData.importance.legendOptional")}</p>
    </>
  );
}

/** Explains the tags beside the My Data fields, so users know what they must fill in. */
export function FieldLegend() {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("myData.importance.legendTitle")}
      className="max-w-lg rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"
    >
      <h2 className="mb-2 font-semibold text-slate-700">{t("myData.importance.legendTitle")}</h2>
      <LegendList />
    </section>
  );
}

/**
 * The same explanation folded into one line, for the strip above a form. It
 * starts closed each time the form opens and the user can open it. Drawn as a
 * tinted callout so it reads as help, not as one of the fields below.
 */
export function CollapsibleFieldLegend() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section
      aria-label={t("myData.importance.legendTitle")}
      className="rounded-lg border border-brand-200 bg-brand-50 text-xs text-slate-700"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start hover:bg-brand-100/60"
      >
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold leading-none text-white"
        >
          i
        </span>
        <span className="text-sm font-semibold text-brand-900">
          {t("myData.importance.legendTitle")}
        </span>
        {!open && (
          <span aria-hidden="true" className="hidden items-center gap-1 sm:flex">
            {LEVELS.map((level) => (
              <ImportanceBadge key={level} importance={level} onTint />
            ))}
          </span>
        )}
        <span
          aria-hidden="true"
          className={clsx("ms-auto text-sm text-brand-700 transition-transform", open && "rotate-180")}
        >
          &#x25BE;
        </span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-brand-200 px-3 py-2.5">
          <LegendList onTint />
        </div>
      )}
    </section>
  );
}
