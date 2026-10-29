import { ClearingHouseImportError } from "./errors";

/**
 * A plain, DOM-free copy of the report. The mapper works on this tree, so it
 * can be tested with hand-built trees and never touches browser types.
 */
export interface XmlNode {
  name: string;
  /** Trimmed text of a leaf element; empty for elements with children. */
  text: string;
  /** `xsi:nil="true"`: the element is present but carries no value. */
  nil: boolean;
  children: XmlNode[];
}

const MAX_NODES = 400_000;

export function node(name: string, children: XmlNode[] = [], text = "", nil = false): XmlNode {
  return { name, text, nil, children };
}

/** Parses XML text into a plain tree. Throws `invalidXml` for malformed input. */
export function parseXmlToTree(xml: string): XmlNode {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName === "parsererror" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new ClearingHouseImportError("invalidXml");
  }
  return convert(root, { remaining: MAX_NODES });
}

function convert(element: Element, budget: { remaining: number }): XmlNode {
  if (--budget.remaining < 0) throw new ClearingHouseImportError("tooLarge");
  const children: XmlNode[] = [];
  for (const child of Array.from(element.children)) {
    children.push(convert(child, budget));
  }
  const nil = Array.from(element.attributes).some(
    (attribute) => attribute.localName === "nil" && attribute.value.trim().toLowerCase() === "true",
  );
  return {
    name: element.localName,
    text: children.length === 0 ? (element.textContent ?? "").trim() : "",
    nil,
    children,
  };
}

export function kids(parent: XmlNode | undefined, name: string): XmlNode[] {
  return parent ? parent.children.filter((child) => child.name === name) : [];
}

export function kid(parent: XmlNode | undefined, name: string): XmlNode | undefined {
  return kids(parent, name)[0];
}

/** Follows a path, taking the first match at each step. */
export function at(parent: XmlNode | undefined, ...path: string[]): XmlNode | undefined {
  let current = parent;
  for (const name of path) {
    current = kid(current, name);
    if (!current) return undefined;
  }
  return current;
}

/** All nodes at the end of a path, fanning out wherever an element repeats. */
export function allAt(parent: XmlNode | undefined, ...path: string[]): XmlNode[] {
  let level = parent ? [parent] : [];
  for (const name of path) {
    level = level.flatMap((n) => kids(n, name));
  }
  return level;
}

/** Text of a leaf, or null when it is absent, nil or empty. */
export function textOf(n: XmlNode | undefined): string | null {
  if (!n || n.nil || n.text === "") return null;
  return n.text;
}

export function textAt(parent: XmlNode | undefined, ...path: string[]): string | null {
  return textOf(at(parent, ...path));
}

export function numberOf(n: XmlNode | undefined): number | null {
  const text = textOf(n);
  if (text === null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function numberAt(parent: XmlNode | undefined, ...path: string[]): number | null {
  return numberOf(at(parent, ...path));
}
