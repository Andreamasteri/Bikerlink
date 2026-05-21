import { NORTH_AMERICA_COUNTRIES } from './americas-north';
  import { SOUTH_AMERICA_COUNTRIES } from './americas-south';
  import { CountryData } from './types';

  export const AMERICAS_COUNTRIES: CountryData[] = [
    ...NORTH_AMERICA_COUNTRIES,
    ...SOUTH_AMERICA_COUNTRIES,
  ];
  