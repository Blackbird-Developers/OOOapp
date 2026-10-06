/**
 * Countries a company can be based in, and what each one's law says about
 * paid annual leave. Shared by the sign-up form and the server.
 */

/** ISO 3166-1 alpha-2, plus XK for Kosovo (not in the standard, used by the EU and Intl). */
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AL", "AM", "AO", "AR", "AT", "AU", "AZ", "BA", "BB", "BD", "BE",
  "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BR", "BS", "BT", "BW", "BY", "BZ", "CA", "CD",
  "CF", "CG", "CH", "CI", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CY", "CZ", "DE", "DJ",
  "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "ER", "ES", "ET", "FI", "FJ", "FM", "FR", "GA",
  "GB", "GD", "GE", "GH", "GM", "GN", "GQ", "GR", "GT", "GW", "GY", "HK", "HN", "HR", "HT",
  "HU", "ID", "IE", "IL", "IN", "IQ", "IR", "IS", "IT", "JM", "JO", "JP", "KE", "KG", "KH",
  "KI", "KM", "KN", "KP", "KR", "KW", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT",
  "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MR",
  "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NE", "NG", "NI", "NL", "NO", "NP", "NR",
  "NZ", "OM", "PA", "PE", "PG", "PH", "PK", "PL", "PS", "PT", "PW", "PY", "QA", "RO", "RS",
  "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR",
  "SS", "ST", "SV", "SY", "SZ", "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT",
  "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VN", "VU", "WS", "XK",
  "YE", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

const CODES = new Set<string>(COUNTRY_CODES);

export function isCountryCode(code: string): code is CountryCode {
  return CODES.has(code);
}

let names: Intl.DisplayNames | null = null;

export function countryName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every country, A to Z by name. */
export function countryList(): { code: CountryCode; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, "en")
  );
}

export type AnnualLeaveLaw = {
  /** Minimum paid annual leave in working days, for someone working a five-day week. */
  minDays: number;
  /** Anything that changes how to read the number. */
  note?: string;
};

/**
 * Statutory minimum paid annual leave, as working days on a five-day week.
 * Only countries with one national figure; where it depends on region,
 * sector or years of service (the US has none at all), there's no entry and
 * the sign-up says nothing. A hint, not legal advice: the form says to check.
 */
export const ANNUAL_LEAVE_LAW: Partial<Record<CountryCode, AnnualLeaveLaw>> = {
  XK: { minDays: 20 },
  AL: { minDays: 20 },
  MK: { minDays: 20 },
  RS: { minDays: 20 },
  ME: { minDays: 20 },
  BA: { minDays: 20 },
  HR: { minDays: 20 },
  SI: { minDays: 20 },
  BG: { minDays: 20 },
  RO: { minDays: 20 },
  GR: { minDays: 20 },
  CY: { minDays: 20 },
  IT: { minDays: 20 },
  DE: { minDays: 20 },
  NL: { minDays: 20 },
  BE: { minDays: 20 },
  CH: { minDays: 20 },
  IE: { minDays: 20 },
  PL: { minDays: 20, note: "26 days after 10 years of work." },
  CZ: { minDays: 20 },
  SK: { minDays: 20 },
  HU: { minDays: 20 },
  LT: { minDays: 20 },
  LV: { minDays: 20 },
  EE: { minDays: 20 },
  AU: { minDays: 20 },
  NZ: { minDays: 20 },
  GB: { minDays: 20, note: "28 days including the 8 bank holidays." },
  ES: { minDays: 22 },
  PT: { minDays: 22 },
  FR: { minDays: 25 },
  AT: { minDays: 25 },
  SE: { minDays: 25 },
  DK: { minDays: 25 },
  NO: { minDays: 25 },
  FI: { minDays: 25 },
  LU: { minDays: 26 },
};

export function annualLeaveLaw(code: string | null | undefined): AnnualLeaveLaw | null {
  return code && isCountryCode(code) ? ANNUAL_LEAVE_LAW[code] ?? null : null;
}
