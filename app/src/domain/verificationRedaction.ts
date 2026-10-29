/**
 * Redaction for the verification pack.
 *
 * The pack goes to a reviewer, so it must not carry anything that identifies
 * an account or a person. Two rules:
 *
 * 1. Allow-list. Numbers, booleans and null are always kept. A text value is
 *    kept only when its field is a known enum or date field and the value
 *    looks like one; every other text value (provider, policy number, fund
 *    id, track, ticker, company, broker, notes, and any field added later) is
 *    replaced by `[redacted]`.
 * 2. Ids. Account, holding and vesting-tranche ids are replaced by short
 *    aliases everywhere they occur in the pack: the inputs, the trace's step
 *    ids, source paths, table labels and cells. A separate, local-only key
 *    maps every alias back to the real id and to the details that were
 *    redacted, so the owner can find the account behind a figure.
 */

import type { PensionAccount, ProfileData, StockHolding } from "../types";
import type { TraceLog } from "./trace";

export const REDACTED_TEXT = "[redacted]";

/** Text fields whose value is an enum, so it carries no personal detail. */
const ENUM_KEYS = new Set([
  "owner",
  "productCategory",
  "legacyPolicyModel",
  "accountStatus",
  "annuityTaxType",
  "investmentCategory",
  "taxTrack",
  "gender",
  "maritalStatus",
  "preset",
]);

/** Text fields that hold a calendar date. */
const DATE_KEYS = new Set(["joinDate", "liquidityDate", "grantDate", "purchaseDate", "vestDate"]);

const ENUM_VALUE = /^[A-Za-z0-9_-]{1,40}$/;
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

/** Shorter text could match ordinary words, so it is not searched for in the leak check. */
const MIN_LEAK_TEXT_LENGTH = 6;
const MIN_LEAK_ID_LENGTH = 4;

function keepsText(key: string, value: string): boolean {
  if (ENUM_KEYS.has(key)) return ENUM_VALUE.test(value);
  if (DATE_KEYS.has(key)) return DATE_VALUE.test(value);
  return false;
}

/** Real id to alias: `acct1`, `holding1`, `tranche1`, numbered in the order they appear in the inputs. */
export function buildIdAliases(profile: ProfileData): Map<string, string> {
  const aliases = new Map<string, string>();
  const add = (id: string, prefix: string, counter: number): number => {
    if (id === "" || aliases.has(id)) return counter;
    aliases.set(id, `${prefix}${counter}`);
    return counter + 1;
  };
  let accounts = 1;
  let holdings = 1;
  let tranches = 1;
  for (const account of profile.pensionSavings.accounts) {
    accounts = add(account.id, "acct", accounts);
  }
  for (const holding of profile.equity.holdings) {
    holdings = add(holding.id, "holding", holdings);
    for (const tranche of holding.employerGrantDetails.vestingTranches) {
      tranches = add(tranche.id, "tranche", tranches);
    }
  }
  return aliases;
}

function redactNode(value: unknown, key: string, aliases: ReadonlyMap<string, string>): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "") return value;
    if (key === "id") return aliases.get(value) ?? REDACTED_TEXT;
    return keepsText(key, value) ? value : REDACTED_TEXT;
  }
  if (Array.isArray(value)) return value.map((item) => redactNode(item, key, aliases));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [name, redactNode(entry, name, aliases)]),
    );
  }
  return null;
}

/** The saved inputs with ids aliased and every non-enum, non-date text replaced. Same shape as the original. */
export function redactProfile(profile: ProfileData, aliases: ReadonlyMap<string, string>): unknown {
  return redactNode(profile, "", aliases);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A function that replaces every real id found in a text by its alias, longest id first. */
export function aliasReplacer(aliases: ReadonlyMap<string, string>): (text: string) => string {
  if (aliases.size === 0) return (text) => text;
  const pattern = new RegExp(
    [...aliases.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|"),
    "g",
  );
  return (text) => text.replace(pattern, (id) => aliases.get(id) ?? id);
}

/** Replaces ids in every string of a trace: step ids, sources, labels, table cells, and object keys. */
export function redactLog(log: TraceLog, aliases: ReadonlyMap<string, string>): TraceLog {
  const replace = aliasReplacer(aliases);
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return replace(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([name, entry]) => [replace(name), walk(entry)]));
    }
    return value;
  };
  return walk(log) as TraceLog;
}

// ---------------------------------------------------------------------------
// The local-only key
// ---------------------------------------------------------------------------

