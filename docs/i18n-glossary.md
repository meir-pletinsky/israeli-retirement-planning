# Translation glossary

One term per product and concept, so a reader meets the same word on every screen. Add
to it when a new term appears; the translations live in `app/src/i18n/locales/`.
Wording here is a proposal until a native speaker has reviewed it.

## Style rules (all languages)

- A dash in running text is an en dash with spaces ("Early – age 60"), never a hyphen.
- A number that counts something goes through the plural mechanism (`count`), or the text
  is rephrased so the number stands alone ("Возраст: 54"). See "Russian plurals" below.
- Numbers, percentages, dates and chart abbreviations follow the app language, not the
  browser (see `app/src/i18n/formatters.ts`).

## Russian

The reader is addressed as "вы".

| Concept | Term | Notes |
| --- | --- | --- |
| Study fund | керен хиштальмут | Capital "К" only at the start of a label. The account-type option adds the explanation: "Керен хиштальмут (фонд обучения)". |
| Provident fund | купат гемель | Account-type option: "Купат гемель (фонд обеспечения)". Investment version: "инвестиционная купат гемель". |
| Annuity | аннуитет | Never "рента". |
| Assumptions | допущения | Never "предположения". |
| Withdrawal (from savings) | снятие | Never "изъятие". |
| Monthly surplus | излишек | KPI "Ежемесячный излишек", row "Излишек … в месяц". The opposite is "дефицит" / "не хватает". |
| On track | на верном пути | Never "цель достигнута": the plan is a projection, not a result. |
| Sample report / its accounts | пример отчёта / счета из примера | Never "примерные счета" ("approximate"). |
| Active, still paying in | Активный — идут взносы | The option and the helper text use the same words. |
| Paid-up / frozen | Взносы прекращены / счёт заморожен | Two parallel phrases. |

### Russian plurals

Russian has three forms (1 год, 2 года, 5 лет). Any text where a placeholder is followed
by a counted noun (years, months, shares, accounts) uses `_one` / `_few` / `_many` /
`_other` keys and receives `count`. `localeParity.test.ts` flags a Russian text where a
placeholder is directly followed by one of these nouns without a plural key.

## Hebrew

The reader is addressed in the plural ("אתם", "שלכם") throughout. Avoid the singular
"אתה" and "שלך", and use plural imperatives ("הזינו", "בחרו"). Status labels in the
account list and in the helper text use the same words ("פעיל — בהפקדה").
