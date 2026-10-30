/**
 * Incremental CSV reader (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes).
 * The prices file has millions of rows, so text is fed in chunks and each record is handed to
 * `onRecord` as soon as it is complete.
 */
export interface CsvParser {
  write(chunk: string): void;
  /** Flushes the last record when the text does not end with a line break. */
  end(): void;
}

export function createCsvParser(onRecord: (record: string[]) => void): CsvParser {
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  // A quote seen inside a quoted field is either closing it or the first of a doubled quote.
  let pendingQuote = false;
  let pendingReturn = false;
  let recordHasContent = false;

  function endField() {
    fields.push(field);
    field = "";
  }

  function endRecord() {
    // A blank line produces no record.
    if (recordHasContent || fields.length > 0 || field !== "") {
      endField();
      onRecord(fields);
    }
    fields = [];
    recordHasContent = false;
  }

  function writeChar(char: string) {
    if (pendingReturn) {
      pendingReturn = false;
      if (char === "\n") return;
    }
    if (pendingQuote) {
      pendingQuote = false;
      if (char === '"') {
        field += '"';
        return;
      }
      inQuotes = false;
    }

    if (inQuotes) {
      if (char === '"') pendingQuote = true;
      else field += char;
      return;
    }

    switch (char) {
      case '"':
        inQuotes = true;
        recordHasContent = true;
        break;
      case ",":
        recordHasContent = true;
        endField();
        break;
      case "\r":
        pendingReturn = true;
        endRecord();
        break;
      case "\n":
        endRecord();
        break;
      default:
        recordHasContent = true;
        field += char;
    }
  }

  return {
    write(chunk) {
      for (let i = 0; i < chunk.length; i++) writeChar(chunk[i]);
    },
    end() {
      pendingQuote = false;
      pendingReturn = false;
      inQuotes = false;
      endRecord();
    },
  };
}

/** Parses a whole (small) CSV text into records. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  const parser = createCsvParser((record) => records.push(record));
  parser.write(text);
  parser.end();
  return records;
}
