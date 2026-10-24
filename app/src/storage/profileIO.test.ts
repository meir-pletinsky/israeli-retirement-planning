import { describe, expect, it, vi } from "vitest";

import { EMPTY_PROFILE, type ProfileData } from "../types";
import { exportProfileToFile, importProfileFromFile } from "./profileIO";

function makeJsonFile(content: string, name = "profile.json"): File {
  return new File([content], name, { type: "application/json" });
}

describe("importProfileFromFile", () => {
  it("parses and normalizes a valid profile export", async () => {
    const profile: ProfileData = {
      ...EMPTY_PROFILE,
      personal: { ...EMPTY_PROFILE.personal, age: 42 },
    };
    const file = makeJsonFile(JSON.stringify(profile));

    const result = await importProfileFromFile(file);

    expect(result.personal.age).toBe(42);
    expect(result.pensionSavings.accounts).toEqual([]);
  });

  it("fills in missing fields with defaults", async () => {
    const file = makeJsonFile(JSON.stringify({ personal: { age: 30 } }));

    const result = await importProfileFromFile(file);

    expect(result.personal.age).toBe(30);
    expect(result.equity).toEqual(EMPTY_PROFILE.equity);
    expect(result.assumptions).toEqual(EMPTY_PROFILE.assumptions);
  });

  it("rejects invalid JSON", async () => {
    const file = makeJsonFile("not json");

    await expect(importProfileFromFile(file)).rejects.toThrow();
  });

  it("rejects JSON that doesn't look like a profile export", async () => {
    const file = makeJsonFile(JSON.stringify({ foo: "bar" }));

    await expect(importProfileFromFile(file)).rejects.toThrow();
  });

  it("rejects a JSON array", async () => {
    const file = makeJsonFile(JSON.stringify([1, 2, 3]));

    await expect(importProfileFromFile(file)).rejects.toThrow();
  });
});

describe("exportProfileToFile", () => {
  it("triggers a download via an anchor click", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    exportProfileToFile(EMPTY_PROFILE);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
