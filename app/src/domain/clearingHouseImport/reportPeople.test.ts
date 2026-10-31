import { describe, expect, it } from "vitest";

import {
  addPerson,
  cleanFirstName,
  fingerprintPeople,
  samePerson,
  sharesKey,
  significantId,
} from "./reportPeople";
import type { ReportPerson } from "./types";

function person(overrides: Partial<ReportPerson> = {}): ReportPerson {
  return {
    idNumber: "000000018",
    firstName: "Dana",
    familyName: "Demo",
    birthDate: "19800320",
    age: 46,
    keys: [],
    ...overrides,
  };
}

describe("cleanFirstName", () => {
  it("trims and single-spaces a name and bounds its length", () => {
    expect(cleanFirstName("  Dana   Lee ")).toBe("Dana Lee");
    expect(cleanFirstName("x".repeat(100))).toHaveLength(40);
  });

  it("treats a missing or blank name as none", () => {
    expect(cleanFirstName(null)).toBeNull();
    expect(cleanFirstName("   ")).toBeNull();
  });
});

describe("significantId", () => {
  it("drops formatting and leading zeros", () => {
    expect(significantId("000000018")).toBe("18");
    expect(significantId("0-0000018")).toBe("18");
    expect(significantId("123456782")).toBe("123456782");
  });

  it("returns null when nothing significant is left", () => {
    expect(significantId("000000000")).toBeNull();
    expect(significantId("")).toBeNull();
    expect(significantId(null)).toBeNull();
  });
});

describe("samePerson", () => {
  it("lets the ID number decide, whatever the names say", () => {
    expect(samePerson(person({ idNumber: "000000018" }), person({ idNumber: "18", firstName: "Other" }))).toBe(true);
    expect(samePerson(person({ idNumber: "000000018" }), person({ idNumber: "000000026" }))).toBe(false);
  });

  it("compares names and birth date when an ID is missing on either side", () => {
    const noId = { idNumber: null };
    expect(samePerson(person(noId), person(noId))).toBe(true);
    expect(samePerson(person(noId), person({ firstName: "Omer" }))).toBe(false);
    expect(samePerson(person(noId), person({ birthDate: "19900101" }))).toBe(false);
  });

  it("does not count a part that is missing on one side against the match", () => {
    expect(samePerson(person({ idNumber: null, familyName: null }), person({ idNumber: null }))).toBe(true);
    expect(samePerson(person({ idNumber: null, birthDate: null }), person({ idNumber: null }))).toBe(true);
  });

  it("ignores quote marks, spacing and letter case in names", () => {
    const a = person({ idNumber: null, firstName: "Dana  Lee", familyName: "O'Neil" });
    const b = person({ idNumber: null, firstName: "dana lee", familyName: "ONeil" });
    expect(samePerson(a, b)).toBe(true);
  });
});

describe("addPerson", () => {
  it("adds a new person and copies it so the caller's keys are not shared", () => {
    const people: ReportPerson[] = [];
    const added = person({ keys: ["k"] });
    addPerson(people, added);
    expect(people).toHaveLength(1);
    expect(people[0].keys).not.toBe(added.keys);
  });

  it("merges the same person and fills what the first copy lacked", () => {
    const people = [person({ firstName: null, age: null })];
    addPerson(people, person({ idNumber: "18" }));
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ firstName: "Dana", age: 46 });
  });

  it("keeps different people apart", () => {
    const people = [person()];
    addPerson(people, person({ idNumber: "000000026" }));
    expect(people).toHaveLength(2);
  });
});

describe("sharesKey", () => {
  it("is true only when a fingerprint appears on both sides", () => {
    expect(sharesKey(["a", "b"], ["b", "c"])).toBe(true);
    expect(sharesKey(["a"], ["c"])).toBe(false);
    expect(sharesKey([], ["c"])).toBe(false);
  });
});

describe("fingerprintPeople", () => {
  it("gives the same person the same keys however the ID is written", async () => {
    const [a, b] = await fingerprintPeople([person({ idNumber: "000000018" }), person({ idNumber: "18" })]);
    expect(a.keys.length).toBeGreaterThan(0);
    expect(sharesKey(a.keys, b.keys)).toBe(true);
  });

  it("recognises a person by name and birth date when the ID differs or is missing", async () => {
    const [withId, withoutId] = await fingerprintPeople([person(), person({ idNumber: null })]);
    expect(sharesKey(withId.keys, withoutId.keys)).toBe(true);
  });

  it("gives different people different keys", async () => {
    const [a, b] = await fingerprintPeople([person(), person({ idNumber: "000000026", firstName: "Omer" })]);
    expect(sharesKey(a.keys, b.keys)).toBe(false);
  });

  it("keeps no ID, name or birth date in the keys", async () => {
    const [fingerprinted] = await fingerprintPeople([person()]);
    for (const key of fingerprinted.keys) {
      expect(key).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("gives no keys to a person with nothing to identify them by", async () => {
    const [empty] = await fingerprintPeople([person({ idNumber: null, firstName: null, familyName: null, birthDate: null })]);
    expect(empty.keys).toEqual([]);
  });
});
