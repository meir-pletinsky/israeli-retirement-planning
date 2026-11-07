import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { sectionAnchor, type ProjectionSection } from "./projectionSections";

interface Props {
  section: ProjectionSection;
  children: ReactNode;
}

/** A titled group of cards on the Projections page that the section index links to. */
export function ProjectionSectionGroup({ section, children }: Props) {
  const { t } = useTranslation();
  const anchor = sectionAnchor(section);

  const backToTop = () => {
    window.scrollTo({ top: 0 });
    const heading = document.querySelector<HTMLElement>("h1");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  };

  return (
    <div id={anchor} role="group" aria-labelledby={`${anchor}-title`} className="flex flex-col gap-6">
      <div className="border-b border-slate-200 pb-2">
        <h2 id={`${anchor}-title`} className="text-base font-semibold text-slate-900">
          {t(`projections.sections.${section}.title`)}
        </h2>
        <p className="text-xs text-slate-500">{t(`projections.sections.${section}.question`)}</p>
      </div>
      {children}
      <button
        type="button"
        onClick={backToTop}
        className="self-end text-xs font-medium text-brand-700 hover:underline md:hidden"
      >
        {t("projections.sections.backToTop")}
      </button>
    </div>
  );
}
