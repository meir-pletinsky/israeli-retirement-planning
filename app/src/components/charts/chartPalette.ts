/**
 * One meaning per colour across every chart. Each value is at least 3:1 against white.
 * Red is only for a shortfall; the planned spending is the same dashed magenta line everywhere.
 */
export const CHART_COLORS = {
  /** A total: net worth, the median path, income kept after tax. */
  total: "#1c1a17",
  /** Secondary or deducted amounts: tax, the other compared ages. */
  muted: "#8c857a",
  /** The planned spending line. */
  planned: "#a21caf",
  /** Savings running out. The only use of red. */
  shortfall: "#be123c",
  /** Vertical lines for events such as retirement or the start of drawing. */
  marker: "#514b43",
} as const;

/** The planned spending is drawn the same way in every chart. */
export const PLANNED_LINE_STYLE = { strokeDasharray: "6 4", strokeWidth: 2 } as const;
