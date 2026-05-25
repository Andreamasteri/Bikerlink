/**
 * Valhalla → GraphHopper-internal response mapper — BikerLink
 *
 * Valhalla usa Polyline precision 6 (encode/decode con fattore 1e6).
 * GraphHopper usa Polyline precision 5 (fattore 1e5).
 *
 * Strategia scelta: decodificare Polyline6 di Valhalla, ricodificare in Polyline5
 * per compatibilità con il client frontend (LeafletRouteMap / MapLibreRouteMap)
 * che si aspetta il formato GraphHopper.
 *
 * Riferimento: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
 */

// ─── Polyline helpers ─────────────────────────────────────────────────────────

/**
 * Decodifica una stringa Polyline encodata con precision `precision` (default 6).
 * Restituisce array di [lat, lng].
 */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coords.push([lat / factor, lng / factor]);
  }

  return coords;
}

/**
 * Ricodifica un array di [lat, lng] in Polyline con precision `precision` (default 5).
 */
export function encodePolyline(coords: [number, number][], precision = 5): string {
  const factor = Math.pow(10, precision);
  let output = "";
  let prevLat = 0;
  let prevLng = 0;

  function encodeValue(value: number): string {
    let v = Math.round(value * factor);
    v = v < 0 ? ~(v << 1) : v << 1;
    let encoded = "";
    while (v >= 0x20) {
      encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    encoded += String.fromCharCode(v + 63);
    return encoded;
  }

  for (const [lat, lng] of coords) {
    output += encodeValue(lat - prevLat);
    output += encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }

  return output;
}

// ─── Valhalla types ───────────────────────────────────────────────────────────

export interface ValhallaManeuver {
  type: number;
  instruction: string;
  street_names?: string[];
  length: number;
  time: number;
  begin_shape_index: number;
  end_shape_index: number;
}

export interface ValhallaLeg {
  shape: string;
  summary: {
    length: number;
    time: number;
    min_lat: number;
    min_lon: number;
    max_lat: number;
    max_lon: number;
  };
  maneuvers: ValhallaManeuver[];
}

export interface ValhallaTrip {
  legs: ValhallaLeg[];
  summary: {
    length: number;
    time: number;
    min_lat: number;
    min_lon: number;
    max_lat: number;
    max_lon: number;
  };
  status: number;
  status_message: string;
  units: string;
}

export interface ValhallaRouteResponse {
  trip: ValhallaTrip;
}

// ─── GraphHopper-internal output types ────────────────────────────────────────

export interface MappedRouteResult {
  paths: Array<{
    distance: number;
    time: number;
    points: string;
    instructions: Array<{
      text: string;
      distance: number;
      time: number;
      sign: number;
      street_name?: string;
    }>;
    points_encoded: boolean;
  }>;
}

// ─── Maneuver type mapping ────────────────────────────────────────────────────
// Valhalla maneuver types → GraphHopper sign codes (usati dal frontend per icone)
// Ref: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/#maneuver-types
const MANEUVER_TYPE_TO_SIGN: Record<number, number> = {
  0: 0,   // none → continua dritto
  1: 0,   // start → partenza
  2: 0,   // start right → partenza
  3: 0,   // start left → partenza
  4: 4,   // destination → arrivo
  5: 4,   // destination right → arrivo
  6: 4,   // destination left → arrivo
  7: 0,   // becomes → continua
  8: 0,   // continue → continua
  9: 1,   // slight right → leggera destra
  10: 2,  // right → destra
  11: 3,  // sharp right → destra netta
  12: -3, // u-turn right → inversione
  13: -3, // u-turn left → inversione
  14: -3, // sharp left → sinistra netta
  15: -2, // left → sinistra
  16: -1, // slight left → leggera sinistra
  17: 0,  // ramp straight → rampa dritto
  18: 2,  // ramp right → rampa destra
  19: -2, // ramp left → rampa sinistra
  20: 2,  // exit right → uscita destra
  21: -2, // exit left → uscita sinistra
  22: 0,  // stay straight → mantieni
  23: 1,  // stay right → mantieni destra
  24: -1, // stay left → mantieni sinistra
  25: 5,  // merge → immissione
  26: 6,  // roundabout enter → rotonda entra
  27: 6,  // roundabout exit → rotonda esci
  28: 6,  // ferryenter → traghetto
  29: 0,  // ferryexit → uscita traghetto
};

/**
 * Mappa la risposta Valhalla /route nel formato GraphHopper-interno.
 *
 * Conversioni:
 * - `trip.legs[].shape` (Polyline6) → decodifica → ricodifica Polyline5
 * - `trip.summary.length` (km) → distance (metri)
 * - `trip.summary.time` (s) → time (millisecondi)
 * - `trip.legs[].maneuvers` → instructions GH-style
 */
export function mapValhallaResponse(response: ValhallaRouteResponse): MappedRouteResult {
  const trip = response.trip;

  if (!trip || !trip.legs || trip.legs.length === 0) {
    throw new Error("Risposta Valhalla vuota: nessun leg nel trip");
  }

  const allCoords: [number, number][] = [];
  const allInstructions: MappedRouteResult["paths"][0]["instructions"] = [];

  for (const leg of trip.legs) {
    const legCoords = decodePolyline(leg.shape, 6);
    allCoords.push(...legCoords);

    for (const maneuver of leg.maneuvers) {
      allInstructions.push({
        text: maneuver.instruction,
        distance: Math.round(maneuver.length * 1000),
        time: Math.round(maneuver.time * 1000),
        sign: MANEUVER_TYPE_TO_SIGN[maneuver.type] ?? 0,
        street_name: maneuver.street_names?.[0],
      });
    }
  }

  const encodedPolyline5 = encodePolyline(allCoords, 5);

  return {
    paths: [
      {
        distance: Math.round(trip.summary.length * 1000),
        time: Math.round(trip.summary.time * 1000),
        points: encodedPolyline5,
        points_encoded: true,
        instructions: allInstructions,
      },
    ],
  };
}
