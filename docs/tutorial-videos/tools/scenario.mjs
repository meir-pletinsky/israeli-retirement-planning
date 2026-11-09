// The tutorial, written once: scenes made of steps, each step holding what to do on screen and what to say
// in English, Russian and Hebrew. record.mjs plays the steps; build-scripts.mjs turns the same text into scripts.
//
// A step's `say` is the narration that starts when the step starts. The recorder keeps the step on screen for
// at least as long as the narration takes to read, so picture and voice stay together in the final video.

import { join } from "node:path";
import { BANK_DEPOSITS, EXPENSE_PICKS, MANUAL_EXPENSE } from "./couple.mjs";
import { DEMO_DIR } from "./lib.mjs";

export const FILES = {
  daniel: join(DEMO_DIR, "bar-lev-daniel-clearing-house.zip"),
  noa: join(DEMO_DIR, "bar-lev-noa-clearing-house.zip"),
  csv: join(DEMO_DIR, "stock-lots.csv"),
};

// Reading speed of a text-to-speech voice, in characters per second, and a breath between steps.
const CHARS_PER_SECOND = { en: 14, ru: 14, he: 12 };
export function narrationSeconds(text, lang) {
  return text.length / CHARS_PER_SECOND[lang] + 0.8;
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The app wraps interpolated values in invisible bidi isolate marks, so match with those allowed anywhere.
const BIDI = "[\\u2066-\\u2069\\u200e\\u200f]*";
const rx = (text) => new RegExp([...text].map(escapeRegex).join(BIDI));
const dateText = (iso, lang) => {
  const [y, m, d] = iso.split("-");
  return lang === "ru" ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
};

/** Follows a link on the page when one is there (what a person would do), otherwise opens the address. */
async function go({ s, page, base }, path) {
  const link = page.locator(`a[href="${path}"]`).first();
  if (await link.isVisible().catch(() => false)) await s.click(link);
  else await page.goto(base + path);
  await s.settle();
}

async function openTab({ s, t, page }, key) {
  const tab = page.getByRole("tab", { name: rx(t(key)) }).first();
  if ((await tab.getAttribute("aria-selected")) !== "true") await s.click(tab, { after: 700 });
}

const parentOf = (locator) => locator.first().locator("xpath=..");
const textOf = (page, text) => page.getByText(text, { exact: true }).first();

async function openDeposit(c, deposit) {
  const { s, t, page } = c;
  const f = (key) => t(`myData.steps.bankDeposits.fields.${key}`);
  await s.click(page.getByRole("button", { name: t("myData.steps.bankDeposits.addDeposit") }), { after: 700 });
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await s.type(dialog.getByLabel(rx(f("bankName"))), deposit.bankName, { delay: 55 });
  await s.type(dialog.getByLabel(rx(f("amount"))), deposit.amount, { delay: 80 });
}

async function finishDeposit(c, deposit) {
  const { s, t, page, lang } = c;
  const f = (key) => t(`myData.steps.bankDeposits.fields.${key}`);
  const dialog = page.getByRole("dialog");
  await s.type(dialog.getByRole("textbox", { name: rx(f("startDate")) }), dateText(deposit.startDate, lang), { delay: 90 });
  await s.type(dialog.getByRole("textbox", { name: rx(f("maturityDate")) }), dateText(deposit.maturityDate, lang), { delay: 90 });
  await s.select(dialog.getByLabel(rx(f("rateType"))), t("myData.steps.bankDeposits.options.rateType.fixed"));
  await s.type(dialog.getByLabel(rx(f("annualInterestRatePercent"))), deposit.annualInterestRatePercent, { delay: 110 });
  await s.pause(700);
  await s.shot("deposit-form");
  await s.click(dialog.getByRole("button", { name: t("common.save") }), { after: 900 });
  await dialog.waitFor({ state: "hidden" });
}

/** Ticks suggestions in the open dialog and types the cost of one payment for each. */
async function pickExpenses({ s, t, page }, picks) {
  const dialog = page.getByRole("dialog");
  for (const [key, amount] of picks) {
    const name = t(`myData.steps.expenses.catalog.${key}`);
    await s.check(dialog.getByRole("checkbox", { name: rx(name) }), true, { duration: 350 });
    await s.type(dialog.getByLabel(t("myData.steps.expenses.suggestions.amountLabel", { name })), amount, { delay: 30, duration: 350 });
  }
}

export const SCENES = [
  {
    id: "intro",
    title: { en: "Meet the couple", ru: "Знакомство с парой", he: "מכירים את בני הזוג" },
    steps: [
      {
        id: "welcome",
        say: {
          en: "Meet Daniel and Noa, a couple in their forties with two children. They want to know when they can retire, and whether their money will last. In this video we plan it together, step by step, in the Israeli Retirement Planning app.",
          ru: "Знакомьтесь: Даниэль и Ноа, супруги чуть за сорок, у них двое детей. Они хотят понять, когда можно выйти на пенсию и хватит ли им накоплений. В этом видео мы шаг за шагом составим их план в приложении «Планирование пенсии в Израиле».",
          he: "הכירו את דניאל ונועה, זוג בשנות הארבעים לחייהם עם שני ילדים. הם רוצים לדעת מתי אפשר לפרוש, והאם הכסף יספיק. בסרטון הזה נבנה את התוכנית שלהם צעד אחר צעד באפליקציית «תכנון פרישה בישראל».",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.shot("welcome");
          await s.moveTo(1120, 250, 1200);
          await c.at(0.1);
          await s.highlight(page.getByRole("heading").first(), 2400, 12);
          await c.at(0.6);
          await s.highlight(textOf(page, t("welcome.about.body")), 3000, 12);
        },
      },
      {
        id: "privacy",
        say: {
          en: "First, privacy. There is no account and no server. Everything you enter stays in this browser, and the files you import are read on your own device. Let's click Get started.",
          ru: "Сначала о конфиденциальности. Здесь нет ни учётной записи, ни сервера. Всё, что вы вводите, остаётся в этом браузере, а импортируемые файлы читаются только на вашем устройстве. Нажимаем «С чего начать».",
          he: "קודם כול, פרטיות. אין חשבון ואין שרת. כל מה שתזינו נשאר בדפדפן הזה, והקבצים שתייבאו נקראים רק במכשיר שלכם. נלחץ על «איך מתחילים».",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.highlight(textOf(page, t("welcome.privacy.lead")), 2200, 14);
          await c.at(0.3);
          await s.highlight(textOf(page, t("welcome.privacy.points.local")), 2400, 10);
          await c.at(0.55);
          await s.highlight(textOf(page, t("welcome.privacy.points.files")), 2400, 10);
          await c.at(0.85);
          await s.click(page.getByRole("button", { name: t("welcome.getStarted") }));
          await s.settle();
        },
      },
    ],
  },

  {
    id: "import-daniel",
    title: { en: "Import Daniel's report", ru: "Импорт отчёта Даниэля", he: "ייבוא הדוח של דניאל" },
    steps: [
      {
        id: "start",
        say: {
          en: "The fastest way to start is the report from the Pension Clearing House, known as the Mislaka. One file lists every pension fund, provident fund and study fund. Daniel begins by importing his report.",
          ru: "Быстрее всего начать с отчёта из пенсионного клиринга, «Масляки». В одном файле перечислены все пенсионные фонды, купат гемель и керен хиштальмут. Даниэль начинает с импорта своего отчёта.",
          he: "הדרך המהירה ביותר להתחיל היא הדוח מהמסלקה הפנסיונית. קובץ אחד מפרט את כל קרנות הפנסיה, קופות הגמל וקרנות ההשתלמות. דניאל מתחיל בייבוא הדוח שלו.",
        },
        async run(c) {
          const { s, page } = c;
          const link = page.locator('a[href="/import/clearing-house"]').first();
          await c.at(0.4);
          await s.highlight(link, 2200);
          await c.at(0.88);
          await s.click(link);
          await s.settle();
        },
      },
      {
        id: "review",
        say: {
          en: "We choose the ZIP file Daniel received. The app reads it on this device, and before anything is saved it shows what it found: the provider, the balance and the contribution status of each account.",
          ru: "Выбираем ZIP-файл, который получил Даниэль. Приложение читает его на этом устройстве и до сохранения показывает, что нашло: поставщика, баланс и статус взносов по каждому счёту.",
          he: "בוחרים את קובץ ה-ZIP שדניאל קיבל. האפליקציה קוראת אותו במכשיר, ולפני השמירה מציגה מה מצאה: את הגוף המנהל, את היתרה ואת מצב ההפקדות של כל חשבון.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.upload('input[type="file"]', FILES.daniel);
          await page.getByRole("button", { name: t("clearingHouse.review.apply") }).waitFor();
          await s.settle(700);
          await s.shot("review");
          await c.at(0.35);
          await s.highlight(parentOf(textOf(page, t("clearingHouse.review.summary.title"))), 2600);
          await c.at(0.62);
          await s.scrollBy(620, 2200);
          await c.at(0.82);
          await s.scrollBy(620, 2200);
        },
      },
      {
        id: "apply",
        say: {
          en: "We tick that Daniel is married, so the plan will cover the whole household, and import the selected values.",
          ru: "Отмечаем, что Даниэль женат, чтобы план учитывал всю семью, и импортируем выбранное.",
          he: "מסמנים שדניאל נשוי, כדי שהתוכנית תתייחס לכל משק הבית, ומייבאים את הערכים שנבחרו.",
        },
        async run(c) {
          const { s, t, page } = c;
          await c.at(0.15);
          await s.check(page.getByRole("checkbox", { name: rx(t("myData.steps.personal.maritalStatus")) }));
          await c.at(0.6);
          await s.click(page.getByRole("button", { name: t("clearingHouse.review.apply") }), { after: 800 });
          await page.getByRole("button", { name: t("clearingHouse.done.toAccounts") }).waitFor();
          await s.settle();
        },
      },
      {
        id: "done",
        say: {
          en: "Done. Daniel's accounts are in the plan, and his age and salary were filled in from the report.",
          ru: "Готово. Счета Даниэля добавлены в план, а его возраст и зарплата заполнены из отчёта.",
          he: "מוכן. החשבונות של דניאל נכנסו לתוכנית, והגיל והשכר שלו מולאו מתוך הדוח.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.shot("done");
          await s.highlight(parentOf(textOf(page, t("clearingHouse.done.title"))), 2200, 10);
          await c.at(0.6);
          await s.click(page.getByRole("button", { name: t("clearingHouse.done.toAccounts") }));
          await s.settle();
          await c.at(0.8);
          await s.scrollBy(520, 1500);
        },
      },
    ],
  },

  {
    id: "import-noa",
    title: { en: "Import Noa's report", ru: "Импорт отчёта Ноа", he: "ייבוא הדוח של נועה" },
    steps: [
      {
        id: "partner",
        say: {
          en: "Now Noa. We open the Partner tab and import her Clearing House report in the same way.",
          ru: "Теперь Ноа. Открываем вкладку «Партнёр» и таким же образом импортируем её отчёт из клиринга.",
          he: "עכשיו נועה. פותחים את הלשונית של בן/בת הזוג, ומייבאים את הדוח שלה מהמסלקה באותו אופן.",
        },
        async run({ s, t, page }) {
          await s.scrollToTop();
          await s.click(page.getByRole("tab", { name: rx(t("myData.person.spouse")) }).first(), { after: 900 });
          const link = page.getByRole("link", { name: t("clearingHouse.entryButtonFor.spouse") });
          await s.highlight(link, 1800);
          await s.click(link);
          await s.settle();
        },
      },
      {
        id: "review",
        say: {
          en: "The app can tell that this report fits the partner, so it saves the accounts under her name. We import, and her age and salary arrive together with the accounts.",
          ru: "Приложение видит, что отчёт подходит партнёру, и сохраняет счета на её имя. Импортируем, и возраст и зарплата Ноа подтягиваются вместе со счетами.",
          he: "האפליקציה מזהה שהדוח מתאים לבת הזוג, ושומרת את החשבונות על שמה. מייבאים, והגיל והשכר של נועה מגיעים יחד עם החשבונות.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.upload('input[type="file"]', FILES.noa);
          const apply = page.getByRole("button", { name: t("clearingHouse.review.apply") });
          await apply.waitFor();
          await s.settle(700);
          await s.shot("review");
          await c.at(0.3);
          const whose = textOf(page, t("clearingHouse.review.whoseTitle"));
          if (await whose.isVisible().catch(() => false)) await s.highlight(parentOf(whose), 2400);
          await c.at(0.6);
          await s.scrollBy(520, 2000);
          await c.at(0.85);
          await s.click(apply, { after: 800 });
          await page.getByRole("button", { name: t("clearingHouse.done.toAccounts") }).waitFor();
          await s.settle();
        },
      },
      {
        id: "both",
        say: {
          en: "Both partners' pension and savings accounts now sit in one place, ready for the plan.",
          ru: "Пенсионные счета и накопления обоих партнёров теперь собраны в одном месте и готовы к расчёту.",
          he: "חשבונות הפנסיה והחיסכון של שני בני הזוג נמצאים עכשיו במקום אחד, מוכנים לתחזית.",
        },
        async run({ s, t, page }) {
          await s.click(page.getByRole("button", { name: t("clearingHouse.done.toAccounts") }));
          await s.settle();
          await s.scrollBy(480, 1600);
          await s.pause(800);
          await s.scrollToTop();
          await s.click(page.getByRole("tab", { name: rx(t("myData.person.self")) }).first(), { after: 900 });
        },
      },
    ],
  },

  {
    id: "missing-data",
    title: { en: "Add the missing details", ru: "Недостающие данные", he: "משלימים נתונים חסרים" },
    steps: [
      {
        id: "daniel",
        say: {
          en: "A report can't tell us everything, so we add what is missing. Daniel wants to retire at 65, and his tax credit points, the Nekudot Zikui from his payslip, are 2.25.",
          ru: "В отчёте есть не всё, поэтому добавим недостающее. Даниэль хочет выйти на пенсию в 65 лет, а его налоговые кредитные баллы, «некудот зикуй» из расчётного листка, составляют 2,25.",
          he: "לא הכול מופיע בדוח, ולכן משלימים את מה שחסר. דניאל רוצה לפרוש בגיל 65, ונקודות הזיכוי שלו מתלוש השכר הן 2.25.",
        },
        async run(c) {
          const { s, t, page } = c;
          await go(c, "/my-data/personal");
          await openTab(c, "myData.person.self");
          await s.shot("personal-me");
          await c.at(0.25);
          await s.type(page.getByLabel(rx(t("myData.steps.personal.retirementAge"))), "65", { delay: 160 });
          await c.at(0.55);
          await s.type(page.getByLabel(rx(t("myData.steps.personal.creditPoints"))), "2.25", { delay: 160 });
          await s.pause(500);
        },
      },
      {
        id: "noa",
        say: {
          en: "On the Partner tab, Noa plans to retire at 63, and her credit points are 4.75, which include the points for the children.",
          ru: "На вкладке «Партнёр»: Ноа планирует выйти на пенсию в 63 года, а её баллы, 4,75, включают баллы на детей.",
          he: "בלשונית בן/בת הזוג: נועה מתכננת לפרוש בגיל 63, ונקודות הזיכוי שלה, 4.75, כוללות את הנקודות על הילדים.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.scrollToTop();
          await openTab(c, "myData.person.spouse");
          await c.at(0.3);
          await s.type(page.getByLabel(rx(t("myData.steps.personal.spouseRetirementAge"))), "63", { delay: 160 });
          await c.at(0.55);
          await s.type(page.getByLabel(rx(t("myData.steps.personal.spouseCreditPoints"))), "4.75", { delay: 160 });
          await s.shot("personal-partner");
          await s.pause(500);
        },
      },
      {
        id: "complete",
        say: {
          en: "Now the step shows that the required details are complete. Credit points lower the income tax, and the retirement age sets when withdrawals begin.",
          ru: "Теперь обязательные данные заполнены. Баллы снижают подоходный налог, а возраст выхода на пенсию определяет, когда начнутся выплаты.",
          he: "עכשיו פרטי החובה הושלמו. נקודות הזיכוי מקטינות את מס ההכנסה, וגיל הפרישה קובע מתי מתחילות המשיכות.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.scrollToTop();
          await c.at(0.25);
          await s.highlight(page.getByText(t("myData.stepStatus.requiredComplete")).first(), 2800, 12);
          await c.at(0.65);
          await s.scrollBy(380, 2400);
        },
      },
    ],
  },

  {
    id: "stocks",
    title: { en: "Load stocks from a CSV", ru: "Акции из CSV", he: "טעינת מניות מקובץ CSV" },
    steps: [
      {
        id: "start",
        say: {
          en: "Next, investments. Over the years the couple bought shares through a broker. Typing every purchase takes time, so we use the CSV option: Add private trade, then Bulk.",
          ru: "Дальше инвестиции. За годы супруги купили акции через брокера. Вводить каждую покупку долго, поэтому используем CSV: «Добавить частную сделку», затем «Списком».",
          he: "הלאה להשקעות. במרוצת השנים בני הזוג קנו מניות דרך ברוקר. הקלדה של כל רכישה לוקחת זמן, ולכן נשתמש באפשרות CSV: «הוספת עסקה פרטית» ואז «מרוכזת».",
        },
        async run(c) {
          const { s, t, page } = c;
          await go(c, "/my-data/equity");
          await s.pause(900);
          await c.at(0.35);
          await s.click(page.getByRole("button", { name: t("myData.steps.equity.addPrivateTrade") }), { after: 900 });
          await c.at(0.7);
          await s.click(page.getByText(t("myData.steps.equity.entryMode.bulk")).first(), { after: 700 });
        },
      },
      {
        id: "paste",
        say: {
          en: "Each line holds the purchase date, the ticker symbol, the quantity and the price. We paste the lines, and the app previews every row before adding anything.",
          ru: "В каждой строке дата покупки, тикер, количество и цена. Вставляем строки, и приложение показывает каждую из них до добавления.",
          he: "בכל שורה יש תאריך רכישה, סימול המניה, כמות ומחיר. מדביקים את השורות, והאפליקציה מציגה כל שורה בתצוגה מקדימה לפני ההוספה.",
        },
        async run(c) {
          const { s, t, page, csv } = c;
          const dialog = page.getByRole("dialog");
          await s.paste(dialog.locator("textarea"), csv);
          await s.shot("csv-pasted");
          await c.at(0.4);
          await s.highlight(parentOf(textOf(page, t("myData.steps.equity.bulk.previewTitle"))), 2600, 6);
          await c.at(0.75);
          await s.scrollBy(260, 1600);
        },
      },
      {
        id: "result",
        say: {
          en: "Six purchases of Microsoft, Apple, Alphabet and Amazon, worth about 88 thousand dollars. The app converts them to shekels at the Bank of Israel rate and shows the taxable gain on every lot.",
          ru: "Шесть покупок акций Microsoft, Apple, Alphabet и Amazon на сумму около 88 тысяч долларов. Приложение переводит их в шекели по курсу Банка Израиля и показывает налогооблагаемую прибыль по каждой партии.",
          he: "שש רכישות של מיקרוסופט, אפל, אלפבית ואמזון, בשווי של כ-88 אלף דולר. האפליקציה ממירה אותן לשקלים לפי שער בנק ישראל, ומציגה את הרווח החייב במס בכל רכישה.",
        },
        async run(c) {
          const { s, page } = c;
          const dialog = page.getByRole("dialog");
          await c.at(0.1);
          await s.click(dialog.getByRole("button", { name: /6/ }).last(), { after: 900 });
          await dialog.waitFor({ state: "hidden" });
          await s.settle(800);
          const table = page.locator("table").first();
          await c.at(0.4);
          await s.glideTo(table, { top: 140 });
          await s.shot("stocks-table");
          await c.at(0.65);
          await s.highlight(table, 3000, 6);
        },
      },
    ],
  },

  {
    id: "bank-savings",
    title: { en: "Add bank savings", ru: "Банковские сбережения", he: "הוספת חסכונות בבנק" },
    steps: [
      {
        id: "deposit1-open",
        say: {
          en: "Now bank savings. We open the deposit form and enter a fixed-term deposit: Bank Hapoalim, for an amount of 150 thousand shekels.",
          ru: "Теперь банковские сбережения. Открываем форму депозита и вводим вклад с фиксированной ставкой: банк Апоалим, сумма 150 тысяч шекелей.",
          he: "עכשיו חסכונות בבנק. פותחים את טופס הפיקדון ומזינים פיקדון בריבית קבועה: בנק הפועלים, בסכום של 150 אלף שקל.",
        },
        async run(c) {
          await c.s.scrollToTop();
          await openDeposit(c, BANK_DEPOSITS[0]);
        },
      },
      {
        id: "deposit1-terms",
        say: {
          en: "Then the start date, March 2026, the maturity date, March 2027, the rate type, fixed-term, and the interest, 4.2 percent a year. We save it.",
          ru: "Затем дата открытия, март 2026 года, дата погашения, март 2027 года, тип ставки, фиксированная, и процент, 4,2% годовых. Сохраняем.",
          he: "אחר כך תאריך הפתיחה, מרץ 2026, תאריך הפדיון, מרץ 2027, סוג הריבית, קבועה, והריבית עצמה, 4.2% בשנה. ושומרים.",
        },
        async run(c) {
          await finishDeposit(c, BANK_DEPOSITS[0]);
        },
      },
      {
        id: "deposit2-open",
        say: {
          en: "A second deposit, this time at Bank Leumi, for 80 thousand shekels.",
          ru: "Второй депозит, на этот раз в банке Леуми, на сумму 80 тысяч шекелей.",
          he: "פיקדון שני, הפעם בבנק לאומי, בסכום של 80 אלף שקל.",
        },
        async run(c) {
          await openDeposit(c, BANK_DEPOSITS[1]);
        },
      },
      {
        id: "deposit2-terms",
        say: {
          en: "This one runs for three years, from November 2025 to November 2028, at 3.9 percent a year, again fixed-term.",
          ru: "Он действует три года, с ноября 2025 по ноябрь 2028 года, под 3,9% годовых, тоже с фиксированной ставкой.",
          he: "הוא נמשך שלוש שנים, מנובמבר 2025 עד נובמבר 2028, בריבית של 3.9% בשנה, גם הוא בריבית קבועה.",
        },
        async run(c) {
          await finishDeposit(c, BANK_DEPOSITS[1]);
        },
      },
      {
        id: "total",
        say: {
          en: "The app works out each deposit's current value with interest, about 237 thousand shekels in total. Together with the shares, the couple's investments and deposits come to more than half a million shekels.",
          ru: "Приложение считает текущую стоимость каждого депозита с процентами, всего около 237 тысяч шекелей. Вместе с акциями инвестиции и депозиты пары превышают полмиллиона шекелей.",
          he: "האפליקציה מחשבת את השווי הנוכחי של כל פיקדון כולל ריבית, בסך הכול כ-237 אלף שקל. יחד עם המניות, ההשקעות והפיקדונות של בני הזוג עוברים את חצי המיליון שקל.",
        },
        async run(c) {
          const { s, t, page } = c;
          const deposits = page.getByText(t("myData.steps.bankDeposits.title"), { exact: true }).first();
          await s.glideTo(deposits, { top: 120 });
          await s.shot("deposits-table");
          await c.at(0.35);
          await s.scrollBy(380, 1600);
          await c.at(0.6);
          await s.highlight(page.getByText(t("myData.summary.equityStepTotal")).first(), 3000, 10);
        },
      },
    ],
  },

  {
    id: "expenses",
    title: { en: "Define expenses", ru: "Расходы", he: "הגדרת הוצאות" },
    steps: [
      {
        id: "mode",
        say: {
          en: "Now spending. How much will the couple need every month? We choose the itemised list, so that every expense is counted on its own.",
          ru: "Теперь расходы. Сколько супругам понадобится в месяц? Выбираем подробный список, чтобы каждый расход учитывался отдельно.",
          he: "עכשיו ההוצאות. כמה בני הזוג יצטרכו בכל חודש? בוחרים ברשימה מפורטת, כדי שכל הוצאה תיספר בנפרד.",
        },
        async run(c) {
          const { s, t, page } = c;
          await go(c, "/my-data/expenses");
          await s.pause(800);
          await c.at(0.6);
          await s.click(page.getByText(t("myData.steps.expenses.modeDetailed")).first(), { after: 900 });
          await s.shot("expenses-mode");
        },
      },
      {
        id: "suggestions-open",
        say: {
          en: "Instead of a blank page we open the suggestions. They are grouped by category, and under each name the app shows how often it is paid: every month, every two months, once a year, or every few years.",
          ru: "Вместо чистого листа открываем список предложений. Они сгруппированы по категориям, а под названием каждого приложение показывает, как часто он оплачивается: каждый месяц, раз в два месяца, раз в год или раз в несколько лет.",
          he: "במקום דף ריק פותחים את רשימת ההצעות. הן מקובצות לפי קטגוריות, ומתחת לשם של כל הוצאה האפליקציה מציגה כל כמה זמן משלמים אותה: כל חודש, כל חודשיים, פעם בשנה או פעם בכמה שנים.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.click(page.getByRole("button", { name: t("myData.steps.expenses.addFromSuggestions") }), { after: 900 });
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          await s.shot("suggestions-open");
          await c.at(0.3);
          await s.scrollInner(dialog, 1500, 6000);
          await c.at(0.85);
          await s.scrollInner(dialog, -1500, 1400);
        },
      },
      {
        id: "suggestions-home",
        say: {
          en: "We tick the first items: Arnona, the building committee, electricity, groceries, fuel and car insurance. For each one we enter what a single payment costs, in today's money. Arnona is paid every two months, so we enter the amount of one such bill.",
          ru: "Отмечаем первые пункты: арнона, ваад баит, электричество, продукты, топливо и автострахование. Для каждого указываем стоимость одного платежа в сегодняшних деньгах. Арнона оплачивается раз в два месяца, поэтому вводим сумму одного такого счёта.",
          he: "מסמנים את הסעיפים הראשונים: ארנונה, ועד בית, חשמל, מצרכי מזון, דלק וביטוח רכב. בכל סעיף מזינים כמה עולה תשלום אחד, במונחי היום. את הארנונה משלמים כל חודשיים, ולכן מזינים את סכום החשבון האחד.",
        },
        async run(c) {
          await pickExpenses(c, EXPENSE_PICKS.slice(0, 6));
        },
      },
      {
        id: "suggestions-rest",
        say: {
          en: "Then the bigger and rarer items: replacing the car, which happens every seven years, private health insurance, restaurants, a yearly trip abroad and help for the family. One click adds all eleven expenses to the list.",
          ru: "Затем более крупные и редкие траты: замена машины, которая происходит раз в семь лет, частная медицинская страховка, рестораны, ежегодная поездка за границу и помощь семье. Одним щелчком все одиннадцать расходов попадают в список.",
          he: "אחר כך ההוצאות הגדולות והנדירות יותר: החלפת רכב, שקורית אחת לשבע שנים, ביטוח בריאות פרטי, מסעדות, טיול שנתי בחו״ל ותמיכה במשפחה. בלחיצה אחת כל אחת עשרה ההוצאות נכנסות לרשימה.",
        },
        async run(c) {
          const { s, t, page } = c;
          await pickExpenses(c, EXPENSE_PICKS.slice(6));
          const dialog = page.getByRole("dialog");
          await s.shot("suggestions-picked");
          await c.at(0.85);
          await s.click(dialog.getByRole("button", { name: rx(t("myData.steps.expenses.suggestions.add", { count: EXPENSE_PICKS.length })) }), { after: 900 });
          await dialog.waitFor({ state: "hidden" });
        },
      },
      {
        id: "manual",
        say: {
          en: "Anything missing can be added by hand. Here we add household help: a name, a category, the amount, and a necessity level. We mark it as discretionary, because it is nice to have rather than essential.",
          ru: "Недостающее можно добавить вручную. Добавим помощь по хозяйству: название, категорию, сумму и степень необходимости. Отметим её как расход по желанию: это приятно иметь, но не обязательно.",
          he: "אפשר להוסיף ידנית כל הוצאה שחסרה. כאן מוסיפים עזרה בניקיון: שם, קטגוריה, סכום ורמת הכרחיות. מסמנים אותה כהוצאה לפי שיקול דעת, כי היא נחמדה אך לא הכרחית.",
        },
        async run({ s, t, lang, page }) {
          const f = (key) => t(`myData.steps.expenses.form.${key}`);
          await s.scrollToTop();
          await s.click(page.getByRole("button", { name: t("myData.steps.expenses.addItem") }), { after: 800 });
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          await s.type(dialog.getByLabel(rx(f("name"))), MANUAL_EXPENSE.name[lang], { delay: 70 });
          await s.select(dialog.getByLabel(rx(f("category"))), t("myData.steps.expenses.category.housing"));
          await s.type(dialog.getByLabel(rx(f("amount"))).first(), MANUAL_EXPENSE.amount, { delay: 90 });
          await s.select(dialog.getByLabel(rx(f("necessity"))), f("necessityDiscretionary"));
          await s.shot("expense-form");
          await s.pause(500);
          await s.click(dialog.getByRole("button", { name: t("common.save") }), { after: 900 });
          await dialog.waitFor({ state: "hidden" });
        },
      },
      {
        id: "total",
        say: {
          en: "The result: planned spending of about 24 thousand shekels a month, roughly half of it essential. Costs that come only now and then, such as replacing a car every seven years, are spread across the months.",
          ru: "Итог: планируемые расходы около 24 тысяч шекелей в месяц, примерно половина из них необходимые. Нерегулярные траты, например замена машины раз в семь лет, равномерно распределены по месяцам.",
          he: "התוצאה: הוצאה חודשית מתוכננת של כ-24 אלף שקל, כמחציתה הוצאות חיוניות. הוצאות שמגיעות רק מדי פעם, כמו החלפת רכב אחת לשבע שנים, מחולקות על פני החודשים.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.glideTo(textOf(page, t("myData.steps.expenses.plannedTitle")), { top: 120 });
          await s.shot("expenses-total");
          await c.at(0.4);
          await s.highlight(parentOf(textOf(page, t("myData.steps.expenses.plannedTitle"))), 3000, 10);
          await c.at(0.75);
          await s.scrollBy(520, 2000);
        },
      },
    ],
  },

  {
    id: "projections",
    title: { en: "Projections", ru: "Прогнозы", he: "תחזיות" },
    steps: [
      {
        id: "plan",
        say: {
          en: "Now the moment of truth: Projections. Retiring at 65, with planned spending of about 24 thousand shekels a month, the plan reads: funded to age 90. The couple's money covers their spending.",
          ru: "Теперь главное: «Прогнозы». При выходе на пенсию в 65 лет и расходах около 24 тысяч шекелей в месяц план показывает: расходы обеспечены до 90 лет. Накоплений супругам хватает.",
          he: "ועכשיו הרגע המכריע: תחזיות. בפרישה בגיל 65 ובהוצאה חודשית של כ-24 אלף שקל, התוכנית מראה שההוצאה ממומנת עד גיל 90. הכסף של בני הזוג מספיק להוצאות שלהם.",
        },
        async run(c) {
          const { s, t, page } = c;
          await go(c, "/projections");
          await s.pause(1200);
          await c.at(0.3);
          await s.highlight(page.getByText(rx(t("projections.planBar.fundedTo", { age: 90 }))).first(), 3200, 12);
          await c.at(0.75);
          await s.scrollBy(300, 2200);
        },
      },
      {
        id: "overview",
        say: {
          en: "The chart shows the household's net worth year by year, in today's money. The dashed lines mark when each partner retires. After that the line dips as they start to draw on their savings, and then keeps rising.",
          ru: "На графике чистый капитал семьи по годам, в сегодняшних деньгах. Пунктиром отмечены моменты выхода на пенсию каждого из партнёров. После этого линия немного снижается: супруги начинают тратить накопления. Затем она снова растёт.",
          he: "הגרף מציג את השווי הנקי של משק הבית משנה לשנה, במונחי היום. הקווים המקווקווים מסמנים את מועד הפרישה של כל אחד מבני הזוג. אחריה הקו יורד מעט, כי מתחילים למשוך מהחיסכון, ואז ממשיך לעלות.",
        },
        async run(c) {
          const { s, t, page } = c;
          const chart = textOf(page, t("projections.netWorthChart"));
          await s.glideTo(chart, { top: 110 });
          await s.shot("net-worth");
          await c.at(0.3);
          await s.moveTo(520, 640, 1200);
          await c.at(0.55);
          await s.moveTo(1180, 520, 3500);
          await c.at(0.8);
          await s.moveTo(1380, 430, 2200);
        },
      },
      {
        id: "scenarios",
        say: {
          en: "With one click we can compare retiring early, at 60, with retiring at 65, or delaying until 68. The charts and cards on the page follow the choice, and we can always return to the standard scenario.",
          ru: "Одним щелчком можно сравнить выход на пенсию раньше, в 60 лет, с выходом в 65 или позже, в 68. Графики и карточки на странице следуют за выбором, а к стандартному сценарию всегда можно вернуться.",
          he: "בלחיצה אחת אפשר להשוות פרישה מוקדמת, בגיל 60, לפרישה בגיל 65 או לדחייה עד גיל 68. הגרפים והכרטיסים בעמוד מתעדכנים לפי הבחירה, ותמיד אפשר לחזור לתרחיש הרגיל.",
        },
        async run(c) {
          const { s, t, page } = c;
          const option = (name, age) => {
            const label = t("projections.scenarioOption", { name: t(`projections.scenario${name}`), age });
            return page.getByRole("radio", { name: rx(label) }).or(page.getByRole("button", { name: rx(label) }));
          };
          await s.scrollToTop();
          await c.at(0.2);
          await s.click(option("Early", 60), { after: 1800 });
          await s.shot("scenario-early");
          await c.at(0.5);
          await s.click(option("Delayed", 68), { after: 1800 });
          await s.shot("scenario-delayed");
          await c.at(0.8);
          await s.click(option("Standard", 65), { after: 1500 });
        },
      },
      {
        id: "income",
        say: {
          en: "Under Income and tax, the app shows the sustainable monthly income by source, before and after tax. Even in the leanest year the income after tax is well above the planned spending.",
          ru: "В разделе «Доход и налоги» приложение показывает устойчивый ежемесячный доход по источникам, до и после налога. Даже в самый скромный год доход после налога заметно выше запланированных расходов.",
          he: "בחלק «הכנסה ומס» האפליקציה מציגה את ההכנסה החודשית בת-הקיימא לפי מקור, לפני מס ואחריו. גם בשנה הצנועה ביותר ההכנסה אחרי מס גבוהה בהרבה מההוצאה המתוכננת.",
        },
        async run(c) {
          const { s, page } = c;
          await s.glideTo(page.locator("#projections-income"), { top: 90 });
          await s.shot("income");
          await c.at(0.5);
          await s.scrollBy(620, 2800);
          await c.at(0.8);
          await s.scrollBy(620, 2800);
        },
      },
      {
        id: "spending",
        say: {
          en: "Spending shows the retirement budget, split into essential and discretionary costs, with the irregular ones included.",
          ru: "Раздел «Расходы» показывает бюджет на пенсии, разделённый на необходимые и желаемые траты, с учётом нерегулярных.",
          he: "בחלק «הוצאות» מוצג תקציב הפרישה, מחולק להוצאות חיוניות ולהוצאות לפי שיקול דעת, כולל ההוצאות הלא קבועות.",
        },
        async run(c) {
          const { s, page } = c;
          await s.glideTo(page.locator("#projections-spending"), { top: 90 });
          await s.shot("spending");
          await c.at(0.5);
          await s.scrollBy(420, 2200);
        },
      },
      {
        id: "risk",
        say: {
          en: "Markets never move in a straight line. The risk analysis replays the plan on two thousand random market histories, and the historical backtest checks it against 54 real starting years since 1928. For this couple the chance that their spending lasts to age 90 is about 99 percent.",
          ru: "Рынки никогда не растут по прямой. Анализ рисков прогоняет план через две тысячи случайных рыночных сценариев, а исторический тест проверяет его на 54 реальных стартовых годах, начиная с 1928-го. У этой пары вероятность, что расходов хватит до 90 лет, около 99 процентов.",
          he: "השווקים אף פעם לא עולים בקו ישר. ניתוח הסיכונים מריץ את התוכנית על אלפיים היסטוריות שוק אקראיות, והבדיקה ההיסטורית בוחנת אותה מול 54 שנות פתיחה אמיתיות מאז 1928. אצל בני הזוג האלה הסיכוי שההוצאה תחזיק עד גיל 90 הוא כ-99 אחוז.",
        },
        async run(c) {
          const { s, page } = c;
          await s.glideTo(page.locator("#projections-risk"), { top: 90 });
          await s.settle(1000);
          await s.shot("risk");
          await c.at(0.45);
          await s.scrollBy(560, 3000);
          await c.at(0.75);
          await s.scrollBy(560, 3000);
        },
      },
      {
        id: "age",
        say: {
          en: "Finally, Retirement age. The app finds the earliest feasible retirement age, and compares income after tax at 60, 65 and 68. This couple is on track, and could even retire earlier.",
          ru: "Наконец, «Возраст выхода». Приложение находит самый ранний возможный возраст выхода на пенсию и сравнивает доход после налога при выходе в 60, 65 и 68 лет. Эта пара на верном пути и даже может выйти на пенсию раньше.",
          he: "לסיום, «גיל פרישה». האפליקציה מוצאת את גיל הפרישה המוקדם ביותר האפשרי, ומשווה את ההכנסה אחרי מס בפרישה בגיל 60, 65 ו-68. בני הזוג האלה בדרך הנכונה, ואפשר שיוכלו לפרוש אף מוקדם יותר.",
        },
        async run(c) {
          const { s, page } = c;
          await s.glideTo(page.locator("#projections-age"), { top: 90 });
          await s.shot("retirement-age");
          await c.at(0.4);
          await s.scrollBy(520, 2600);
          await c.at(0.75);
          await s.scrollBy(520, 2600);
        },
      },
    ],
  },

  {
    id: "outro",
    title: { en: "Save and wrap up", ru: "Сохранение и итоги", he: "שמירה וסיכום" },
    steps: [
      {
        id: "backup",
        say: {
          en: "Your plan is stored only in this browser, so download a backup and keep the file somewhere safe. You can load it back from Settings whenever you like.",
          ru: "План хранится только в этом браузере, поэтому скачайте резервную копию и сохраните файл в надёжном месте. Загрузить её обратно можно в настройках в любой момент.",
          he: "התוכנית נשמרת רק בדפדפן הזה, ולכן הורידו גיבוי ושמרו את הקובץ במקום בטוח. אפשר לטעון אותו בחזרה מההגדרות בכל עת.",
        },
        async run(c) {
          const { s, t, page } = c;
          await s.scrollToTop();
          const download = page.getByRole("button", { name: t("backup.reminder.download") });
          await c.at(0.4);
          if (await download.isVisible().catch(() => false)) {
            await s.highlight(download, 1800, 10);
            await c.at(0.75);
            await s.click(download, { after: 1200 });
          }
          await s.shot("backup");
        },
      },
      {
        id: "closing",
        say: {
          en: "That is the whole journey: import your reports, add what is missing, enter investments, savings and expenses, and see when you can retire. Try it with your own numbers.",
          ru: "Вот и весь путь: импортируйте отчёты, добавьте недостающее, внесите инвестиции, сбережения и расходы и узнайте, когда вы сможете выйти на пенсию. Попробуйте со своими цифрами.",
          he: "זה כל המסע: מייבאים דוחות, משלימים את מה שחסר, מזינים השקעות, חסכונות והוצאות, ורואים מתי אפשר לפרוש. נסו עם המספרים שלכם.",
        },
        async run(c) {
          const { s, t, page } = c;
          await go(c, "/dashboard");
          await s.shot("dashboard");
          await c.at(0.25);
          await s.highlight(page.getByText(t("dashboard.statusOnTrack")).first(), 2400, 12);
          await c.at(0.55);
          await s.highlight(parentOf(textOf(page, t("dashboard.kpi.monthlyIncome"))), 2600, 6);
          await c.at(0.85);
          await s.moveTo(900, 420, 1200);
        },
      },
    ],
  },
];
