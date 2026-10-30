import type { ProductCategory } from "../../types";
import { sameIdNumber, isValidIsraeliId } from "./israeliId";
import {
  DEATH_COVER_TYPES,
  DISABILITY_COVER_TYPES,
  EMPLOYEE_DEPOSIT_TYPES,
  EMPLOYER_DEPOSIT_TYPES,
  FEE_FROM_ACCUMULATION,
  FEE_FROM_DEPOSIT,
  INFORMATIONAL_DEPOSIT_TYPES,
  NON_ONGOING_DEPOSITORS,
  SEVERANCE_DEPOSIT_TYPE,
  SUPPORTED_SCHEMA_VERSION,
  TRACK_FOR_ACCUMULATION,
  TRACK_FOR_DEPOSITS,
  isNoBalanceProduct,
  resolveGender,
  resolveLegacyPolicyModel,
  resolveMaritalStatus,
  resolveProductCategory,
  resolveStatus,
} from "./codes";
import { ClearingHouseImportError } from "./errors";
import type {
  AccountFieldKey,
  AnnuityBasis,
  ImportConfidence,
  ImportWarning,
  ImportedAccountCandidate,
  ImportedFieldValues,
  ImportedFields,
  MapOptions,
  PersonalSuggestions,
  ReportMapResult,
  ReportProjection,
  SkippedRecord,
} from "./types";
import { allAt, at, kids, numberAt, numberOf, textAt, type XmlNode } from "./xmlTree";

const MAX_ACCUMULATION_FEE_PERCENT = 3;
const MAX_DEPOSIT_FEE_PERCENT = 8;
const STALE_AFTER_MONTHS = 13;
const EARLIEST_PLAUSIBLE_YEAR = 1960;

/** Maps one parsed clearing-house XML file to import candidates. */
export function mapClearingHouseReport(root: XmlNode, options: MapOptions): ReportMapResult {
  if (root.name !== "Mimshak") throw new ClearingHouseImportError("notClearingHouseReport");

  const fileIndex = options.fileIndex ?? 0;
  const schemaVersion = numberAt(root, "KoteretKovetz", "MISPAR-GIRSAT-XML");
  const warnings: ImportWarning[] = [];
  if (schemaVersion !== null && schemaVersion > SUPPORTED_SCHEMA_VERSION) {
    warnings.push({ code: "newerSchemaVersion", params: { version: schemaVersion } });
  }

  const candidates: ImportedAccountCandidate[] = [];
  const skipped: SkippedRecord[] = [];
  const personalEntries: PersonalSuggestions[] = [];
  let productCount = 0;
  const providers = allAt(root, "YeshutYatzran");

  for (const provider of providers) {
    const providerName = textAt(provider, "SHEM-YATZRAN");
    for (const product of allAt(provider, "Mutzarim", "Mutzar")) {
      productCount++;
      const details = at(product, "NetuneiMutzar");
      const holder = at(details, "YeshutLakoach");
      const context: PolicyContext = {
        providerName,
        productType: numberAt(details, "SUG-MUTZAR"),
        holderId: textAt(holder, "MISPAR-ZIHUY-LAKOACH"),
        employerName: textAt(details, "YeshutMaasik", "SHEM-MAASIK"),
      };
      personalEntries.push(readHolder(holder, options.now));

      for (const policy of allAt(product, "HeshbonotOPolisot", "HeshbonOPolisa")) {
        const outcome = mapPolicy(policy, context, `f${fileIndex}-p${candidates.length + skipped.length}`, options.now);
        if (outcome.kind === "skipped") {
          skipped.push(outcome.record);
          continue;
        }
        candidates.push(outcome.candidate);
        if (outcome.activeSalary !== null) {
          personalEntries.push({
            monthlyGrossSalary: { value: outcome.activeSalary, confidence: "derived", source: "SACHAR-POLISA" },
          });
        }
      }
    }
  }

  checkControlCounts(root, productCount, providers.length, warnings);

  const newest = newestDate(candidates.map((candidate) => candidate.valuationDate));
  if (newest) {
    const months = monthsBetween(newest, options.now);
    if (months > STALE_AFTER_MONTHS) warnings.push({ code: "staleReport", params: { months } });
  }

  const combined = combinePersonal(personalEntries);
  warnings.push(...combined.warnings);

  return { schemaVersion, candidates, skipped, personal: combined.personal, warnings };
}

