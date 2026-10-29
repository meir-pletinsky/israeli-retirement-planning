import { node, type XmlNode } from "../../../domain/clearingHouseImport/xmlTree";

/** Invented values only: nothing here comes from a real report. */
export const HOLDER_ID = "000000018";
export const PROVIDER_NAME = "קרן לדוגמה בע\"מ";
export const EMPLOYER_NAME = "מעסיק לדוגמה";

export function leaf(name: string, value: string | number | null | undefined): XmlNode {
  return value === null ? node(name, [], "", true) : node(name, [], String(value));
}

export function el(name: string, ...children: (XmlNode | undefined | false)[]): XmlNode {
  return node(name, children.filter((child): child is XmlNode => Boolean(child)));
}

/** A leaf that is skipped entirely when the value is undefined (absent element), nil when null. */
function opt(name: string, value: string | number | null | undefined): XmlNode | undefined {
  return value === undefined ? undefined : leaf(name, value);
}

export interface DepositRow {
  type: number;
  depositor?: number;
  percent?: number | null;
  amount?: number | null;
}

export interface BalanceRow {
  deposit?: number | null;
  kind?: number;
  total: number | null;
}

export interface FeeRow {
  basis: number | null;
  rate: number | null;
}

export interface TrackRow {
  role: number | null;
  name: string | null;
  amount?: number | null;
}

export interface CoverageSpec {
  basicDeath?: number | null;
  pensionDisability?: number | null;
  blocks?: { type: number; amount: number | null }[];
}

export interface ProjectionSpec {
  age: number;
  accumulation?: number | null;
  kupot?: { zikna?: number | null; hodshit?: number | null }[];
}

export interface PolicyOptions {
  number?: string | null;
  status?: number | null;
  kerenType?: number | null;
  vatika?: number | null;
  policyType?: number | null;
  plan?: string | null;
  joinDate?: string | null;
  valuation?: string | null;
  salary?: number | null;
  balances?: BalanceRow[];
  unlockDates?: string[];
  deposits?: DepositRow[];
  feeRows?: FeeRow[];
  monthlyAccumulationFee?: number | null;
  actualDepositFee?: number | null;
  riskCost?: number | null;
  tracks?: TrackRow[];
  coverages?: CoverageSpec[];
  projections?: ProjectionSpec[];
  /** Leaves the whole balance block out. */
  noBalanceBlock?: boolean;
}

export function policy(options: PolicyOptions = {}): XmlNode {
  const {
    number = "5550001",
    status = 1,
    kerenType = 2,
    vatika = 2,
    policyType,
    plan = "תוכנית לדוגמה",
    joinDate = "20200115",
    valuation = "20260531",
    salary = 20000,
    balances = [{ deposit: 2, total: 100000 }],
    unlockDates = [],
    deposits = [],
    feeRows = [],
    monthlyAccumulationFee,
    actualDepositFee,
    riskCost,
    tracks = [],
    coverages = [],
    projections = [],
    noBalanceBlock = false,
  } = options;

  const yitrot = noBalanceBlock
    ? undefined
    : el(
        "BlockItrot",
        el(
          "Yitrot",
          ...balances.map((row) =>
            el(
              "PerutYitrot",
              leaf("KOD-SUG-HAFRASHA", row.deposit ?? 2),
              leaf("KOD-SUG-ITRA", row.kind ?? 1),
              leaf("TOTAL-CHISACHON-MTZBR", row.total),
            ),
          ),
          leaf("TAARICH-ERECH-TZVIROT", valuation),
          ...unlockDates.map((date) => el("NesilutTag", leaf("MOED-NEZILUT-TAGMULIM", date))),
        ),
      );

  return el(
    "HeshbonOPolisa",
    opt("MISPAR-POLISA-O-HESHBON", number),
    leaf("STATUS-POLISA-O-CHESHBON", status),
    opt("SUG-KEREN-PENSIA", kerenType),
    opt("PENSIA-VATIKA-O-HADASHA", vatika),
    opt("SUG-POLISA", policyType),
    opt("SHEM-TOCHNIT", plan),
    opt("TAARICH-HITZTARFUT-MUTZAR", joinDate),
    opt("TAARICH-NECHONUT", valuation),
    el(
      "PirteiTaktziv",
      yitrot,
      ...deposits.map((row) =>
        el(
          "PerutHafrashotLePolisa",
          leaf("SUG-HAFRASHA", row.type),
          leaf("SUG-HAMAFKID", row.depositor ?? 2),
          opt("ACHUZ-HAFRASHA", row.percent),
          opt("SCHUM-HAFRASHA", row.amount),
        ),
      ),
      el("PirteiHaasaka", leaf("SACHAR-POLISA", salary)),
      el(
        "PerutHotzaot",
        el(
          "MivneDmeiNihul",
          ...feeRows.map((row) =>
            el("PerutMivneDmeiNihul", leaf("SUG-HOTZAA", row.basis), leaf("SHEUR-DMEI-NIHUL", row.rate)),
          ),
        ),
        el(
          "HotzaotBafoalLehodeshDivoach",
          opt("SHEUR-DMEI-NIHUL-TZVIRA", monthlyAccumulationFee),
          opt("SHEUR-DMEI-NIHUL-HAFKADA", actualDepositFee),
          opt("SACH-DMEI-BITUAH-SHENIGBOO", riskCost),
        ),
      ),
      ...tracks.map((row) =>
        el(
          "PerutMasluleiHashkaa",
          leaf("KOD-SUG-MASLUL", row.role),
          leaf("SHEM-MASLUL-HASHKAA", row.name),
          opt("SCHUM-TZVIRA-BAMASLUL", row.amount),
        ),
      ),
    ),
    ...projections.map((projection) =>
      el(
        "YitraLefiGilPrisha",
        leaf("GIL-PRISHA", projection.age),
        opt("TOTAL-CHISACHON-MITZTABER-TZAFUY", projection.accumulation),
        el(
          "Kupot",
          ...(projection.kupot ?? []).map((fund) =>
            el("Kupa", opt("SCHUM-KITZVAT-ZIKNA", fund.zikna), opt("KITZVAT-HODSHIT-TZFUYA", fund.hodshit)),
          ),
        ),
      ),
    ),
    coverages.length > 0 &&
      el(
        "Kisuim",
        ...coverages.map((cover) =>
          el(
            "ZihuiKisui",
            cover.basicDeath !== undefined && el("SchumeiBituahYesodi", leaf("SCHUM-BITUAH-LEMAVET", cover.basicDeath)),
            cover.pensionDisability !== undefined &&
              el("KisuiBKerenPensia", leaf("SACH-PENSIAT-NECHUT", cover.pensionDisability)),
            ...(cover.blocks ?? []).map((block) =>
              el("PirteiKisuiBeMutzar", leaf("SUG-KISUY-BITOCHI", block.type), leaf("SCHUM-BITUACH", block.amount)),
            ),
          ),
        ),
      ),
  );
}

