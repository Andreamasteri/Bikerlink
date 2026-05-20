/**
 * Returns the distance in metres between two GPS coordinates using the Haversine formula.
 */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Returns the distance in kilometres between two GPS coordinates using the Haversine formula.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns the index of the closest point on a polyline (array of [lat, lng] tuples)
 * to the given coordinate, using the Haversine distance.
 */
export function closestPointIndexOnPolyline(
  lat: number,
  lng: number,
  polyline: Array<[number, number]>
): number {
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < polyline.length; i++) {
    const d = haversineM(lat, lng, polyline[i][0], polyline[i][1]);
    if (d < minDist) { minDist = d; closestIdx = i; }
  }
  return closestIdx;
}
