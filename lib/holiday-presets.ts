/**
 * Public holidays by country, worked out for any year from rules: fixed
 * dates, dates that hang off Easter (Western or Orthodox), "the last Monday
 * in May" and so on, plus a table for the Islamic holidays, which follow the
 * moon and can't be calculated ahead with certainty.
 *
 * These fill a holiday calendar when an admin creates one or adds a new
 * year. They are a starting point, not the law: every date lands in the
 * calendar as an ordinary row the admin can rename or remove, and the admin
 * page says to check them. Only national holidays are listed. Where days off
 * differ by region (German states, Spanish communities, Swiss cantons, US
 * states) the admin adds the local ones by hand.
 *
 * Pure: no database, no network. Countries without a preset here can still be
 * filled from Nager.Date (lib/holiday-calendars.ts).
 */

import { countryList, countryName } from "@/lib/countries";

export type PresetHoliday = {
  date: string; // YYYY-MM-DD
  name: string;
  /** Islamic holidays: the date is the expected one and may move by a day once announced. */
  expected?: boolean;
};

/**
 * What happens when a holiday falls on a weekend.
 *  none     nothing: the day is simply lost (most of continental Europe)
 *  weekend  a Saturday or Sunday holiday gives the next free weekday off (UK, Kosovo)
 *  sunday   only a Sunday holiday moves, to the next free weekday (North Macedonia, Serbia)
 *  nearest  Saturday moves back to Friday, Sunday on to Monday (US federal)
 */
type Observe = "none" | "weekend" | "sunday" | "nearest";

type Rule = {
  name: string;
  /** Usually one date; a list when a year can hold the same holiday twice (Eid in 2033). */
  on: (year: number) => Date | Date[] | null;
  /** Overrides the country's rule, e.g. Easter Monday never needs moving. */
  observe?: Observe;
  expected?: boolean;
};

export type HolidayPreset = {
  /** Usually the country code; GB has one per nation. */
  key: string;
  country: string;
  label: string;
  observe: Observe;
  rules: Rule[];
  /** Shown under the preset in the picker. */
  note?: string;
};

// ---------- Date helpers (UTC throughout, so no time zone can shift a day) ----------

const SUN = 0, MON = 1, THU = 4, FRI = 5, SAT = 6;

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function plusDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export function westernEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** Orthodox Easter Sunday as a Gregorian date (Meeus Julian algorithm, valid 1900 to 2099). */
export function orthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return plusDays(utc(year, month, day), 13);
}

// ---------- Rule builders ----------

const fixed = (month: number, day: number) => (y: number) => utc(y, month, day);
const easter = (offset: number) => (y: number) => plusDays(westernEaster(y), offset);
const orthodox = (offset: number) => (y: number) => plusDays(orthodoxEaster(y), offset);