export interface HolderOptions {
  id?: string;
  gender?: number | null;
  marital?: number | null;
  birthDate?: string | null;
}

export interface ProductOptions {
  type?: number | null;
  employer?: string | null;
  holder?: HolderOptions;
}

export function product(options: ProductOptions, ...policies: XmlNode[]): XmlNode {
  const { type = 2, employer = EMPLOYER_NAME, holder = {} } = options;
  const { id = HOLDER_ID, gender = 1, marital = 2, birthDate = "19800320" } = holder;
  return el(
    "Mutzar",
    el(
      "NetuneiMutzar",
      leaf("SUG-MUTZAR", type),
      el(
        "YeshutLakoach",
        leaf("MISPAR-ZIHUY-LAKOACH", id),
        leaf("MIN", gender),
        leaf("MATZAV-MISHPACHTI", marital),
        leaf("TAARICH-LEYDA", birthDate),
      ),
      el("YeshutMaasik", leaf("SHEM-MAASIK", employer)),
    ),
    el("HeshbonotOPolisot", ...policies),
  );
}

export interface ReportOptions {
  version?: number | string;
  provider?: string | null;
  /** Declared control counts; defaults to the real counts. Pass null to omit. */
  declaredProducts?: number | null;
  declaredProviders?: number | null;
}

export function report(options: ReportOptions, ...products: XmlNode[]): XmlNode {
  const { version = "009", provider = PROVIDER_NAME, declaredProducts, declaredProviders } = options;
  return el(
    "Mimshak",
    el("KoteretKovetz", leaf("MISPAR-GIRSAT-XML", version)),
    el("YeshutYatzran", opt("SHEM-YATZRAN", provider), el("Mutzarim", ...products)),
    el(
      "ReshumatSgira",
      declaredProducts !== null && leaf("KAMUT-MUTZARIM", declaredProducts ?? products.length),
      declaredProviders !== null && leaf("KAMUT-YATZRANIM", declaredProviders ?? 1),
    ),
  );
}

/** A realistic active comprehensive pension: deposits, structure fees and an investment track. */
export function activePension(overrides: PolicyOptions = {}): XmlNode {
  return policy({
    number: HOLDER_ID,
    balances: [
      { deposit: 2, total: 40000 },
      { deposit: 3, total: 50000 },
      { deposit: 1, total: 30000 },
    ],
    deposits: [
      { type: 2, percent: 6, amount: 1200 },
      { type: 3, percent: 6.5, amount: 1300 },
      { type: 1, percent: 6, amount: 1200 },
    ],
    feeRows: [
      { basis: 1, rate: 0.05 },
      { basis: 2, rate: 1.35 },
    ],
    monthlyAccumulationFee: 0.004,
    tracks: [
      { role: 1, name: "מסלול לדוגמה", amount: 120000 },
      { role: 2, name: "מסלול לדוגמה", amount: null },
    ],
    projections: [{ age: 67, accumulation: 2000000, kupot: [{ zikna: 10000, hodshit: 6000 }] }],
    ...overrides,
  });
}

/** Serialises a tree to XML text so parsers and archives can be tested end to end. */
export function toXml(root: XmlNode): string {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const write = (n: XmlNode, isRoot: boolean): string => {
    const attributes = [
      isRoot ? ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' : "",
      n.nil ? ' xsi:nil="true"' : "",
    ].join("");
    if (n.children.length === 0) {
      return n.text === "" ? `<${n.name}${attributes}/>` : `<${n.name}${attributes}>${escape(n.text)}</${n.name}>`;
    }
    return `<${n.name}${attributes}>${n.children.map((child) => write(child, false)).join("")}</${n.name}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>${write(root, true)}`;
}
