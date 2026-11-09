// Builds the demo files for the tutorial couple from the sample Clearing House report that ships with the app:
//   demo-data/bar-lev-daniel-clearing-house.zip
//   demo-data/bar-lev-noa-clearing-house.zip
//   demo-data/stock-lots.csv
// Run once: `npm run demo-data`. The output is committed, so re-running is only needed to change the couple.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { COUPLE, STOCK_LOTS, withCheckDigit } from "./couple.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const appDir = join(root, "..", "..", "app");
const SAMPLE_ZIP = join(appDir, "public", "sample", "sample-clearing-house-report.zip");
const OUT = join(root, "demo-data");
const STAMP = "202611011030";

const SAMPLE = {
  id: "000000018",
  first: "דנה",
  last: "לדוגמה",
  birth: "19720614",
  employers: ['חברת דוגמה בע"מ', 'מפעלי דוגמה בע"מ'],
};

const sampleFiles = unzipSync(new Uint8Array(readFileSync(SAMPLE_ZIP)));
const template = (type, seq) => {
  const name = Object.keys(sampleFiles).find((n) => n.includes(`_${type}_`) && n.endsWith(`_${seq}.xml`));
  if (!name) throw new Error(`sample file ${type}_${seq} not found`);
  return strFromU8(sampleFiles[name]);
};

// Tags holding an amount that grows with the person's savings, and tags that follow their salary.
const BALANCE_TAGS = [
  "TOTAL-CHISACHON-MTZBR",
  "TOTAL-ERKEI-PIDION",
  "SCHUM-TZVIRA-BAMASLUL",
  "TOTAL-CHISACHON-MITZTABER-TZAFUY",
  "TZVIRAT-CHISACHON-CHAZUYA-LELO-PREMIYOT",
  "SCHUM-KITZVAT-ZIKNA",
  "KITZVAT-HODSHIT-TZFUYA",
];
const SALARY_TAGS = [
  "SCHUM-HAFRASHA",
  "TOTAL-HAFKADA-ACHRONA",
  "SACH-PENSIAT-NECHUT",
  "SACH-DMEI-BITUAH-SHENIGBOO",
  "SCHUM-BITUACH",
  "SCHUM-BITUAH-LEMAVET",
];

function scaleTag(text, tag, factor) {
  const pattern = new RegExp(`(<${tag}>)(-?\\d+(?:\\.\\d+)?)(</${tag}>)`, "g");
  return text.replace(pattern, (_, open, value, close) => `${open}${(Number(value) * factor).toFixed(2)}${close}`);
}

function setTag(text, tag, value) {
  return text.replace(new RegExp(`<${tag}>[^<]*</${tag}>`, "g"), `<${tag}>${value}</${tag}>`);
}

function personalise(xml, person, id, file) {
  let out = xml;
  const policies = [...out.matchAll(/<HeshbonOPolisa>[\s\S]*?<\/HeshbonOPolisa>/g)].map((m) => m[0]);
  const kept = policies.filter((block) => !file.keep || file.keep.some((number) => block.includes(`>${number}<`)));
  if (kept.length === 0) throw new Error(`no policy kept in ${file.type}_${file.seq}`);

  const rebuilt = kept.map((block) => {
    let next = block;
    const original = Number(/<SACHAR-POLISA>([\d.]+)<\/SACHAR-POLISA>/.exec(block)?.[1] ?? 0);
    next = next.replaceAll(SAMPLE.id, id);
    for (const [from, to] of Object.entries(file.renumber ?? {})) next = next.replaceAll(from, to);
    for (const tag of BALANCE_TAGS) next = scaleTag(next, tag, file.balance);
    if (original > 0) {
      const salaryFactor = person.salary / original;
      for (const tag of SALARY_TAGS) next = scaleTag(next, tag, salaryFactor);
      next = setTag(next, "SACHAR-POLISA", person.salary.toFixed(2));
    }
    if (file.firstJoined) {
      next = setTag(next, "TAARICH-HITZTARFUT-RISHON", file.firstJoined);
      next = setTag(next, "TAARICH-HITZTARFUT-MUTZAR", file.firstJoined);
    }
    if (file.status) next = setTag(next, "STATUS-POLISA-O-CHESHBON", file.status);
    return next;
  });

  const start = out.indexOf(policies[0]);
  const end = out.lastIndexOf(policies.at(-1)) + policies.at(-1).length;
  const indent = "          ";
  out = out.slice(0, start) + rebuilt.join(`\n${indent}`) + out.slice(end);

  out = out.replaceAll(SAMPLE.id, id);
  out = setTag(out, "SHEM-PRATI", person.he.first);
  out = setTag(out, "SHEM-MISHPACHA", person.he.last);
  out = setTag(out, "MIN", person.sex);
  out = setTag(out, "TAARICH-LEYDA", person.birth);
  out = setTag(out, "MISPAR-YELADIM", COUPLE.children);
  for (const employer of SAMPLE.employers) out = out.replaceAll(employer, file.employer ?? person.employer);
  if (file.provider) out = setTag(out, "SHEM-YATZRAN", file.provider);
  out = setTag(out, "KAMUT-POLISOT", kept.length);
  return out;
}

