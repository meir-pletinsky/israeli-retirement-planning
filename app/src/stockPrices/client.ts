import {
  INDEX_FILE_NAME,
  STOCK_DATA_DIR,
  isStockHistoryFile,
  isStockIndexFile,
  normalizeSymbol,
  symbolFileName,
  type StockHistoryFile,
  type StockIndexFile,
} from "./format";

/**
 * Reads the price files that the daily data job publishes next to the app. Every failure (offline,
 * file missing, the host answering a missing file with a web page) gives `null`: prices are a
 * convenience, and the form works without them.
 */

function dataUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}${STOCK_DATA_DIR}/${fileName}`;
}

async function fetchJson<T>(url: string, isValid: (value: unknown) => value is T): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isValid(data) ? data : null;
  } catch {
    return null;
  }
}

// Successful loads are kept for the session; a failed one is tried again the next time.
let indexRequest: Promise<StockIndexFile | null> | null = null;
const historyRequests = new Map<string, Promise<StockHistoryFile | null>>();

export function loadStockIndex(): Promise<StockIndexFile | null> {
  if (!indexRequest) {
    const request = fetchJson(dataUrl(INDEX_FILE_NAME), isStockIndexFile);
    indexRequest = request;
    void request.then((result) => {
      if (!result && indexRequest === request) indexRequest = null;
    });
  }
  return indexRequest;
}

export function loadStockHistory(rawSymbol: string): Promise<StockHistoryFile | null> {
  const symbol = normalizeSymbol(rawSymbol);
  let request = historyRequests.get(symbol);
  if (!request) {
    const created = fetchJson(dataUrl(symbolFileName(symbol)), isStockHistoryFile);
    request = created;
    historyRequests.set(symbol, created);
    void created.then((result) => {
      if (!result && historyRequests.get(symbol) === created) historyRequests.delete(symbol);
    });
  }
  return request;
}

/** For tests: forget everything loaded so far. */
export function resetStockPriceCache(): void {
  indexRequest = null;
  historyRequests.clear();
}
