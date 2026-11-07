import { vi } from "vitest";

/**
 * Replaces the browser's file download so a test can count how many files the app offered.
 * Call `restore()` when done (an `afterEach` is the usual place).
 */
export function stubDownloads() {
  const original = {
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  };
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
  const clicks = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return {
    /** The number of downloads started so far. */
    count: () => clicks.mock.calls.length,
    restore: () => {
      clicks.mockRestore();
      URL.createObjectURL = original.createObjectURL;
      URL.revokeObjectURL = original.revokeObjectURL;
    },
  };
}
