export interface RegionCoordinates {
  latitude: number;
  longitude: number;
}

import { getRegionCoordinates as getCoords } from "@/lib/countries-regions";

export const REGION_COORDINATES: Record<string, RegionCoordinates> = {
  "Abruzzo": { latitude: 42.192, longitude: 13.7289 },
  "Basilicata": { latitude: 40.643, longitude: 15.97 },
  "Calabria": { latitude: 38.906, longitude: 16.594 },
  "Campania": { latitude: 40.8518, longitude: 14.2681 },
  "Emilia-Romagna": { latitude: 44.4949, longitude: 11.3426 },
  "Friuli Venezia Giulia": { latitude: 46.0711, longitude: 13.2346 },
  "Lazio": { latitude: 41.9028, longitude: 12.4964 },
  "Liguria": { latitude: 44.4056, longitude: 8.9463 },
  "Lombardia": { latitude: 45.4642, longitude: 9.19 },
  "Marche": { latitude: 43.6158, longitude: 13.5189 },
  "Molise": { latitude: 41.5609, longitude: 14.6685 },
  "Piemonte": { latitude: 45.0703, longitude: 7.6869 },
  "Puglia": { latitude: 41.1257, longitude: 16.862 },
  "Sardegna": { latitude: 39.2238, longitude: 9.1217 },
  "Sicilia": { latitude: 37.5999, longitude: 14.0154 },
  "Toscana": { latitude: 43.7711, longitude: 11.2486 },
  "Trentino-Alto Adige": { latitude: 46.0664, longitude: 11.1257 },
  "Umbria": { latitude: 42.9964, longitude: 12.6371 },
  "Valle d'Aosta": { latitude: 45.7375, longitude: 7.3154 },
  "Veneto": { latitude: 45.4398, longitude: 12.3319 },
};

export function getRegionCoordinates(regionName: string, countryCode?: string | null): RegionCoordinates {
  return getCoords(countryCode, regionName);
}
