import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface ChartFrameProps {
  /** One sentence on what the chart shows, in plain words. Always visible when there is one. */
  takeaway: string | null;
  /** The chart's numbers as a table; gives the chart a "Show as table" switch. */
  table?: ReactNode;
  /** The chart. */
  children: ReactNode;
}

/** A chart with its takeaway above it and, when it has a table, a switch to see the same data as one. */
export function ChartFrame({ takeaway, table, children }: ChartFrameProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<"chart" | "table">("chart");
  const showTable = table != null && view === "table";

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        {takeaway && <p className="text-sm text-slate-700">{takeaway}</p>}
        {table != null && (
          <button
            type="button"
            onClick={() => setView(showTable ? "chart" : "table")}
            className="ms-auto shrink-0 text-xs font-medium text-brand-700 hover:underline"
          >
            {showTable ? t("projections.viewChart") : t("projections.viewTable")}
          </button>
        )}
      </div>
      {showTable ? table : children}
    </div>
  );
}
