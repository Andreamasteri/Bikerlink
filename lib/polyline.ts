/**
 * Decodifica una polyline codificata nel formato Google Encoded Polyline Algorithm.
 * Restituisce un array di oggetti { lat, lng }.
 */
export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Variante che restituisce tuple [lat, lng] invece di oggetti.
 * Utile dove si lavora con coordinate come coppie numeriche.
 */
export function decodePolylineTuples(encoded: string): Array<[number, number]> {
  return decodePolyline(encoded).map(({ lat, lng }) => [lat, lng]);
}
