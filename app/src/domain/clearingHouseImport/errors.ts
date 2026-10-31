export type ClearingHouseImportErrorCode =
  | "noFiles"
  | "noXmlFiles"
  | "tooManyFiles"
  | "tooLarge"
  | "passwordRequired"
  | "wrongPassword"
  | "unreadableArchive"
  | "invalidXml"
  | "notClearingHouseReport"
  | "noAccounts"
  | "sampleUnavailable";

/** A failure the import page explains to the user in their language. */
export class ClearingHouseImportError extends Error {
  readonly code: ClearingHouseImportErrorCode;

  constructor(code: ClearingHouseImportErrorCode) {
    super(code);
    this.name = "ClearingHouseImportError";
    this.code = code;
  }
}
