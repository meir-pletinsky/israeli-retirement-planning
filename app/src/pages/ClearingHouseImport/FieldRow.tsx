import { useTranslation } from "react-i18next";

import type { FieldDiff, ImportConfidence } from "../../domain/clearingHouseImport";

const CONFIDENCE_STYLE: Record<ImportConfidence, string> = {
  official: "bg-brand-50 text-brand-700",
  derived: "bg-sky-50 text-sky-700",
  uncertain: "bg-amber-100 text-amber-800",
};

export type RowDiff = FieldDiff;

interface FieldRowProps {
  id: string;
  label: string;
  value: string;
  confidence: ImportConfidence;
  diff: RowDiff;
  /** The value the profile holds now, shown when the report's value would replace it. */
  currentValue: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

export function FieldRow({
  id,
  label,
  value,
  confidence,
  diff,
  currentValue,
  checked,
  disabled,
  onChange,
}: FieldRowProps) {
  const { t } = useTranslation();
  const locked = diff === "same";

  return (
    <li className="flex items-start gap-3 py-2">
      <input
        id={id}
        type="checkbox"
        checked={checked && !locked}
        disabled={disabled || locked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
      />
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="block break-words text-sm font-medium text-slate-900">{value}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CONFIDENCE_STYLE[confidence]}`}>
            {t(`clearingHouse.review.confidence.${confidence}`)}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              diff === "differs" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"
            }`}
          >
            {t(`clearingHouse.review.diff.${diff}`, { value: currentValue })}
          </span>
        </span>
      </label>
    </li>
  );
}
