export interface RegionCoordinates {
  latitude: number;
  longitude: number;
}

import { getRegionCoordinates as getCoords } from "@/lib/countries-regions";

export function getRegionCoordinates(regionName: string, countryCode?: string | null): RegionCoordinates {
  return getCoords(countryCode, regionName);
}