/** Merges the results of several files into one session-wide result. */
export function mergeReportResults(results: ReportMapResult[]): ReportMapResult {
  const combined = combinePersonal(results.map((result) => result.personal));
  const seen = new Set<string>();
  const warnings: ImportWarning[] = [];
  for (const warning of [...results.flatMap((result) => result.warnings), ...combined.warnings]) {
    const id = JSON.stringify([warning.code, warning.params ?? null]);
    if (seen.has(id)) continue;
    seen.add(id);
    warnings.push(warning);
  }
  return {
    schemaVersion: results.reduce<number | null>(
      (max, result) => (result.schemaVersion !== null && (max === null || result.schemaVersion > max) ? result.schemaVersion : max),
      null,
    ),
    candidates: results.flatMap((result) => result.candidates),
    skipped: results.flatMap((result) => result.skipped),
    personal: combined.personal,
    warnings,
  };
}

interface PolicyContext {
  providerName: string | null;
  productType: number | null;
  holderId: string | null;
  employerName: string | null;
}

type PolicyOutcome =
  | { kind: "skipped"; record: SkippedRecord }
  | { kind: "candidate"; candidate: ImportedAccountCandidate; activeSalary: number | null };

function mapPolicy(policy: XmlNode, context: PolicyContext, key: string, now: Date): PolicyOutcome {
  const { productType } = context;
  const statusCode = numberAt(policy, "STATUS-POLISA-O-CHESHBON");
  const status = resolveStatus(statusCode);

  if (isNoBalanceProduct(productType)) {
    return { kind: "skipped", record: { reason: "noRetirementBalance", productTypeCode: productType } };
  }
  if (status.kind === "skip") {
    return { kind: "skipped", record: { reason: "closedOrCancelled", productTypeCode: productType } };
  }
  const balanceBlocks = allAt(policy, "PirteiTaktziv", "BlockItrot", "Yitrot");
  if (balanceBlocks.length === 0) {
    return { kind: "skipped", record: { reason: "noBalanceData", productTypeCode: productType } };
  }

  const fields: ImportedFields = {};
  const warnings: ImportWarning[] = [];
  const isActive = status.kind === "status" && status.value === "activeContributing";
  const salary = numberAt(policy, "PirteiTaktziv", "PirteiHaasaka", "SACHAR-POLISA");
  const usableSalary = salary !== null && salary > 0 ? salary : null;

  if (context.providerName) put(fields, "providerName", context.providerName, "official", "SHEM-YATZRAN");

  const policyNumber = textAt(policy, "MISPAR-POLISA-O-HESHBON");
  if (policyNumber) {
    put(fields, "policyNumber", policyNumber, "official", "MISPAR-POLISA-O-HESHBON");
    if (looksLikeHolderId(policyNumber, context.holderId)) warnings.push({ code: "policyNumberIsHolderId" });
  }

  const isOldPension = numberAt(policy, "PENSIA-VATIKA-O-HADASHA") === 1;
  const category = resolveProductCategory(productType, numberAt(policy, "SUG-KEREN-PENSIA"), isOldPension);
  if (category.category) put(fields, "productCategory", category.category, category.confidence, "SUG-MUTZAR");
  if (category.warning) warnings.push(category.warning);

  const model = resolveLegacyPolicyModel(productType, numberAt(policy, "SUG-POLISA"), isOldPension);
  if (model) put(fields, "legacyPolicyModel", model, "official", "SUG-POLISA");

  if (status.kind === "status") {
    put(fields, "accountStatus", status.value, "official", "STATUS-POLISA-O-CHESHBON");
  } else {
    warnings.push({ code: "statusUnknown", params: { code: statusCode ?? "-" } });
  }

  const joinText = textAt(policy, "TAARICH-HITZTARFUT-MUTZAR");
  const joinDate = parseReportDate(joinText);
  if (joinDate && Number(joinDate.slice(0, 4)) >= EARLIEST_PLAUSIBLE_YEAR && new Date(joinDate) <= now) {
    put(fields, "joinDate", joinDate, "official", "TAARICH-HITZTARFUT-MUTZAR");
  } else if (joinText) {
    warnings.push({ code: "joinDateImplausible" });
  }

  if (category.category === "studyFund") {
    const unlock = earliestDate(
      balanceBlocks.flatMap((block) => allAt(block, "NesilutTag", "MOED-NEZILUT-TAGMULIM").map((n) => n.text)),
    );
    if (unlock) put(fields, "liquidityDate", unlock, "official", "MOED-NEZILUT-TAGMULIM");
  }

  mapBalance(balanceBlocks, fields, warnings);
  if (isActive) mapContributions(policy, usableSalary, fields, warnings);
  mapFees(policy, fields, warnings);
  mapTrack(policy, fields, warnings);
  mapCoverages(policy, fields);

  const valuationDate =
    parseReportDate(textAt(policy, "TAARICH-NECHONUT")) ??
    newestDate(balanceBlocks.map((block) => parseReportDate(textAt(block, "TAARICH-ERECH-TZVIROT"))));

  return {
    kind: "candidate",
    activeSalary: isActive ? usableSalary : null,
    candidate: {
      key,
      productTypeCode: productType,
      fields,
      warnings,
      projections: mapProjections(policy),
      annuityBasis: annuityBasisFor(category.category, isOldPension),
      display: { planName: textAt(policy, "SHEM-TOCHNIT"), employerName: context.employerName },
      valuationDate,
    },
  };
}

