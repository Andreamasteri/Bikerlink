import { AFRICA_COUNTRIES } from './africa';
import { ASIA_COUNTRIES } from './asia';
import EUROPE_COUNTRIES from './europe';
import { AMERICAS_COUNTRIES } from './americas';
import { OCEANIA_COUNTRIES } from './oceania';
import { CountryData, ContinentData, RegionData } from './types';

export * from './types';
export { AFRICA_COUNTRIES } from './africa';
export { ASIA_COUNTRIES } from './asia';
export { default as EUROPE_COUNTRIES } from './europe';
export { AMERICAS_COUNTRIES } from './americas';
export { OCEANIA_COUNTRIES } from './oceania';

export const ALL_COUNTRIES: CountryData[] = [
  ...EUROPE_COUNTRIES,
  ...AMERICAS_COUNTRIES,
  ...ASIA_COUNTRIES,
  ...AFRICA_COUNTRIES,
  ...OCEANIA_COUNTRIES,
];

export const EUROPEAN_COUNTRIES: CountryData[] = EUROPE_COUNTRIES;

export const CONTINENT_MAP: ContinentData[] = [
  {
    key: "EU",
    label: "Europa",
    countryCodes: ["AD","AL","AM","AT","AZ","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES","FI","FR","GB","GE","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV","MC","MD","ME","MK","MT","NL","NO","PL","PT","RO","RS","RU","SE","SI","SK","SM","TR","UA","VA","XK"],
  },
  {
    key: "NA",
    label: "Nord America",
    countryCodes: ["CA","US"],
  },
  {
    key: "SA",
    label: "Sud America",
    countryCodes: ["AR","BO","BR","CL","CO","EC","GY","PE","PY","SR","UY","VE"],
  },
  {
    key: "OC",
    label: "Oceania",
    countryCodes: ["AU","FJ","FM","KI","MH","NR","NZ","PG","PW","SB","TO","TV","VU","WS"],
  },
  {
    key: "AS",
    label: "Asia",
    countryCodes: ["CN","ID","IN","JP","KR","MY","PH","SG","TH","VN"],
  },
  {
    key: "AF",
    label: "Africa",
    countryCodes: ["AO","BF","BI","BJ","BW","CD","CF","CG","CI","CM","CV","DJ","DZ","EG","ER","ET","GA","GH","GM","GN","GQ","GW","KE","KM","LR","LS","LY","MA","MG","ML","MR","MU","MW","MZ","NA","NE","NG","RW","SC","SD","SL","SN","SO","SS","ST","SZ","TD","TG","TN","TZ","UG","ZA","ZM","ZW"],
  },
];

export function getCountryByCode(code: string): CountryData | undefined {
  return ALL_COUNTRIES.find((c) => c.code === code);
}

export function getRegionsForCountry(code: string): RegionData[] {
  return getCountryByCode(code)?.regions ?? [];
}

export function getCountryFlag(code: string): string {
  return getCountryByCode(code)?.flag ?? "";
}

export function getCountryName(code: string): string {
  return getCountryByCode(code)?.name ?? code;
}

export function getRegionCoordinates(countryCode: string | null | undefined, regionName: string | null | undefined): { latitude: number; longitude: number } {
  if (countryCode) {
    const country = getCountryByCode(countryCode);
    if (country) {
      if (regionName) {
        const region = country.regions.find((r) => r.name === regionName);
        if (region) return { latitude: region.latitude, longitude: region.longitude };
      }
      if (country.regions.length > 0) {
        return { latitude: country.regions[0].latitude, longitude: country.regions[0].longitude };
      }
    }
  }
  if (regionName) {
    for (const c of ALL_COUNTRIES) {
      const r = c.regions.find((reg) => reg.name === regionName);
      if (r) return { latitude: r.latitude, longitude: r.longitude };
    }
  }
  return { latitude: 41.9028, longitude: 12.4964 };
}

export function findCountryByRegion(regionName: string): string | null {
  for (const c of ALL_COUNTRIES) {
    if (c.regions.some((r) => r.name === regionName)) {
      return c.code;
    }
  }
  return null;
}

export function getContinentForCountry(code: string): ContinentData | undefined {
  return CONTINENT_MAP.find((c) => c.countryCodes.includes(code));
}

export function getCountriesForContinent(continentKey: string): CountryData[] {
  const continent = CONTINENT_MAP.find((c) => c.key === continentKey);
  if (!continent) return [];
  return continent.countryCodes
    .map((code) => getCountryByCode(code))
    .filter((c): c is CountryData => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
}
