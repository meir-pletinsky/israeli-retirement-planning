/**
 * Rounds `values` to whole numbers that add up to `target` (their rounded sum), handing the
 * leftover units to the values with the largest fractions, so a table of the parts agrees with
 * its total.
 */
export function roundToSum(values: readonly number[], target: number): number[] {
  const floors = values.map(Math.floor);
  let leftover = target - floors.reduce((sum, value) => sum + value, 0);
  const byFraction = values
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction) {
    if (leftover <= 0) break;
    floors[index] += 1;
    leftover -= 1;
  }
  return floors;
}