function put<K extends AccountFieldKey>(
  fields: ImportedFields,
  key: K,
  value: ImportedFieldValues[K],
  confidence: ImportConfidence,
  source: string,
): void {
  (fields as Record<string, unknown>)[key] = { value, confidence, source };
}

/**
 * New pension funds use the holder's ID as the account number. It is still kept (on this device only,
 * so the account can be recognised against the annual statements), but it is flagged: it is not a
 * distinctive key for matching, and it is redacted from the verification pack.
 */
function looksLikeHolderId(policyNumber: string, holderId: string | null): boolean {
  const digits = policyNumber.replace(/\s/g, "");
  if (isValidIsraeliId(digits)) return true;
  return holderId !== null && sameIdNumber(digits, holderId);
}

function mapBalance(blocks: XmlNode[], fields: ImportedFields, warnings: ImportWarning[]): void {
  const rows = blocks.flatMap((block) => allAt(block, "PerutYitrot"));
  const total = sumNumbers(rows.map((row) => at(row, "TOTAL-CHISACHON-MTZBR")));
  if (total !== null) {
    if (total < 0) warnings.push({ code: "negativeBalance" });
    else put(fields, "totalAccumulatedBalance", round2(total), "official", "TOTAL-CHISACHON-MTZBR");
  }
  const severance = sumNumbers(
    rows
      .filter((row) => numberAt(row, "KOD-SUG-HAFRASHA") === SEVERANCE_DEPOSIT_TYPE)
      .map((row) => at(row, "TOTAL-CHISACHON-MTZBR")),
  );
  if (severance !== null && severance > 0) {
    put(fields, "severanceBalance", round2(severance), "official", "TOTAL-CHISACHON-MTZBR");
  }
}

interface DepositGroup {
  percent: number | null;
  amount: number | null;
}

