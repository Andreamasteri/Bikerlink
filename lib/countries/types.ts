export interface CityData {
  name: string;
  latitude: number;
  longitude: number;
}

export interface RegionData {
  name: string;
  latitude: number;
  longitude: number;
  cities?: CityData[];
}

export interface CountryData {
  code: string;
  name: string;
  flag: string;
  regions: RegionData[];
}

export interface ContinentData {
  key: string;
  label: string;
  countryCodes: string[];
}
