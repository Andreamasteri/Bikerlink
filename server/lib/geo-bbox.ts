// Bounding-box pre-filter helpers. Cheap SQL pre-filter before Haversine.
// 1 degree latitude ≈ 111.32 km. Longitude depends on cos(latitude).
const KM_PER_DEGREE_LAT = 111.32;

export type BBox = { latMin: number; latMax: number; lonMin: number; lonMax: number };

export function bboxAround(lat: number, lon: number, radiusKm: number): BBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const lonDelta = radiusKm / (KM_PER_DEGREE_LAT * cosLat);
  return {
    latMin: lat - latDelta,
    latMax: lat + latDelta,
    lonMin: lon - lonDelta,
    lonMax: lon + lonDelta,
  };
}
