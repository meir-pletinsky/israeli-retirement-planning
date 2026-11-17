import { describe, expect, it } from "vitest";

import { decryptPayload, deriveVaultKey, encryptPayload, SnapshotCryptoError, vaultFits } from "./snapshotCrypto";
import type { EncryptedSnapshot } from "./snapshotFile";

const FAST = { iterations: 1000 };
const ID = "20260615T102030456Z-abcd1234";
const PAYLOAD = { personal: { age: 50 }, note: "שלום ☂" };

function envelopeFor(sealed: Awaited<ReturnType<typeof encryptPayload>>, id = ID): EncryptedSnapshot {
  return {
    app: "israeli-retirement-planning",
    format: 1,
    id,
    savedAt: "2026-06-15T10:20:30.456Z",
    deviceId: "abcd1234",
    deviceLabel: "Edge on Windows",
    parentId: null,
    ...sealed,
  };
}

describe("snapshot encryption", () => {
  it("opens with the passphrase it was sealed with, on another device that only has the file's header", async () => {
    const vault = await deriveVaultKey("correct horse", undefined, FAST);
    const envelope = envelopeFor(await encryptPayload(vault, ID, PAYLOAD));

    const otherDevice = await deriveVaultKey("correct horse", envelope.encryption);

    expect(await decryptPayload(otherDevice, envelope)).toEqual(PAYLOAD);
  });

  it("does not hold the plan in the clear", async () => {
    const vault = await deriveVaultKey("correct horse", undefined, FAST);

    const sealed = await encryptPayload(vault, ID, PAYLOAD);

    expect(JSON.stringify(sealed)).not.toContain("personal");
  });

  it("reports a wrong passphrase", async () => {
    const vault = await deriveVaultKey("correct horse", undefined, FAST);
    const envelope = envelopeFor(await encryptPayload(vault, ID, PAYLOAD));
    const wrong = await deriveVaultKey("battery staple", envelope.encryption);

    await expect(decryptPayload(wrong, envelope)).rejects.toMatchObject({ code: "wrongPassphrase" });
  });

  it("does not open a file passed off under another id", async () => {
    const vault = await deriveVaultKey("correct horse", undefined, FAST);
    const envelope = envelopeFor(await encryptPayload(vault, ID, PAYLOAD), "20260615T102030457Z-abcd1234");

    await expect(decryptPayload(vault, envelope)).rejects.toBeInstanceOf(SnapshotCryptoError);
  });

  it("uses a new IV for every file but keeps the vault's salt", async () => {
    const vault = await deriveVaultKey("correct horse", undefined, FAST);

    const first = await encryptPayload(vault, ID, PAYLOAD);
    const second = await encryptPayload(vault, ID, PAYLOAD);

    expect(first.encryption.iv).not.toBe(second.encryption.iv);
    expect(first.encryption.salt).toBe(second.encryption.salt);
    expect(vaultFits(vault, first.encryption)).toBe(true);
  });

  it("refuses a file that asks for absurd key stretching", async () => {
    await expect(deriveVaultKey("x", { salt: "c2FsdHNhbHRzYWx0cw==", iterations: 2_000_000_000 })).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("survives being copied into the browser's database, so the passphrase need not be kept", async () => {
    const vault = await deriveVaultKey("correct horse", undefined, FAST);
    const copy = structuredClone(vault);
    const envelope = envelopeFor(await encryptPayload(vault, ID, PAYLOAD));

    expect(await decryptPayload(copy, envelope)).toEqual(PAYLOAD);
  });
});