function mapContributions(
  policy: XmlNode,
  salary: number | null,
  fields: ImportedFields,
  warnings: ImportWarning[],
): void {
  const groups: Record<"employee" | "employer" | "severance", DepositGroup> = {
    employee: { percent: null, amount: null },
    employer: { percent: null, amount: null },
    severance: { percent: null, amount: null },
  };
  const unmodelled = new Set<number>();

  for (const row of allAt(policy, "PirteiTaktziv", "PerutHafrashotLePolisa")) {
    const depositor = numberAt(row, "SUG-HAMAFKID");
    if (depositor !== null && NON_ONGOING_DEPOSITORS.includes(depositor)) continue;
    const type = numberAt(row, "SUG-HAFRASHA");
    const percent = numberAt(row, "ACHUZ-HAFRASHA");
    const amount = numberAt(row, "SCHUM-HAFRASHA");
    const group =
      type === null
        ? null
        : EMPLOYEE_DEPOSIT_TYPES.includes(type)
          ? groups.employee
          : EMPLOYER_DEPOSIT_TYPES.includes(type)
            ? groups.employer
            : type === SEVERANCE_DEPOSIT_TYPE
              ? groups.severance
              : null;
    if (group) {
      if (percent !== null) group.percent = (group.percent ?? 0) + percent;
      if (amount !== null) group.amount = (group.amount ?? 0) + amount;
    } else if (type !== null && !INFORMATIONAL_DEPOSIT_TYPES.includes(type) && (amount ?? 0) > 0) {
      unmodelled.add(type);
    }
  }
  for (const type of [...unmodelled].sort((a, b) => a - b)) {
    warnings.push({ code: "contributionTypeNotModelled", params: { type } });
  }

  const resolved = {
    employeeRatePercent: resolveRate(groups.employee, salary),
    employerRatePercent: resolveRate(groups.employer, salary),
    severanceRatePercent: resolveRate(groups.severance, salary),
  };
  const values = Object.values(resolved);
  if (values.some((entry) => entry === "needsSalary")) {
    warnings.push({ code: "contributionRatesMissingSalary" });
  }
  const known = values.filter((entry): entry is Rate => typeof entry === "object" && entry !== null);
  if (!known.some((entry) => entry.value > 0)) return;

  if (salary !== null) put(fields, "monthlySalaryBase", salary, "official", "SACHAR-POLISA");
  for (const [key, entry] of Object.entries(resolved) as [
    "employeeRatePercent" | "employerRatePercent" | "severanceRatePercent",
    Rate | "needsSalary" | null,
  ][]) {
    if (typeof entry === "object" && entry !== null) {
      put(fields, key, entry.value, entry.confidence, entry.source);
    }
  }
  if (known.some((entry) => entry.confidence === "derived")) {
    warnings.push({ code: "contributionRatesDerived" });
  }
}

interface Rate {
  value: number;
  confidence: ImportConfidence;
  source: string;
}

function resolveRate(group: DepositGroup, salary: number | null): Rate | "needsSalary" | null {
  if (group.percent !== null && group.percent > 0) {
    return { value: round2(group.percent), confidence: "official", source: "ACHUZ-HAFRASHA" };
  }
  if (group.amount !== null && group.amount > 0) {
    if (salary === null) return "needsSalary";
    return {
      value: round2((group.amount / salary) * 100),
      confidence: "derived",
      source: "SCHUM-HAFRASHA / SACHAR-POLISA",
    };
  }
  if (group.percent === 0) return { value: 0, confidence: "official", source: "ACHUZ-HAFRASHA" };
  return null;
}

interface FeePick {
  value: number;
  confidence: ImportConfidence;
  differs: boolean;
}

function pickFee(rates: number[], cap: number): FeePick | null {
  const plausible = rates.filter((rate) => rate <= cap);
  if (plausible.length === 0) return null;
  // Rows above the cap are a different kind of fee, so only real rivals count as a conflict.
  const differs = plausible.length > 1;
  return { value: Math.max(...plausible), differs, confidence: differs ? "uncertain" : "official" };
}

