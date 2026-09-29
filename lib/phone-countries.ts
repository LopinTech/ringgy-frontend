/**
 * Countries offered in the number search. Telnyx sells numbers in many
 * more; this is the set Ringgy's customers are in, and adding one is a line
 * here. `region` names the state / province filter, which Telnyx supports
 * for the US and Canada only — elsewhere the field is hidden rather than
 * offered and silently ignored.
 */
export interface PhoneCountry {
  code: string;
  name: string;
  region: { label: string; placeholder: string } | null;
  areaCodePlaceholder: string;
  cityPlaceholder: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'US', name: 'United States', region: { label: 'State', placeholder: 'TX' }, areaCodePlaceholder: '512', cityPlaceholder: 'Austin' },
  { code: 'CA', name: 'Canada', region: { label: 'Province', placeholder: 'ON' }, areaCodePlaceholder: '416', cityPlaceholder: 'Toronto' },
  { code: 'GB', name: 'United Kingdom', region: null, areaCodePlaceholder: '20', cityPlaceholder: 'London' },
  { code: 'IE', name: 'Ireland', region: null, areaCodePlaceholder: '1', cityPlaceholder: 'Dublin' },
  { code: 'AU', name: 'Australia', region: null, areaCodePlaceholder: '2', cityPlaceholder: 'Sydney' },
  { code: 'NZ', name: 'New Zealand', region: null, areaCodePlaceholder: '9', cityPlaceholder: 'Auckland' },
  { code: 'DE', name: 'Germany', region: null, areaCodePlaceholder: '30', cityPlaceholder: 'Berlin' },
  { code: 'FR', name: 'France', region: null, areaCodePlaceholder: '1', cityPlaceholder: 'Paris' },
  { code: 'ES', name: 'Spain', region: null, areaCodePlaceholder: '91', cityPlaceholder: 'Madrid' },
  { code: 'NL', name: 'Netherlands', region: null, areaCodePlaceholder: '20', cityPlaceholder: 'Amsterdam' },
  { code: 'MX', name: 'Mexico', region: null, areaCodePlaceholder: '55', cityPlaceholder: 'Mexico City' },
];

export function phoneCountry(code: string | undefined): PhoneCountry {
  return PHONE_COUNTRIES.find((country) => country.code === code) ?? PHONE_COUNTRIES[0];
}

/** The country and area code of a number typed on signup, when they can be told. */
export function guessFromNumber(e164: string | undefined): { country: string; areaCode?: string } {
  const nanp = /^\+1(\d{3})\d{7}$/.exec(e164 ?? '');
  return nanp ? { country: 'US', areaCode: nanp[1] } : { country: 'US' };
}