const MIGDAL = 'מגדל מקפת קרנות פנסיה וקופות גמל בע"מ';
const HAREL = 'הראל פנסיה וגמל בע"מ';

const PLAN = {
  daniel: {
    slug: "bar-lev-daniel",
    files: [
      { type: "PNN", seq: "001", provider: MIGDAL, code: "999000001", balance: 3.2, firstJoined: "20080901" },
      { type: "KGM", seq: "001", code: "999000003", keep: ["7-237-218905-0"], balance: 0.9, firstJoined: "20080901" },
      { type: "KGM", seq: "002", code: "999000003", keep: ["1-219-487102-0"], balance: 1.6, firstJoined: "20100301", status: 2 },
      { type: "ING", seq: "001", code: "999000004", keep: ["52718436"], balance: 1.3, firstJoined: "20100301", status: 2 },
    ],
  },
  noa: {
    slug: "bar-lev-noa",
    files: [
      { type: "PNN", seq: "001", provider: HAREL, code: "999000002", balance: 2.1, firstJoined: "20100701" },
      {
        type: "KGM",
        seq: "001",
        code: "999000003",
        keep: ["7-237-218905-0"],
        renumber: { "7-237-218905-0": "7-204-502817-0" },
        balance: 0.45,
        firstJoined: "20100701",
      },
      { type: "PNO", seq: "001", code: "999000002", keep: ["52916"], balance: 1.4, firstJoined: "20050101", status: 2 },
    ],
  },
};

mkdirSync(OUT, { recursive: true });

for (const [key, plan] of Object.entries(PLAN)) {
  const person = COUPLE[key];
  const id = withCheckDigit(person.idBase);
  const entries = {};
  for (const file of plan.files) {
    const xml = personalise(template(file.type, file.seq), person, id, file);
    const name = `${id}_${file.code}_${file.type}_${STAMP}_${file.seq}.xml`;
    entries[name] = strToU8(xml);
  }
  const target = join(OUT, `${plan.slug}-clearing-house.zip`);
  writeFileSync(target, zipSync(entries, { level: 9 }));
  console.log(`${target}  (ID ${id}, ${Object.keys(entries).length} files)`);
}

// Stock lots: prices come from the app's own daily price files so the lots look real next to the chart data.
const priceDir = join(appDir, "public", "stock-data");
const lines = ["Date,Symbol,Quantity,Price"];
for (const lot of STOCK_LOTS) {
  const file = join(priceDir, `${lot.symbol}.json`);
  if (!existsSync(file)) throw new Error(`Missing ${file}; run \`npm run stock-data\` in app/ first.`);
  const data = JSON.parse(readFileSync(file, "utf8"));
  const index = data.dates.findIndex((d) => d >= lot.date);
  if (index < 0) throw new Error(`No price for ${lot.symbol} on ${lot.date}`);
  const price = (Array.isArray(data.prices) ? data.prices : data.close)?.[index];
  if (typeof price !== "number") throw new Error(`Unexpected price file layout for ${lot.symbol}: ${Object.keys(data)}`);
  lines.push(`${data.dates[index]},${lot.symbol},${lot.quantity},${price.toFixed(2)}`);
}
writeFileSync(join(OUT, "stock-lots.csv"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
