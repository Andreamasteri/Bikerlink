import { createHash } from "node:crypto";

export interface TelemetrySampleKeyInput {
  userId: string;
  sessionId: string;
  sessionType: string;
  lapName: string | null;
  ts: number;
  lat: number | null;
  lon: number | null;
  speedKmh: number | null;
  leanAngle: number | null;
  gforceX: number | null;
  gforceY: number | null;
  gforceZ: number | null;
  heading: number | null;
  altitudeM: number | null;
}

/**
 * Same logical sample => same key, even when the mobile client retries the
 * request after a timeout. The key deliberately excludes transport metadata.
 */
export function buildTelemetryIngestKey(input: TelemetrySampleKeyInput): string {
  const canonical = JSON.stringify([
    input.userId, input.sessionId, input.sessionType, input.lapName, input.ts,
    input.lat, input.lon, input.speedKmh, input.leanAngle,
    input.gforceX, input.gforceY, input.gforceZ, input.heading, input.altitudeM,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
