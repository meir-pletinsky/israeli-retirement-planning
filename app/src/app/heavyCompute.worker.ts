import { runHeavyTask, type HeavyRequest, type HeavyResponse } from "../domain/heavyTasks";

// The Web Worker that runs the slow simulations off the main thread (see `heavyCompute.ts`).
self.addEventListener("message", (event: MessageEvent<HeavyRequest>) => {
  const { id, task, profile, args } = event.data;
  let response: HeavyResponse;
  try {
    response = { id, ok: true, result: runHeavyTask(task, profile, args as never) };
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
});
