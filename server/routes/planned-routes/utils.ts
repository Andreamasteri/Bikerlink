export { requireUserId as requireAuth } from "../../lib/auth-middleware";

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export function computeBikerScore(encodedPolyline: string): number {
  const pts = decodePolyline(encodedPolyline);
  if (pts.length < 3) return 0;
  let totalAngle = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const v1 = [pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]];
    const v2 = [pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
    const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
    if (mag1 > 0 && mag2 > 0) {
      const cosA = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
      totalAngle += Math.acos(cosA);
    }
  }
  return Math.round(Math.min(1, totalAngle / (pts.length * 0.3)) * 100) / 100;
}

export function computeBikerScoreFromPoints(pts: Array<{ lat: number; lng: number }>): number {
  if (pts.length < 3) return 0;
  let totalAngle = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const v1 = [pts[i].lat - pts[i-1].lat, pts[i].lng - pts[i-1].lng];
    const v2 = [pts[i+1].lat - pts[i+1-1].lat, pts[i+1].lng - pts[i+1-1].lng];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2);
    const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2);
    if (mag1 > 0 && mag2 > 0) {
      const cosA = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
      totalAngle += Math.acos(cosA);
    }
  }
  return Math.round(Math.min(1, totalAngle / (pts.length * 0.3)) * 100) / 100;
}

export function fallbackAiParse(prompt: string) {
  const lower = prompt.toLowerCase();
  return {
    title: "Giro in moto",
    startLocation: "", endLocation: "", waypoints: [] as string[],
    style: lower.includes("veloce") || lower.includes("autostrada") ? "fast"
      : lower.includes("curve") || lower.includes("curvy") || lower.includes("panoramic") ? "curvy" : "balanced",
    isRoundTrip: lower.includes("ritorno") || lower.includes("andata e ritorno"),
    isMultiDay: lower.includes("giorni") || lower.includes("settimana") || lower.includes("weekend"),
    daysEstimate: lower.includes("settimana") ? 7 : lower.includes("weekend") ? 2 : 1,
    maxHoursPerDay: 6,
    avoidHighways: lower.includes("senza autostrada") || lower.includes("evit"),
    notes: prompt,
  };
}

export function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}


export function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let lastLat = 0;
  let lastLng = 0;
  let encoded = "";
  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    encoded += String.fromCharCode(v + 63);
  };
  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    encodeValue(lat - lastLat);
    encodeValue(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return encoded;
}

export interface TechnicalCheckpoint {
  id: string;
  type: "turn_warning";
  latitude: number;
  longitude: number;
  distanceBeforeM: number;
  maxSpeedKmh: number;
  sign: number;
  instruction: string;
  audioKey: string;
}

type RouteInstructionForCheckpoint = {
  sign?: number;
  interval?: number[];
  text?: string;
  streetName?: string;
  street_name?: string;
  maxSpeedKmh?: number;
  max_speed?: number;
};

function haversineMeters(a: [number, number], b: [number, number]): number {
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function turnLabel(sign: number): string | null {
  if (sign === 4) return "u_turn";
  if (sign > 0) return "right";
  if (sign < 0) return "left";
  return null;
}

export function buildTechnicalCheckpoints(
  coordinates: number[][],
  instructions: RouteInstructionForCheckpoint[],
): TechnicalCheckpoint[] {
  if (coordinates.length < 2) return [];
  const checkpoints: TechnicalCheckpoint[] = [];
  let sequence = 0;
  for (const instruction of instructions) {
    const sign = Number(instruction.sign ?? 0);
    const direction = turnLabel(sign);
    if (!direction) continue;
    const intervalStart = Math.max(0, Math.min(coordinates.length - 1, Number(instruction.interval?.[0] ?? 0)));
    const rawSpeed = Number(instruction.maxSpeedKmh ?? instruction.max_speed ?? 50);
    const maxSpeedKmh = Number.isFinite(rawSpeed) && rawSpeed > 0 ? Math.min(rawSpeed, 130) : 50;
    // Tre secondi di preavviso, con un limite operativo per evitare punti troppo lontani.
    const distanceBeforeM = Math.round(Math.max(25, Math.min(150, (maxSpeedKmh / 3.6) * 3 + 10)));
    let distance = 0;
    let checkpointIndex = intervalStart;
    for (let i = intervalStart; i > 0 && distance < distanceBeforeM; i -= 1) {
      const a = coordinates[i] ?? coordinates[i - 1];
      const b = coordinates[i - 1] ?? coordinates[i];
      if (a && b && a.length >= 2 && b.length >= 2) {
        distance += haversineMeters([a[0], a[1]], [b[0], b[1]]);
      }
      checkpointIndex = i - 1;
    }
    const point = coordinates[checkpointIndex];
    if (!point || point.length < 2) continue;
    const text = instruction.text?.trim() || `Svoltare a ${direction === "u_turn" ? "U" : direction}`;
    checkpoints.push({
      id: `turn-warning-${sequence++}`,
      type: "turn_warning",
      latitude: point[1],
      longitude: point[0],
      distanceBeforeM,
      maxSpeedKmh,
      sign,
      instruction: text,
      audioKey: `navigation.turn.${direction}`,
    });
  }
  return checkpoints;
}