function mapFees(policy: XmlNode, fields: ImportedFields, warnings: ImportWarning[]): void {
  const structure = allAt(policy, "PirteiTaktziv", "PerutHotzaot", "MivneDmeiNihul", "PerutMivneDmeiNihul");
  const actual = at(policy, "PirteiTaktziv", "PerutHotzaot", "HotzaotBafoalLehodeshDivoach");

  const ratesFor = (basis: number): number[] => [
    ...new Set(
      structure
        .filter((row) => numberAt(row, "SUG-HOTZAA") === basis)
        .map((row) => numberAt(row, "SHEUR-DMEI-NIHUL"))
        .filter((rate): rate is number => rate !== null && rate >= 0),
    ),
  ];
  const accumulationRates = ratesFor(FEE_FROM_ACCUMULATION);
  const depositRates = ratesFor(FEE_FROM_DEPOSIT);
  const monthlyAccumulation = numberAt(actual, "SHEUR-DMEI-NIHUL-TZVIRA");
  const actualDeposit = numberAt(actual, "SHEUR-DMEI-NIHUL-HAFKADA");

  const seen = [...accumulationRates, ...depositRates, monthlyAccumulation, actualDeposit].filter(
    (value): value is number => value !== null,
  );
  if (seen.length === 0) return;
  if (!seen.some((value) => value > 0)) {
    warnings.push({ code: "feesAllZero" });
    return;
  }

  let differs = false;
  let accumulation = pickFee(accumulationRates, MAX_ACCUMULATION_FEE_PERCENT);
  if (accumulation) {
    differs ||= accumulation.differs;
    put(fields, "feeFromAccumulationPercent", accumulation.value, accumulation.confidence, "SHEUR-DMEI-NIHUL");
    if (monthlyAccumulation !== null && monthlyAccumulation > 0) {
      const annualised = monthlyAccumulation * 12;
      if (Math.abs(annualised - accumulation.value) > 0.1) {
        warnings.push({
          code: "feeAccumulationMismatch",
          params: { structure: round2(accumulation.value), reported: round2(annualised) },
        });
      }
    }
  } else if (accumulationRates.length === 0 && monthlyAccumulation !== null && monthlyAccumulation > 0) {
    accumulation = { value: round2(monthlyAccumulation * 12), confidence: "derived", differs: false };
    put(fields, "feeFromAccumulationPercent", accumulation.value, "derived", "SHEUR-DMEI-NIHUL-TZVIRA");
  }

  const deposit = pickFee(depositRates, MAX_DEPOSIT_FEE_PERCENT);
  if (deposit) {
    differs ||= deposit.differs;
    put(fields, "feeFromDepositPercent", deposit.value, deposit.confidence, "SHEUR-DMEI-NIHUL");
  } else if (depositRates.length === 0 && actualDeposit !== null && actualDeposit > 0) {
    put(fields, "feeFromDepositPercent", actualDeposit, "derived", "SHEUR-DMEI-NIHUL-HAFKADA");
  }

  if (differs) warnings.push({ code: "feeRowsDiffer" });
}

function mapTrack(policy: XmlNode, fields: ImportedFields, warnings: ImportWarning[]): void {
  const tracks = allAt(policy, "PirteiTaktziv", "PerutMasluleiHashkaa")
    .map((row) => ({
      role: numberAt(row, "KOD-SUG-MASLUL"),
      name: textAt(row, "SHEM-MASLUL-HASHKAA"),
      amount: numberAt(row, "SCHUM-TZVIRA-BAMASLUL") ?? 0,
    }))
    .filter((track): track is { role: number | null; name: string; amount: number } => track.name !== null);

  const largest = (role: number) =>
    tracks.filter((track) => track.role === role).reduce<(typeof tracks)[number] | null>(
      (best, track) => (best === null || track.amount > best.amount ? track : best),
      null,
    );
  const accumulationTrack = largest(TRACK_FOR_ACCUMULATION);
  const depositTrack = largest(TRACK_FOR_DEPOSITS);

  if (accumulationTrack?.name) {
    put(fields, "investmentTrackName", accumulationTrack.name, "official", "SHEM-MASLUL-HASHKAA");
    if (depositTrack?.name && depositTrack.name !== accumulationTrack.name) {
      warnings.push({ code: "trackDiffersFromDeposit" });
    }
  } else if (depositTrack?.name) {
    put(fields, "investmentTrackName", depositTrack.name, "derived", "SHEM-MASLUL-HASHKAA");
    warnings.push({ code: "trackFromDepositOnly" });
  }
}

