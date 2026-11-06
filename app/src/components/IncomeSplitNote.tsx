import { useTranslation } from "react-i18next";

/**
 * Explains the two kinds of income the income views separate. Recurring payments keep arriving;
 * withdrawals come out of savings and can include the original capital, not only returns. The
 * short form is for the timeline, where the groups are already labelled.
 */
export function IncomeSplitNote({
  variant,
  showInvestmentsPool = false,
}: {
  variant: "full" | "short";
  /** Whether the other-investments band is shown, which pools several kinds of assets. */
  showInvestmentsPool?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500">
      <p>{t(variant === "full" ? "projections.split.note" : "projections.split.noteShort")}</p>
      {variant === "full" && showInvestmentsPool && (
        <p>{t("projections.split.investmentsPool", { source: t("projections.sourceInvestments") })}</p>
      )}
    </div>
  );
}