export interface RedactionKeyEntry {
  alias: string;
  kind: "account" | "holding" | "tranche";
  id: string;
  /** What was redacted for this item: provider, policy number, and so on. Empty when nothing was set. */
  details: Record<string, string>;
}

export interface RedactionKey {
  format: "retirement-planning-redaction-key";
  formatVersion: 1;
  warning: string;
  /** The `evaluatedAt` of the pack this key belongs to. */
  packEvaluatedAt: string;
  entries: RedactionKeyEntry[];
}

function present(details: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(details).filter(([, text]) => text !== ""));
}

function accountDetails(account: PensionAccount): Record<string, string> {
  return present({
    owner: account.owner,
    providerName: account.providerName,
    policyNumber: account.policyNumber,
    fundId: account.fundId,
    productCategory: account.productCategory ?? "",
    investmentTrackName: account.investmentAndFees.investmentTrackName,
  });
}

function holdingDetails(holding: StockHolding): Record<string, string> {
  return present({
    investmentCategory: holding.investmentCategory ?? "",
    tickerSymbol: holding.tickerSymbol,
    companyName: holding.companyName,
    custodianOrBroker: holding.custodianOrBroker,
  });
}

/** Maps every alias back to the real id and the redacted details. Never share it with the pack. */
export function buildRedactionKey(
  profile: ProfileData,
  aliases: ReadonlyMap<string, string>,
  packEvaluatedAt: string,
): RedactionKey {
  const entries: RedactionKeyEntry[] = [];
  const add = (kind: RedactionKeyEntry["kind"], id: string, details: Record<string, string>) => {
    const alias = aliases.get(id);
    if (alias !== undefined) entries.push({ alias, kind, id, details });
  };
  for (const account of profile.pensionSavings.accounts) add("account", account.id, accountDetails(account));
  for (const holding of profile.equity.holdings) {
    add("holding", holding.id, holdingDetails(holding));
    for (const tranche of holding.employerGrantDetails.vestingTranches) add("tranche", tranche.id, {});
  }
  return {
    format: "retirement-planning-redaction-key",
    formatVersion: 1,
    warning:
      "Keep this file on your own computer. It names the accounts behind the aliases in the verification pack. Do not send it to a reviewer or an AI service.",
    packEvaluatedAt,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Leak check
// ---------------------------------------------------------------------------

/** Texts of the inputs that must not reach the pack: real ids and every redacted text of useful length. */
export function collectSensitiveTexts(profile: ProfileData): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, key: string): void => {
    if (typeof value === "string") {
      if (key === "id") {
        if (value.length >= MIN_LEAK_ID_LENGTH) found.add(value);
      } else if (value.length >= MIN_LEAK_TEXT_LENGTH && !keepsText(key, value)) {
        found.add(value);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key));
    } else if (value !== null && typeof value === "object") {
      for (const [name, entry] of Object.entries(value)) walk(entry, name);
    }
  };
  walk(profile, "");
  return [...found];
}

/**
 * Where, in the machine-readable parts of a pack, one of `sensitive` still
 * appears. Titles, formulas and notes are fixed text written in the engine
 * and are not searched: a provider called "pension" would otherwise match
 * every sentence that uses the word. The matched text is not reported.
 */
export function findLeaks(
  pack: { inputs: unknown; trace: Pick<TraceLog, "steps" | "tables"> },
  sensitive: readonly string[],
): string[] {
  if (sensitive.length === 0) return [];
  const leaks: string[] = [];
  const hits = (text: string): boolean => sensitive.some((needle) => text.includes(needle));
  const scan = (value: unknown, where: string): void => {
    if (typeof value === "string") {
      if (hits(value)) leaks.push(where);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => scan(item, `${where}[${index}]`));
    } else if (value !== null && typeof value === "object") {
      for (const [name, entry] of Object.entries(value)) {
        if (hits(name)) leaks.push(`${where} (a key)`);
        scan(entry, `${where}.${name}`);
      }
    }
  };
  scan(pack.inputs, "inputs");
  pack.trace.steps.forEach((step, index) => {
    const where = `trace.steps[${index}]`;
    scan(step.id, `${where}.id`);
    scan(step.output, `${where}.output`);
    for (const [name, entry] of Object.entries(step.inputs)) {
      scan(entry.from, `${where}.inputs.${name}.from`);
      scan(entry.value, `${where}.inputs.${name}.value`);
    }
  });
  pack.trace.tables.forEach((table, index) => {
    const where = `trace.tables[${index}]`;
    scan(table.id, `${where}.id`);
    scan(table.columns, `${where}.columns`);
    scan(table.rows, `${where}.rows`);
  });
  return leaks;
}
