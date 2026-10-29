import { ClearingHouseImportError } from "./errors";

/** Limits that keep a mistaken or hostile archive from exhausting the browser's memory. */
export const MAX_REPORT_FILES = 50;
export const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export interface ReportSource {
  /** Decoded XML documents. File names are deliberately not kept: they contain the holder's ID. */
  xmlTexts: string[];
  /** Files that were read past without use (PDFs, spreadsheets, and so on). */
  ignoredFiles: number;
}

export interface ReadOptions {
  /** Only needed for a password-protected zip. Held by the caller just long enough to call this. */
  password?: string;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Reads the report from XML files and/or a zip archive of them. */
export async function readReportFiles(files: File[], options: ReadOptions = {}): Promise<ReportSource> {
  if (files.length === 0) throw new ClearingHouseImportError("noFiles");
  if (files.length > MAX_REPORT_FILES) throw new ClearingHouseImportError("tooManyFiles");

  const xmlTexts: string[] = [];
  let ignoredFiles = 0;
  let totalBytes = 0;

  for (const file of files) {
    if (file.size > MAX_TOTAL_BYTES) throw new ClearingHouseImportError("tooLarge");
    const bytes = await readBytes(file);
    if (isZip(bytes)) {
      const archive = await readArchive(bytes, options.password);
      xmlTexts.push(...archive.xmlTexts);
      ignoredFiles += archive.ignoredFiles;
      totalBytes += archive.totalBytes;
    } else if (/\.xml$/i.test(file.name)) {
      totalBytes += bytes.byteLength;
      xmlTexts.push(decodeXml(bytes));
    } else {
      ignoredFiles++;
    }
    if (totalBytes > MAX_TOTAL_BYTES) throw new ClearingHouseImportError("tooLarge");
  }

  if (xmlTexts.length === 0) throw new ClearingHouseImportError("noXmlFiles");
  if (xmlTexts.length > MAX_REPORT_FILES) throw new ClearingHouseImportError("tooManyFiles");
  return { xmlTexts, ignoredFiles };
}

function isZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((value, index) => bytes[index] === value);
}

async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Decodes as UTF-8 unless the XML declaration names another encoding the browser knows. */
export function decodeXml(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const declared = /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  if (declared && declared !== "utf-8" && declared !== "utf8") {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Unknown label: fall through to UTF-8.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
}

interface ArchiveContents extends ReportSource {
  totalBytes: number;
}

async function readArchive(bytes: Uint8Array, password: string | undefined): Promise<ArchiveContents> {
  const zip = await import("@zip.js/zip.js");
  zip.configure({ useWebWorkers: false });

  let reader: InstanceType<typeof zip.ZipReader<Uint8Array>>;
  let entries: Awaited<ReturnType<typeof reader.getEntries>>;
  try {
    reader = new zip.ZipReader(new zip.Uint8ArrayReader(bytes));
    entries = await reader.getEntries();
  } catch {
    throw new ClearingHouseImportError("unreadableArchive");
  }

  const xmlTexts: string[] = [];
  let ignoredFiles = 0;
  let totalBytes = 0;
  const wrongPasswordErrors = new Set([
    zip.ERR_INVALID_PASSWORD,
    zip.ERR_INVALID_CRC32,
    zip.ERR_INVALID_AUTHENTICATION_CODE,
    zip.ERR_INVALID_COMPRESSED_DATA,
  ]);

  try {
    for (const entry of entries) {
      if (entry.directory) continue;
      const name = entry.filename.replace(/\\/g, "/");
      const baseName = name.slice(name.lastIndexOf("/") + 1);
      if (!/\.xml$/i.test(baseName) || name.startsWith("__MACOSX/") || baseName.startsWith("._")) {
        ignoredFiles++;
        continue;
      }
      if (entry.encrypted && !password) throw new ClearingHouseImportError("passwordRequired");
      if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new ClearingHouseImportError("tooLarge");
      if (xmlTexts.length >= MAX_REPORT_FILES) throw new ClearingHouseImportError("tooManyFiles");

      let data: Uint8Array;
      try {
        data = await entry.getData(new zip.Uint8ArrayWriter(), { password, checkSignature: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (entry.encrypted && wrongPasswordErrors.has(message)) {
          throw new ClearingHouseImportError("wrongPassword");
        }
        if (message === zip.ERR_ENCRYPTED) throw new ClearingHouseImportError("passwordRequired");
        throw new ClearingHouseImportError("unreadableArchive");
      }
      totalBytes += data.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) throw new ClearingHouseImportError("tooLarge");
      xmlTexts.push(decodeXml(data));
    }
  } finally {
    await reader.close().catch(() => undefined);
  }
  return { xmlTexts, ignoredFiles, totalBytes };
}
