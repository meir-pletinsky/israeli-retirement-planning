/**
 * Encryption of the backup files, so a cloud provider that syncs the backup folder can't read the plan.
 * The key comes from a passphrase the user chooses (PBKDF2), the file is sealed with AES-GCM, and a wrong
 * passphrase shows up as a failed authentication, so no separate check value is stored.
 */

import type { EncryptedSnapshot, EncryptionHeader } from "./snapshotFile";

export const PBKDF2_ITERATIONS = 600_000;

/** A file asking for more than this would only be there to make the browser spin. */
const MAX_ITERATIONS = 5_000_000;

export type CryptoErrorCode = "wrongPassphrase" | "passphraseNeeded" | "unsupported" | "invalid";

export class SnapshotCryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = "SnapshotCryptoError";
    this.code = code;
  }
}

/** A key derived from the passphrase, with what another device needs to derive the same one. */
export interface VaultKey {
  /** Base64. */
  salt: string;
  iterations: number;
  /** Not extractable, so the passphrase can be dropped and this kept on the device. */
  key: CryptoKey;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function subtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new SnapshotCryptoError("unsupported", "Encryption is not available in this browser.");
  }
  return crypto.subtle;
}

/**
 * Derives the key for a passphrase. Without `salt` this starts a new vault with a fresh one; with the
 * salt and iterations from an existing backup's header it gives the key that backup was sealed with.
 */
export async function deriveVaultKey(
  passphrase: string,
  existing?: { salt: string; iterations: number },
  options: { iterations?: number } = {},
): Promise<VaultKey> {
  const iterations = existing?.iterations ?? options.iterations ?? PBKDF2_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
    throw new SnapshotCryptoError("invalid", "The backup asks for an unreasonable amount of key stretching.");
  }
  const saltBytes = existing ? fromBase64(existing.salt) : crypto.getRandomValues(new Uint8Array(16));

  const material = await subtle().importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { salt: toBase64(saltBytes), iterations, key };
}

/** Whether a backup was sealed with a key derived the way this vault's was, so the key can try to open it. */
export function vaultFits(vault: VaultKey, header: EncryptionHeader): boolean {
  return vault.salt === header.salt && vault.iterations === header.iterations;
}

/** Seals the payload for the backup with the given id. The id is authenticated, so a file can't be passed off as another. */
export async function encryptPayload(
  vault: VaultKey,
  id: string,
  payload: Record<string, unknown>,
): Promise<Pick<EncryptedSnapshot, "encryption" | "data">> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
    vault.key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    encryption: {
      alg: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: vault.iterations,
      salt: vault.salt,
      iv: toBase64(iv),
    },
    data: toBase64(new Uint8Array(sealed)),
  };
}

/** Opens a backup; throws a {@link SnapshotCryptoError} with `wrongPassphrase` when the key does not fit it. */
export async function decryptPayload(vault: VaultKey, envelope: EncryptedSnapshot): Promise<Record<string, unknown>> {
  if (!vaultFits(vault, envelope.encryption)) {
    throw new SnapshotCryptoError("wrongPassphrase", "The backup was sealed with a different passphrase.");
  }
  let opened: ArrayBuffer;
  try {
    opened = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(envelope.encryption.iv),
        additionalData: new TextEncoder().encode(envelope.id),
      },
      vault.key,
      fromBase64(envelope.data),
    );
  } catch {
    throw new SnapshotCryptoError("wrongPassphrase", "The passphrase does not open this backup.");
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(opened));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new SnapshotCryptoError("invalid", "The backup opened but its content is not readable.");
  }
}
