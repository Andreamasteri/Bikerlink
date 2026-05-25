/**
 * Polyline converter — BikerLink / Valhalla
 *
 * Valhalla encodes route shapes with Polyline6 (precision 1e-6).
 * The internal RouteResult uses decoded coordinates [lat, lng][].
 */

function decodePolyline(encoded: string, precision: number): [number, number][] {
  const coords: [number, number][] = [];
  let lat = 0, lng = 0, i = 0;
  const len = encoded.length;

  while (i < len) {
    let b: number, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat * precision, lng * precision]);
  }
  return coords;
}

/**
 * Decode a Polyline6-encoded string (Valhalla shape format).
 * Returns array of [lat, lng] pairs.
 */
export function decodePolyline6(encoded: string): [number, number][] {
  return decodePolyline(encoded, 1e-6);
}

/**
 * Decode a Polyline5-encoded string (GraphHopper / Leaflet format).
 * Returns array of [lat, lng] pairs.
 */
export function decodePolyline5(encoded: string): [number, number][] {
  return decodePolyline(encoded, 1e-5);
}

/**
 * Encode an array of [lat, lng] pairs to Polyline5 string.
 * Used when downstream code expects encoded strings.
 */
export function encodePolyline5(coords: [number, number][]): string {
  function encodeValue(value: number): string {
    let v = Math.round(value * 1e5);
    v = v < 0 ? ~(v << 1) : v << 1;
    let result = "";
    while (v >= 0x20) {
      result += String.fromCharCode(((0x20 | (v & 0x1f)) + 63));
      v >>= 5;
    }
    result += String.fromCharCode(v + 63);
    return result;
  }

  let prevLat = 0, prevLng = 0;
  let out = "";
  for (const [lat, lng] of coords) {
    out += encodeValue(lat - prevLat);
    out += encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
