import { formatAxisMoney } from "../../i18n/formatters";

const AXIS_STROKE = "#958e84";
const CAPTION_FILL = "#625b52";

/** The age axis of a chart, with a caption under the ticks. */
export function ageAxis(caption: string) {
  return {
    dataKey: "age",
    height: 44,
    tick: { fontSize: 13 },
    stroke: AXIS_STROKE,
    label: { value: caption, position: "insideBottom", offset: 8, fontSize: 13, fill: CAPTION_FILL },
  } as const;
}

/** The money axis of a chart, with a caption (what the amounts are) beside the ticks. */
export function moneyAxis(caption: string, currencySymbol: string) {
  return {
    width: 80,
    tick: { fontSize: 13 },
    stroke: AXIS_STROKE,
    tickFormatter: (value: number) => formatAxisMoney(value, currencySymbol),
    label: {
      value: caption,
      angle: -90,
      position: "insideLeft",
      offset: 4,
      fontSize: 13,
      fill: CAPTION_FILL,
      style: { textAnchor: "middle" },
    },
  } as const;
}
