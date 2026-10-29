import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { WARNING_SEVERITY, type ImportWarning } from "../../domain/clearingHouseImport";

function messageParams(warning: ImportWarning, t: TFunction): Record<string, string | number> {
  const params: Record<string, string | number> = { ...warning.params };
  if (warning.code === "personalConflict") {
    params.field = t(`myData.steps.personal.${String(params.field)}`);
  }
  if (warning.code === "controlCountMismatch") {
    params.what = t(`clearingHouse.warnings.controlWhat.${String(params.what)}`);
  }
  return params;
}

interface WarningListProps {
  warnings: ImportWarning[];
}

export function WarningList({ warnings }: WarningListProps) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5">
      {warnings.map((warning, index) => {
        const severity = WARNING_SEVERITY[warning.code];
        return (
          <li
            key={`${warning.code}-${index}`}
            data-severity={severity}
            className={`rounded-md border px-3 py-2 text-xs ${
              severity === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {t(`clearingHouse.warnings.${warning.code}`, messageParams(warning, t))}
          </li>
        );
      })}
    </ul>
  );
}
