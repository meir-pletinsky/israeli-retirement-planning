import { describe, expect, it } from "vitest";

describe("test infrastructure smoke test", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
