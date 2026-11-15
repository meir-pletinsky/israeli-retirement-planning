import { useTranslation } from "react-i18next";

import { ProjectionsHeader } from "../components/ProjectionsHeader";
import { useBandLabels } from "../components/useBandLabels";
import { WhatIfPanel } from "../components/whatIf/WhatIfPanel";

export function WhatIf() {
  const { t } = useTranslation();
  const bandLabels = useBandLabels();

  return (
    <div className="flex flex-col gap-6">
      <ProjectionsHeader />
      <section aria-labelledby="what-if-title" className="flex flex-col gap-6">
        <div className="border-b border-slate-200 pb-2">
          <h2 id="what-if-title" className="text-base font-semibold text-slate-900">
            {t("whatIf.title")}
          </h2>
          <p className="text-xs text-slate-500">{t("whatIf.question")}</p>
        </div>
        <WhatIfPanel bandLabels={bandLabels} />
      </section>
    </div>
  );
}
