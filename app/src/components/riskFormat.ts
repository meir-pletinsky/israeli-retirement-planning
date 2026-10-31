import { successPercent } from "../domain";

/** A success probability as "65%", or "<1%" when it is above zero but rounds down to it. */
export function formatSuccessPercent(probability: number): string {
  const percent = successPercent(probability);
  return percent === 0 && probability > 0 ? "<1%" : `${percent}%`;
}
