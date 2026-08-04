import { describe, expect, it } from "vitest";
import { buildTelemetryIngestKey } from "../lib/telemetry-ingest-key";

const sample = {
  userId: "user-1", sessionId: "session-1", sessionType: "ride", lapName: null,
  ts: 1000, lat: 45.1, lon: 12.3, speedKmh: 42, leanAngle: 3,
  gforceX: 0.1, gforceY: 0.2, gforceZ: 1, heading: 90, altitudeM: 10,
};

describe("telemetry ingest idempotency", () => {
  it("returns the same key for the same logical sample", () => {
    expect(buildTelemetryIngestKey(sample)).toBe(buildTelemetryIngestKey({ ...sample }));
  });

  it("changes when the logical sample changes", () => {
    expect(buildTelemetryIngestKey(sample)).not.toBe(
      buildTelemetryIngestKey({ ...sample, ts: 1001 }),
    );
  });
});
