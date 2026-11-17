import { describe, expect, it } from "vitest";

import { describeDevice } from "./deviceLabel";

describe("describeDevice", () => {
  it("names Edge before Chrome, since Edge's user agent says both", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("names Chrome on Android and on a Mac", () => {
    expect(
      describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36"),
    ).toBe("Chrome on Android");
    expect(
      describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"),
    ).toBe("Chrome on Mac");
  });

  it("falls back to something readable", () => {
    expect(describeDevice("")).toBe("Browser");
  });
});
