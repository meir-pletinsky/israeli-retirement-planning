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
  required: "bg-rose-50 text-rose-700",
  recommended: "bg-teal-50 text-teal-700",
  reference: "bg-slate-100 text-slate-500",
};

export function ImportanceBadge({ importance }: { importance: FieldImportance }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "inline-block rounded-full px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none",
        BADGE_CLASSES[importance],
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
