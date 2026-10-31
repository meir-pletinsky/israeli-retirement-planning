/**
 * Refreshes the built-in Israeli inflation table (`src/cpi/snapshot.ts`) from the Central Bureau of
 * Statistics. The app uses the table when the live request fails or is switched off. Run it from the
 * `app` folder, about once a year after the December figure is out (mid-January):
 *
 *   npm run cpi-data -- [--out src/cpi/snapshot.ts]
 */
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { cpiUrl, parseCpiResponse } from "../../src/cpi/format.ts";
import { decemberChanges, findProblem, renderSnapshot } from "./snapshot.ts";

// The series starts in September 1951, so its first full year of changes is 1952.
const FIRST_YEAR = 1951;

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { out: { type: "string", default: "src/cpi/snapshot.ts" } } });

  const response = await fetch(cpiUrl(FIRST_YEAR), { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}.`);
  const points = parseCpiResponse(await response.json());
  if (!points) throw new Error("The answer was not a consumer price index series.");

  const changes = decemberChanges(points);
  const now = new Date();
  const problem = findProblem(changes, now);
  if (problem) throw new Error(problem);

  await writeFile(values.out, renderSnapshot(changes, now.toISOString().slice(0, 10)));
  console.log(`Wrote ${changes.length} years (${changes[0][0]} to ${changes[changes.length - 1][0]}) to '${values.out}'.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