function mapCoverages(policy: XmlNode, fields: ImportedFields): void {
  let death = 0;
  let disability = 0;
  for (const cover of allAt(policy, "Kisuim", "ZihuiKisui")) {
    const blocks = kids(cover, "PirteiKisuiBeMutzar");
    const blockSum = (types: number[]) =>
      blocks
        .filter((block) => types.includes(numberAt(block, "SUG-KISUY-BITOCHI") ?? -1))
        .reduce((sum, block) => sum + Math.max(0, numberAt(block, "SCHUM-BITUACH") ?? 0), 0);

    const basicDeath = numberAt(cover, "SchumeiBituahYesodi", "SCHUM-BITUAH-LEMAVET") ?? 0;
    death += basicDeath > 0 ? basicDeath : blockSum(DEATH_COVER_TYPES);

    const pensionDisability = numberAt(cover, "KisuiBKerenPensia", "SACH-PENSIAT-NECHUT") ?? 0;
    disability += pensionDisability > 0 ? pensionDisability : blockSum(DISABILITY_COVER_TYPES);
  }
  if (death > 0) put(fields, "deathCoverageAmount", round2(death), "derived", "SCHUM-BITUAH-LEMAVET");
  if (disability > 0) put(fields, "monthlyDisabilityAmount", round2(disability), "derived", "SACH-PENSIAT-NECHUT");

  const deduction = numberAt(
    policy,
    "PirteiTaktziv",
    "PerutHotzaot",
    "HotzaotBafoalLehodeshDivoach",
    "SACH-DMEI-BITUAH-SHENIGBOO",
  );
  if (deduction !== null && deduction > 0) {
    put(fields, "monthlyRiskDeduction", round2(deduction), "derived", "SACH-DMEI-BITUAH-SHENIGBOO");
  }
}

function mapProjections(policy: XmlNode): ReportProjection[] {
  const projections: ReportProjection[] = [];
  for (const block of allAt(policy, "YitraLefiGilPrisha")) {
    const age = numberAt(block, "GIL-PRISHA");
    if (age === null || age <= 0) continue;
    const accumulation = numberAt(block, "TOTAL-CHISACHON-MITZTABER-TZAFUY");
    const funds = allAt(block, "Kupot", "Kupa");
    const monthlyPension = sumNumbers(
      funds.map((fund) =>
        numberAt(fund, "SCHUM-KITZVAT-ZIKNA") !== null
          ? at(fund, "SCHUM-KITZVAT-ZIKNA")
          : at(fund, "KITZVAT-HODSHIT-TZFUYA"),
      ),
    );
    if (accumulation === null && monthlyPension === null) continue;

    // Both bases give the same ratio in real reports, so the factor is read from whichever pair is complete.
    const impliedFactor =
      ratio(accumulation, sumNumbers(funds.map((fund) => at(fund, "SCHUM-KITZVAT-ZIKNA")))) ??
      ratio(
        numberAt(block, "TZVIRAT-CHISACHON-CHAZUYA-LELO-PREMIYOT"),
        sumNumbers(funds.map((fund) => at(fund, "KITZVAT-HODSHIT-TZFUYA"))),
      );
    const guaranteed = numberAt(block, "MEKADEM-MOVTACH-LEPRISHA");
    projections.push({
      age,
      accumulation,
      monthlyPension,
      guaranteedFactor: guaranteed !== null && guaranteed > 0 ? guaranteed : null,
      impliedFactor,
    });
  }
  return projections.sort((a, b) => a.age - b.age);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || numerator <= 0 || denominator <= 0) return null;
  return round2(numerator / denominator);
}

