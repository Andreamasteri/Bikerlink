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
