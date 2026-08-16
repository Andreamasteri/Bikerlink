import { describe, expect, it } from "vitest";
import {
  automaticStartTick,
  createAutomaticStartState,
} from "../automatic-start-detector";

const sample = (nowMs: number, speedKmh = 6, latitude = 45, longitude = 9) => ({
  nowMs,
  speedKmh,
  accuracyM: 10,
  latitude,
  longitude,
});

describe("automatic start detector", () => {
  it("requires five seconds and real displacement", () => {
    let state = createAutomaticStartState();
    state = automaticStartTick(state, sample(0));
    state = automaticStartTick(state, sample(2500, 6, 45.00003));
    expect(state.triggered).toBe(false);
    state = automaticStartTick(state, sample(5000, 6, 45.00008));
    expect(state.triggered).toBe(true);
  });

  it("resets when speed or GPS quality drops", () => {
    let state = automaticStartTick(createAutomaticStartState(), sample(0));
    state = automaticStartTick(state, sample(2000, 3, 45.00005));
    expect(state.candidateSinceMs).toBeNull();
    state = automaticStartTick(state, sample(3000, 6, 45.00005));
    expect(state.candidateSinceMs).toBe(3000);
  });

  it("rejects a mostly stationary jitter trace", () => {
    let state = createAutomaticStartState();
    state = automaticStartTick(state, sample(0));
    state = automaticStartTick(state, sample(2500, 6, 45.000001));
    state = automaticStartTick(state, sample(5000, 6, 45.000002));
    expect(state.triggered).toBe(false);
  });
});