function annuityBasisFor(category: ProductCategory | null, isOldPension: boolean): AnnuityBasis | null {
  switch (category) {
    case "comprehensivePension":
    case "generalPension":
      return isOldPension ? "pension" : "factor";
    case "managersInsurance":
      return "factor";
    default:
      return null;
  }
}

function readHolder(holder: XmlNode | undefined, now: Date): PersonalSuggestions {
  const suggestions: PersonalSuggestions = {};
  const gender = resolveGender(numberAt(holder, "MIN"));
  if (gender) suggestions.gender = { value: gender, confidence: "official", source: "MIN" };
  const marital = resolveMaritalStatus(numberAt(holder, "MATZAV-MISHPACHTI"));
  if (marital) suggestions.maritalStatus = { value: marital, confidence: "uncertain", source: "MATZAV-MISHPACHTI" };
  const birth = parseReportDate(textAt(holder, "TAARICH-LEYDA"));
  if (birth) {
    const age = ageOn(birth, now);
    if (age >= 15 && age <= 100) suggestions.age = { value: age, confidence: "derived", source: "TAARICH-LEYDA" };
  }
  return suggestions;
}

function combinePersonal(entries: PersonalSuggestions[]): { personal: PersonalSuggestions; warnings: ImportWarning[] } {
  const personal: PersonalSuggestions = {};
  const warnings: ImportWarning[] = [];

  for (const field of ["gender", "maritalStatus", "age"] as const) {
    const present = entries.map((entry) => entry[field]).filter((value) => value !== undefined);
    if (present.length === 0) continue;
    if (present.every((value) => value.value === present[0].value)) {
      (personal as Record<string, unknown>)[field] = present[0];
    } else {
      warnings.push({ code: "personalConflict", params: { field } });
    }
  }

  const salaries = entries
    .map((entry) => entry.monthlyGrossSalary)
    .filter((value) => value !== undefined);
  if (salaries.length > 0) {
    personal.monthlyGrossSalary = salaries.reduce((best, value) => (value.value > best.value ? value : best));
  }
  return { personal, warnings };
}

function checkControlCounts(root: XmlNode, products: number, providers: number, warnings: ImportWarning[]): void {
  // KAMUT-POLISOT is not compared: real files declare 1 whatever the number of policies.
  const checks: [string, string, number][] = [
    ["KAMUT-MUTZARIM", "products", products],
    ["KAMUT-YATZRANIM", "providers", providers],
  ];
  for (const [element, what, parsed] of checks) {
    const declared = numberAt(root, "ReshumatSgira", element);
    if (declared !== null && declared !== parsed) {
      warnings.push({ code: "controlCountMismatch", params: { what, declared, parsed } });
    }
  }
}

function sumNumbers(nodes: (XmlNode | undefined)[]): number | null {
  let total: number | null = null;
  for (const n of nodes) {
    const value = numberOf(n);
    if (value !== null) total = (total ?? 0) + value;
  }
  return total;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `yyyyMMdd` to `yyyy-mm-dd`, or null for anything that is not a real calendar date. */
export function parseReportDate(text: string | null): string | null {
  if (!text || !/^\d{8}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function earliestDate(candidates: (string | null)[]): string | null {
  const dates = candidates.map((value) => parseReportDate(value)).filter((value): value is string => value !== null);
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b));
}

function newestDate(dates: (string | null)[]): string | null {
  const valid = dates.filter((value): value is string => value !== null);
  return valid.length === 0 ? null : valid.reduce((a, b) => (a > b ? a : b));
}

function ageOn(isoBirthDate: string, now: Date): number {
  const [year, month, day] = isoBirthDate.split("-").map(Number);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age--;
  return age;
}

function monthsBetween(isoDate: string, now: Date): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  if (now.getDate() < day) months--;
  return Math.max(0, months);
}
