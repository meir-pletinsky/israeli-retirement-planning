import clsx from "clsx";
import { useTranslation } from "react-i18next";

/**
 * How much the plan depends on a field:
 * - required: the plan cannot run without it (the step will not continue);
 * - recommended: a default is assumed when blank, but the result changes;
 * - reference: saved and exported, but not used in any calculation.
 * Fields with no tag are optional refinements.
 */
export type FieldImportance = "required" | "recommended" | "reference";

const BADGE_CLASSES: Record<FieldImportance, string> = {
  required: "bg-red-50 text-red-800 ring-1 ring-red-200",
  recommended: "bg-brand-50 text-brand-800 ring-1 ring-brand-100",
  reference: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

// On a tinted background the light fills would vanish, so the pill turns white.
const BADGE_ON_TINT_CLASSES: Record<FieldImportance, string> = {
  required: "bg-white text-red-700",
  recommended: "bg-white text-brand-700",
  reference: "bg-white text-slate-500",
};

export function ImportanceBadge({
  importance,
  onTint = false,
}: {
  importance: FieldImportance;
  onTint?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "ms-1 inline-block rounded-md px-1.5 py-0.5 align-middle text-xs font-medium leading-4",
        (onTint ? BADGE_ON_TINT_CLASSES : BADGE_CLASSES)[importance],
      )}
    >
      {t(`myData.importance.${importance}`)}
    </span>
  );
}

interface FieldLabelProps {
  label: string;
  importance?: FieldImportance;
  className?: string;
}

export function FieldLabel({
  label,
  importance,
  className = "text-sm font-medium text-slate-700",
}: FieldLabelProps) {
  return (
    <span className={className}>
      {label}
      {importance && (
        <>
          {" "}
          <ImportanceBadge importance={importance} />
        </>
      )}
    </span>
  );
}