/** The nth `weekday` of a month; n = -1 is the last. */
function nth(month: number, weekday: number, n: number) {
  return (y: number) => {
    if (n > 0) {
      const first = utc(y, month, 1);
      return plusDays(first, ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
    }
    const last = utc(y, month + 1, 0);
    return plusDays(last, -((last.getUTCDay() - weekday + 7) % 7));
  };
}

/** The first `weekday` on or after a date (Midsummer Eve: the Friday from 19 June). */
function onOrAfter(month: number, day: number, weekday: number) {
  return (y: number) => {
    const start = utc(y, month, day);
    return plusDays(start, (weekday - start.getUTCDay() + 7) % 7);
  };
}

/** The last `weekday` on or before a date (Victoria Day: the Monday before 25 May). */
function onOrBefore(month: number, day: number, weekday: number) {
  return (y: number) => {
    const end = utc(y, month, day);
    return plusDays(end, -((end.getUTCDay() - weekday + 7) % 7));
  };
}

/** A rule that skips the given years (Slovakia's 2026 savings measures). */
function except(rule: (y: number) => Date | null, ...years: number[]) {
  return (y: number) => (years.includes(y) ? null : rule(y));
}

/** A rule that only applies from (or until) a given year. */
function between(rule: (y: number) => Date | null, from: number, until = 9999) {
  return (y: number) => (y >= from && y <= until ? rule(y) : null);
}


// ---------- The Islamic holidays ----------
// First day of each Eid by the astronomical (Diyanet / Umm al-Qura) calendar,
// which most Balkan communities announce. Local announcements can differ by a
// day, so these are marked "expected" and the admin can move them.

// Every first day, as ISO dates. 2033 has two Eid al-Fitrs, January and December.
const EID_AL_FITR = [
  "2024-04-10", "2025-03-30", "2026-03-20", "2027-03-10", "2028-02-27", "2029-02-15",
  "2030-02-05", "2031-01-25", "2032-01-14", "2033-01-02", "2033-12-23", "2034-12-12",
  "2035-12-01",
];

const EID_AL_ADHA = [
  "2024-06-16", "2025-06-06", "2026-05-27", "2027-05-16", "2028-05-05", "2029-04-24",
  "2030-04-14", "2031-04-03", "2032-03-22", "2033-03-11", "2034-03-01", "2035-02-18",
];

/** Dates from a list, those in the year asked for, moved by `offset` days. */
function listed(dates: string[], offset = 0) {
  return (y: number) =>
    dates
      .map((d) => plusDays(new Date(`${d}T00:00:00Z`), offset))
      .filter((d) => d.getUTCFullYear() === y);
}

function eidAlFitr(name: string, dayOffset = 0): Rule {
  return { name, on: listed(EID_AL_FITR, dayOffset), expected: true };
}

function eidAlAdha(name: string, dayOffset = 0): Rule {
  return { name, on: listed(EID_AL_ADHA, dayOffset), expected: true };
}

// New Zealand's Matariki is set by law for each year, from the Māori lunar calendar.
const MATARIKI = [
  "2022-06-24", "2023-07-14", "2024-06-28", "2025-06-20", "2026-07-10", "2027-06-25",
  "2028-07-14", "2029-07-06", "2030-06-21", "2031-07-11", "2032-07-02", "2033-06-24",
  "2034-07-07", "2035-06-29",
];

// ---------- Countries ----------

const r = (name: string, on: Rule["on"], observe?: Observe): Rule => ({ name, on, observe });

const NEW_YEAR = r("New Year's Day", fixed(1, 1));
const CHRISTMAS = r("Christmas Day", fixed(12, 25));
const GOOD_FRIDAY = r("Good Friday", easter(-2));
const EASTER_SUNDAY = r("Easter Sunday", easter(0));
const EASTER_MONDAY = r("Easter Monday", easter(1));
const ASCENSION = r("Ascension Day", easter(39));
const WHIT_SUNDAY = r("Whit Sunday", easter(49));
const WHIT_MONDAY = r("Whit Monday", easter(50));
const CORPUS_CHRISTI = r("Corpus Christi", easter(60));
const LABOUR_DAY = r("Labour Day", fixed(5, 1));
const ASSUMPTION = r("Assumption Day", fixed(8, 15));
const ALL_SAINTS = r("All Saints' Day", fixed(11, 1));
const IMMACULATE = r("Immaculate Conception", fixed(12, 8));
const EPIPHANY = r("Epiphany", fixed(1, 6));

const PRESETS: HolidayPreset[] = [
  // ----- The Balkans -----
  {
    key: "XK",
    country: "XK",
    label: "Kosovo",
    observe: "weekend",
    note: "Law No. 03/L-064 on Official Holidays. A holiday on a weekend gives the next working day off.",
    rules: [
      NEW_YEAR,
      r("New Year holiday", fixed(1, 2)),
      r("Orthodox Christmas", fixed(1, 7)),
      r("Independence Day", fixed(2, 17)),
      r("Constitution Day", fixed(4, 9)),
      r("Catholic Easter Monday", easter(1), "none"),
      r("Orthodox Easter Monday", orthodox(1), "none"),
      LABOUR_DAY,
      r("Europe Day", fixed(5, 9)),
      eidAlFitr("Eid al-Fitr (Bajrami i Madh)"),
      eidAlAdha("Eid al-Adha (Kurban Bajrami)"),
      r("Catholic Christmas", fixed(12, 25)),
    ],
  },
  {
    key: "AL",
    country: "AL",
    label: "Albania",
    observe: "weekend",
    rules: [
      NEW_YEAR,
      r("New Year holiday", fixed(1, 2)),
      r("Summer Day", fixed(3, 14)),
      r("Nowruz", fixed(3, 22)),
      r("Catholic Easter", easter(0)),
      r("Orthodox Easter", orthodox(0)),
      LABOUR_DAY,
      eidAlFitr("Eid al-Fitr"),
      eidAlAdha("Eid al-Adha"),
      r("Mother Teresa Day", fixed(9, 5)),
      r("Alphabet Day", between(fixed(11, 22), 2024)),
      r("Independence Day", fixed(11, 28)),
      r("Liberation Day", fixed(11, 29)),
      r("National Youth Day", fixed(12, 8)),
      CHRISTMAS,
    ],
  },
  {
    key: "MK",
    country: "MK",
    label: "North Macedonia",
    observe: "sunday",
    rules: [
      NEW_YEAR,
      r("Orthodox Christmas", fixed(1, 7)),
      r("Orthodox Easter Monday", orthodox(1), "none"),
      LABOUR_DAY,
      r("Saints Cyril and Methodius Day", fixed(5, 24)),
      r("Republic Day (Ilinden)", fixed(8, 2)),
      r("Independence Day", fixed(9, 8)),
      r("Day of the People's Uprising", fixed(10, 11)),
      r("Day of the Macedonian Revolutionary Struggle", fixed(10, 23)),
      r("Saint Clement of Ohrid Day", fixed(12, 8)),
      eidAlFitr("Eid al-Fitr"),
    ],
  },
  {
    key: "RS",
    country: "RS",
    label: "Serbia",
    observe: "sunday",
    rules: [
      NEW_YEAR,
      r("New Year holiday", fixed(1, 2)),
      r("Orthodox Christmas", fixed(1, 7), "none"),
      r("Statehood Day", fixed(2, 15)),
      r("Statehood Day holiday", fixed(2, 16)),
      r("Orthodox Good Friday", orthodox(-2), "none"),
      r("Orthodox Holy Saturday", orthodox(-1), "none"),
      r("Orthodox Easter", orthodox(0), "none"),
      r("Orthodox Easter Monday", orthodox(1), "none"),
      LABOUR_DAY,
      r("Labour Day holiday", fixed(5, 2)),
      r("Armistice Day", fixed(11, 11)),
    ],
  },
  {
    key: "ME",
    country: "ME",
    label: "Montenegro",
    observe: "sunday",
    rules: [
      NEW_YEAR,
      r("New Year holiday", fixed(1, 2)),
      LABOUR_DAY,
      r("Labour Day holiday", fixed(5, 2)),
      r("Independence Day", fixed(5, 21)),
      r("Independence Day holiday", fixed(5, 22)),
      r("Statehood Day", fixed(7, 13)),
      r("Statehood Day holiday", fixed(7, 14)),
    ],
    note: "Religious holidays are days off only for those who celebrate them; add them if your team does.",
  },
  {
    key: "BA",
    country: "BA",
    label: "Bosnia and Herzegovina",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("New Year holiday", fixed(1, 2)),
      r("Independence Day", fixed(3, 1)),
      LABOUR_DAY,
      r("Labour Day holiday", fixed(5, 2)),
      r("Statehood Day", fixed(11, 25)),
    ],
    note: "The Federation's holidays. Republika Srpska and religious holidays differ; add those by hand.",
  },
  {
    key: "HR",
    country: "HR",
    label: "Croatia",
    observe: "none",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("Statehood Day", fixed(5, 30)),
      CORPUS_CHRISTI,
      r("Anti-Fascist Struggle Day", fixed(6, 22)),
      r("Victory and Homeland Thanksgiving Day", fixed(8, 5)),
      ASSUMPTION,
      ALL_SAINTS,
      r("Remembrance Day", fixed(11, 18)),
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "SI",
    country: "SI",
    label: "Slovenia",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("New Year holiday", fixed(1, 2)),
      r("Prešeren Day", fixed(2, 8)),
      EASTER_SUNDAY,
      EASTER_MONDAY,
      r("Day of Uprising Against Occupation", fixed(4, 27)),
      LABOUR_DAY,
      r("Labour Day holiday", fixed(5, 2)),
      r("Whit Sunday", easter(49)),
      r("Statehood Day", fixed(6, 25)),
      ASSUMPTION,
      r("Reformation Day", fixed(10, 31)),
      r("Remembrance Day", fixed(11, 1)),
      CHRISTMAS,
      r("Independence and Unity Day", fixed(12, 26)),
    ],
  },
  {
    key: "BG",
    country: "BG",
    label: "Bulgaria",
    observe: "weekend",
    rules: [
      NEW_YEAR,
      r("Liberation Day", fixed(3, 3)),
      r("Orthodox Good Friday", orthodox(-2), "none"),
      r("Orthodox Holy Saturday", orthodox(-1), "none"),
      r("Orthodox Easter", orthodox(0), "none"),
      r("Orthodox Easter Monday", orthodox(1), "none"),
      LABOUR_DAY,
      r("St. George's Day", fixed(5, 6)),
      r("Culture and Literacy Day", fixed(5, 24)),
      r("Unification Day", fixed(9, 6)),
      r("Independence Day", fixed(9, 22)),
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },
  {
    key: "RO",
    country: "RO",
    label: "Romania",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("New Year holiday", fixed(1, 2)),
      EPIPHANY,
      r("St. John the Baptist", fixed(1, 7)),
      r("Unification Day", fixed(1, 24)),
      r("Orthodox Good Friday", orthodox(-2)),
      r("Orthodox Easter", orthodox(0)),
      r("Orthodox Easter Monday", orthodox(1)),
      LABOUR_DAY,
      r("Children's Day", fixed(6, 1)),
      r("Orthodox Pentecost", orthodox(49)),
      r("Orthodox Whit Monday", orthodox(50)),
      ASSUMPTION,
      r("St. Andrew's Day", fixed(11, 30)),
      r("National Day", fixed(12, 1)),
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },
  {
    key: "GR",
    country: "GR",
    label: "Greece",
    observe: "none",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      r("Clean Monday", orthodox(-48)),
      r("Independence Day", fixed(3, 25)),
      r("Orthodox Good Friday", orthodox(-2)),
      r("Orthodox Easter Monday", orthodox(1)),
      LABOUR_DAY,
      r("Orthodox Whit Monday", orthodox(50)),
      ASSUMPTION,
      r("Ochi Day", fixed(10, 28)),
      CHRISTMAS,
      r("Synaxis of the Mother of God", fixed(12, 26)),
    ],
  },
  {
    key: "CY",
    country: "CY",
    label: "Cyprus",
    observe: "none",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      r("Green Monday", orthodox(-48)),
      r("Greek Independence Day", fixed(3, 25)),
      r("Cyprus National Day", fixed(4, 1)),
      r("Orthodox Good Friday", orthodox(-2)),
      r("Orthodox Easter Monday", orthodox(1)),
      LABOUR_DAY,
      r("Kataklysmos", orthodox(50)),
      ASSUMPTION,
      r("Cyprus Independence Day", fixed(10, 1)),
      r("Ochi Day", fixed(10, 28)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
    ],
  },
  {
    key: "TR",
    country: "TR",
    label: "Turkey",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("National Sovereignty and Children's Day", fixed(4, 23)),
      r("Labour and Solidarity Day", fixed(5, 1)),
      r("Atatürk Commemoration, Youth and Sports Day", fixed(5, 19)),
      r("Democracy and National Unity Day", fixed(7, 15)),
      r("Victory Day", fixed(8, 30)),
      r("Republic Day", fixed(10, 29)),
      eidAlFitr("Ramadan Feast, day 1"),
      eidAlFitr("Ramadan Feast, day 2", 1),
      eidAlFitr("Ramadan Feast, day 3", 2),
      eidAlAdha("Sacrifice Feast, day 1"),
      eidAlAdha("Sacrifice Feast, day 2", 1),
      eidAlAdha("Sacrifice Feast, day 3", 2),
      eidAlAdha("Sacrifice Feast, day 4", 3),
    ],
  },

  // ----- Ireland and the UK -----
  {
    key: "IE",
    country: "IE",
    label: "Ireland",
    observe: "none",
    note: "A public holiday on a weekend isn't moved by law; employers usually give the next working day. Add it if you do.",
    rules: [
      NEW_YEAR,
      r(
        "St. Brigid's Day",
        between((y) => {
          // The first Monday in February, or 1 February itself when that's a Friday.
          const first = utc(y, 2, 1);
          return first.getUTCDay() === FRI ? first : nth(2, MON, 1)(y);
        }, 2023)
      ),
      r("St. Patrick's Day", fixed(3, 17)),
      EASTER_MONDAY,
      r("May Bank Holiday", nth(5, MON, 1)),
      r("June Bank Holiday", nth(6, MON, 1)),
      r("August Bank Holiday", nth(8, MON, 1)),
      r("October Bank Holiday", nth(10, MON, -1)),
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "GB-ENG",
    country: "GB",
    label: "United Kingdom: England and Wales",
    observe: "weekend",
    rules: [
      NEW_YEAR,
      GOOD_FRIDAY,
      EASTER_MONDAY,
      r("Early May Bank Holiday", nth(5, MON, 1)),
      r("Spring Bank Holiday", nth(5, MON, -1)),
      r("Summer Bank Holiday", nth(8, MON, -1)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
    ],
  },
  {
    key: "GB-SCT",
    country: "GB",
    label: "United Kingdom: Scotland",
    observe: "weekend",
    rules: [
      NEW_YEAR,
      r("2nd January", fixed(1, 2)),
      GOOD_FRIDAY,
      r("Early May Bank Holiday", nth(5, MON, 1)),
      r("Spring Bank Holiday", nth(5, MON, -1)),
      r("Summer Bank Holiday", nth(8, MON, 1)),
      r("St. Andrew's Day", fixed(11, 30)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
    ],
  },
  {
    key: "GB-NIR",
    country: "GB",
    label: "United Kingdom: Northern Ireland",
    observe: "weekend",
    rules: [
      NEW_YEAR,
      r("St. Patrick's Day", fixed(3, 17)),
      GOOD_FRIDAY,
      EASTER_MONDAY,
      r("Early May Bank Holiday", nth(5, MON, 1)),
      r("Spring Bank Holiday", nth(5, MON, -1)),
      r("Battle of the Boyne (Orangemen's Day)", fixed(7, 12)),
      r("Summer Bank Holiday", nth(8, MON, -1)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
    ],
  },

  // ----- Western Europe -----
  {
    key: "DE",
    country: "DE",
    label: "Germany",
    observe: "none",
    note: "Nationwide holidays only. Each state adds its own (Epiphany, Corpus Christi, Reformation Day, ...).",
    rules: [
      NEW_YEAR,
      GOOD_FRIDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      ASCENSION,
      WHIT_MONDAY,
      r("German Unity Day", fixed(10, 3)),
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "AT",
    country: "AT",
    label: "Austria",
    observe: "none",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      EASTER_MONDAY,
      r("National Holiday", fixed(5, 1)),
      ASCENSION,
      WHIT_MONDAY,
      CORPUS_CHRISTI,
      ASSUMPTION,
      r("National Day", fixed(10, 26)),
      ALL_SAINTS,
      IMMACULATE,
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "CH",
    country: "CH",
    label: "Switzerland",
    observe: "none",
    note: "Holidays kept in most cantons. Only 1 August is national; add or remove your canton's.",
    rules: [
      NEW_YEAR,
      GOOD_FRIDAY,
      EASTER_MONDAY,
      ASCENSION,
      WHIT_MONDAY,
      r("Swiss National Day", fixed(8, 1)),
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "FR",
    country: "FR",
    label: "France",
    observe: "none",
    rules: [
      NEW_YEAR,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("Victory in Europe Day", fixed(5, 8)),
      ASCENSION,
      WHIT_MONDAY,
      r("Bastille Day", fixed(7, 14)),
      ASSUMPTION,
      ALL_SAINTS,
      r("Armistice Day", fixed(11, 11)),
      CHRISTMAS,
    ],
  },
  {
    key: "BE",
    country: "BE",
    label: "Belgium",
    observe: "none",
    rules: [
      NEW_YEAR,
      EASTER_MONDAY,
      LABOUR_DAY,
      ASCENSION,
      WHIT_MONDAY,
      r("Belgian National Day", fixed(7, 21)),
      ASSUMPTION,
      ALL_SAINTS,
      r("Armistice Day", fixed(11, 11)),
      CHRISTMAS,
    ],
  },
  {
    key: "NL",
    country: "NL",
    label: "Netherlands",
    observe: "none",
    note: "Good Friday and Liberation Day (5 May) are days off only under some contracts; add them if yours are.",
    rules: [
      NEW_YEAR,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      // 27 April, or the 26th when the 27th is a Sunday.
      r("King's Day", (y) => (utc(y, 4, 27).getUTCDay() === SUN ? utc(y, 4, 26) : utc(y, 4, 27))),
      ASCENSION,
      WHIT_SUNDAY,
      WHIT_MONDAY,
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },
  {
    key: "LU",
    country: "LU",
    label: "Luxembourg",
    observe: "none",
    rules: [
      NEW_YEAR,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("Europe Day", fixed(5, 9)),
      ASCENSION,
      WHIT_MONDAY,
      r("National Day", fixed(6, 23)),
      ASSUMPTION,
      ALL_SAINTS,
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },

  // ----- Southern Europe -----
  {
    key: "ES",
    country: "ES",
    label: "Spain",
    observe: "none",
    note: "National holidays only. Each autonomous community and town adds its own.",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      GOOD_FRIDAY,
      LABOUR_DAY,
      ASSUMPTION,
      r("National Day of Spain", fixed(10, 12)),
      ALL_SAINTS,
      r("Constitution Day", fixed(12, 6)),
      IMMACULATE,
      CHRISTMAS,
    ],
  },
  {
    key: "PT",
    country: "PT",
    label: "Portugal",
    observe: "none",
    rules: [
      NEW_YEAR,
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      r("Freedom Day", fixed(4, 25)),
      LABOUR_DAY,
      CORPUS_CHRISTI,
      r("Portugal Day", fixed(6, 10)),
      ASSUMPTION,
      r("Republic Day", fixed(10, 5)),
      ALL_SAINTS,
      r("Restoration of Independence", fixed(12, 1)),
      IMMACULATE,
      CHRISTMAS,
    ],
  },
  {
    key: "IT",
    country: "IT",
    label: "Italy",
    observe: "none",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      r("Liberation Day", fixed(4, 25)),
      LABOUR_DAY,
      r("Republic Day", fixed(6, 2)),
      ASSUMPTION,
      r("St. Francis of Assisi", between(fixed(10, 4), 2026)),
      ALL_SAINTS,
      IMMACULATE,
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "MT",
    country: "MT",
    label: "Malta",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("St. Paul's Shipwreck", fixed(2, 10)),
      r("St. Joseph's Day", fixed(3, 19)),
      r("Freedom Day", fixed(3, 31)),
      GOOD_FRIDAY,
      r("Workers' Day", fixed(5, 1)),
      r("Sette Giugno", fixed(6, 7)),
      r("Feast of St. Peter and St. Paul", fixed(6, 29)),
      ASSUMPTION,
      r("Victory Day", fixed(9, 8)),
      r("Independence Day", fixed(9, 21)),
      IMMACULATE,
      r("Republic Day", fixed(12, 13)),
      CHRISTMAS,
    ],
  },

  // ----- Central and Eastern Europe -----
  {
    key: "PL",
    country: "PL",
    label: "Poland",
    observe: "none",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      r("Labour Day", fixed(5, 1)),
      r("Constitution Day", fixed(5, 3)),
      r("Pentecost", easter(49)),
      CORPUS_CHRISTI,
      ASSUMPTION,
      ALL_SAINTS,
      r("Independence Day", fixed(11, 11)),
      r("Christmas Eve", between(fixed(12, 24), 2025)),
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },
  {
    key: "CZ",
    country: "CZ",
    label: "Czechia",
    observe: "none",
    rules: [
      r("New Year's Day / Restoration Day", fixed(1, 1)),
      GOOD_FRIDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("Liberation Day", fixed(5, 8)),
      r("Saints Cyril and Methodius Day", fixed(7, 5)),
      r("Jan Hus Day", fixed(7, 6)),
      r("St. Wenceslas Day", fixed(9, 28)),
      r("Independent Czechoslovak State Day", fixed(10, 28)),
      r("Struggle for Freedom and Democracy Day", fixed(11, 17)),
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "SK",
    country: "SK",
    label: "Slovakia",
    observe: "none",
    rules: [
      r("Republic Day", fixed(1, 1)),
      EPIPHANY,
      GOOD_FRIDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("Victory over Fascism Day", except(fixed(5, 8), 2026)),
      r("Saints Cyril and Methodius Day", fixed(7, 5)),
      r("Slovak National Uprising", fixed(8, 29)),
      r("Our Lady of Sorrows", except(fixed(9, 15), 2026)),
      ALL_SAINTS,
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
    note: "1 September and 17 November stopped being days off in 2025; 8 May and 15 September are working days in 2026.",
  },
  {
    key: "HU",
    country: "HU",
    label: "Hungary",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("National Day", fixed(3, 15)),
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      WHIT_SUNDAY,
      WHIT_MONDAY,
      r("St. Stephen's Day", fixed(8, 20)),
      r("1956 Revolution Memorial Day", fixed(10, 23)),
      ALL_SAINTS,
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },

  // ----- The Nordics and the Baltics -----
  {
    key: "DK",
    country: "DK",
    label: "Denmark",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("Maundy Thursday", easter(-3)),
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      ASCENSION,
      WHIT_SUNDAY,
      WHIT_MONDAY,
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },
  {
    key: "SE",
    country: "SE",
    label: "Sweden",
    observe: "none",
    note: "Includes Midsummer Eve, Christmas Eve and New Year's Eve, which aren't public holidays but are days off almost everywhere.",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      r("May Day", fixed(5, 1)),
      ASCENSION,
      r("Whit Sunday", easter(49)),
      r("National Day", fixed(6, 6)),
      r("Midsummer Eve", onOrAfter(6, 19, FRI)),
      r("Midsummer Day", onOrAfter(6, 20, SAT)),
      r("All Saints' Day", onOrAfter(10, 31, SAT)),
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
      r("New Year's Eve", fixed(12, 31)),
    ],
  },
  {
    key: "NO",
    country: "NO",
    label: "Norway",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("Maundy Thursday", easter(-3)),
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("Constitution Day", fixed(5, 17)),
      ASCENSION,
      WHIT_SUNDAY,
      WHIT_MONDAY,
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "FI",
    country: "FI",
    label: "Finland",
    observe: "none",
    rules: [
      NEW_YEAR,
      EPIPHANY,
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      r("May Day", fixed(5, 1)),
      ASCENSION,
      r("Whit Sunday", easter(49)),
      r("Midsummer Eve", onOrAfter(6, 19, FRI)),
      r("Midsummer Day", onOrAfter(6, 20, SAT)),
      r("All Saints' Day", onOrAfter(10, 31, SAT)),
      r("Independence Day", fixed(12, 6)),
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("St. Stephen's Day", fixed(12, 26)),
    ],
  },
  {
    key: "EE",
    country: "EE",
    label: "Estonia",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("Independence Day", fixed(2, 24)),
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      r("Spring Day", fixed(5, 1)),
      r("Whit Sunday", easter(49)),
      r("Victory Day", fixed(6, 23)),
      r("Midsummer Day", fixed(6, 24)),
      r("Day of Restoration of Independence", fixed(8, 20)),
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },
  {
    key: "LV",
    country: "LV",
    label: "Latvia",
    observe: "none",
    rules: [
      NEW_YEAR,
      GOOD_FRIDAY,
      EASTER_SUNDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("Restoration of Independence Day", fixed(5, 4), "weekend"),
      r("Midsummer Eve", fixed(6, 23)),
      r("Midsummer Day", fixed(6, 24)),
      r("Proclamation Day", fixed(11, 18), "weekend"),
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
      r("New Year's Eve", fixed(12, 31)),
    ],
  },
  {
    key: "LT",
    country: "LT",
    label: "Lithuania",
    observe: "none",
    rules: [
      NEW_YEAR,
      r("Day of Restoration of the State", fixed(2, 16)),
      r("Day of Restoration of Independence", fixed(3, 11)),
      EASTER_SUNDAY,
      EASTER_MONDAY,
      LABOUR_DAY,
      r("St. John's Day", fixed(6, 24)),
      r("Statehood Day", fixed(7, 6)),
      ASSUMPTION,
      ALL_SAINTS,
      r("All Souls' Day", fixed(11, 2)),
      r("Christmas Eve", fixed(12, 24)),
      CHRISTMAS,
      r("Second Day of Christmas", fixed(12, 26)),
    ],
  },

  // ----- North America and Oceania -----
  {
    key: "US",
    country: "US",
    label: "United States",
    observe: "nearest",
    note: "Federal holidays. Many private employers don't close for Columbus Day or Veterans Day; remove them if you work.",
    rules: [
      NEW_YEAR,
      r("Martin Luther King Jr. Day", nth(1, MON, 3)),
      r("Presidents' Day", nth(2, MON, 3)),
      r("Memorial Day", nth(5, MON, -1)),
      r("Juneteenth", between(fixed(6, 19), 2021)),
      r("Independence Day", fixed(7, 4)),
      r("Labor Day", nth(9, MON, 1)),
      r("Columbus Day", nth(10, MON, 2)),
      r("Veterans Day", fixed(11, 11)),
      r("Thanksgiving Day", nth(11, THU, 4)),
      CHRISTMAS,
    ],
  },
  {
    key: "CA",
    country: "CA",
    label: "Canada",
    observe: "weekend",
    note: "Holidays kept in most provinces. Your province may add Family Day, Civic Holiday or others.",
    rules: [
      NEW_YEAR,
      r("Good Friday", easter(-2), "none"),
      r("Victoria Day", onOrBefore(5, 24, MON)),
      r("Canada Day", fixed(7, 1)),
      r("Labour Day", nth(9, MON, 1)),
      r("Thanksgiving", nth(10, MON, 2)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
    ],
  },
  {
    key: "AU",
    country: "AU",
    label: "Australia",
    observe: "weekend",
    note: "Holidays kept nationally. Each state adds its own, and some move the King's Birthday.",
    rules: [
      NEW_YEAR,
      r("Australia Day", fixed(1, 26)),
      r("Good Friday", easter(-2), "none"),
      r("Easter Monday", easter(1), "none"),
      r("Anzac Day", fixed(4, 25), "none"),
      r("King's Birthday", nth(6, MON, 2)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
    ],
  },
  {
    key: "NZ",
    country: "NZ",
    label: "New Zealand",
    observe: "weekend",
    note: "Each region also has its own anniversary day; add yours.",
    rules: [
      NEW_YEAR,
      r("Day after New Year's Day", fixed(1, 2)),
      r("Waitangi Day", fixed(2, 6)),
      r("Good Friday", easter(-2), "none"),
      r("Easter Monday", easter(1), "none"),
      r("Anzac Day", fixed(4, 25)),
      r("King's Birthday", nth(6, MON, 1)),
      r("Matariki", listed(MATARIKI), "none"),
      r("Labour Day", nth(10, MON, 4)),
      CHRISTMAS,
      r("Boxing Day", fixed(12, 26)),
    ],
  },
];

const BY_KEY = new Map(PRESETS.map((p) => [p.key, p]));

/** Every built-in preset, A to Z. */
export function holidayPresets(): { key: string; country: string; label: string; note?: string }[] {
  return PRESETS.map(({ key, country, label, note }) => ({ key, country, label, note })).sort((a, b) =>
    a.label.localeCompare(b.label, "en")
  );
}

export function holidayPreset(key: string): HolidayPreset | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Every choice for a calendar's country, for the pickers: the built-in
 * presets first, then every other country, which Nager.Date may cover.
 */
export function presetOptions(): { value: string; label: string; description: string }[] {
  const builtIn = holidayPresets().map((p) => ({
    value: p.key,
    label: p.label,
    description: p.note ?? "Built in: national holidays, worked out for any year.",
  }));
  const covered = new Set(PRESETS.map((p) => p.country));
  const others = countryList()
    .filter((c) => !covered.has(c.code))
    .map((c) => ({
      value: c.code as string,
      label: c.name,
      description: "From Nager.Date, an open list of public holidays. Not every country is in it.",
    }));
  return [...builtIn, ...others];
}

/** The preset a country starts with: its own, or for the UK, England and Wales. */
export function presetKeyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  if (BY_KEY.has(country)) return country;
  return PRESETS.find((p) => p.country === country)?.key ?? null;
}

/** A readable name for a preset key, which may also be a bare country code. */
export function presetLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? countryName(key);
}

/**
 * A preset's holidays for one year, sorted, with weekend holidays given their
 * day off in lieu where the country does that. Two holidays on the same day
 * (Catholic and Orthodox Easter Monday some years) become one, with both names.
 */
export function presetHolidays(key: string, year: number): PresetHoliday[] {
  const preset = BY_KEY.get(key);
  if (!preset) return [];

  const actual: { date: Date; name: string; observe: Observe; expected?: boolean }[] = [];
  for (const rule of preset.rules) {
    const found = rule.on(year);
    for (const date of Array.isArray(found) ? found : found ? [found] : []) {
      if (date.getUTCFullYear() !== year) continue;
      actual.push({ date, name: rule.name, observe: rule.observe ?? preset.observe, expected: rule.expected });
    }
  }
  actual.sort((a, b) => a.date.getTime() - b.date.getTime());

  const byDate = new Map<string, PresetHoliday>();
  const add = (date: string, name: string, expected?: boolean) => {
    const existing = byDate.get(date);
    if (existing) {
      if (!existing.name.split(" / ").includes(name)) existing.name = `${existing.name} / ${name}`;
      existing.expected ||= expected;
    } else {
      byDate.set(date, { date, name, ...(expected ? { expected } : {}) });
    }
  };
  for (const h of actual) add(iso(h.date), h.name, h.expected);

  // Days off in lieu, in date order, so that a Saturday Christmas and a Sunday
  // Boxing Day become Monday and Tuesday rather than both landing on Monday.
  const taken = new Set(byDate.keys());
  for (const h of actual) {
    const day = h.date.getUTCDay();
    let target: Date | null = null;
    if (h.observe === "weekend" && (day === SAT || day === SUN)) target = plusDays(h.date, day === SAT ? 2 : 1);
    else if (h.observe === "sunday" && day === SUN) target = plusDays(h.date, 1);
    else if (h.observe === "nearest" && day === SAT) target = plusDays(h.date, -1);
    else if (h.observe === "nearest" && day === SUN) target = plusDays(h.date, 1);
    if (!target) continue;
    while (target.getUTCDay() === SAT || target.getUTCDay() === SUN || taken.has(iso(target))) {
      target = plusDays(target, 1);
    }
    const date = iso(target);
    taken.add(date);
    // A Saturday 1 January observed on Friday 31 December belongs to the year before.
    if (target.getUTCFullYear() === year) add(date, `${h.name} (day off in lieu)`, h.expected);
  }

  // The same, coming from next year: a Saturday New Year's Day observed the Friday before.
  for (const rule of preset.rules) {
    if ((rule.observe ?? preset.observe) !== "nearest") continue;
    const next = rule.on(year + 1);
    if (next instanceof Date && next.getUTCDay() === SAT && next.getUTCMonth() === 0 && next.getUTCDate() === 1) {
      add(`${year}-12-31`, `${rule.name} (day off in lieu)`, rule.expected);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
