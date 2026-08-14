import { describe, expect, it } from "vitest";
import { buildWatchdogEventKey } from "../ai/watchdog/event-key";

describe("watchdog event identity", () => {
  it("uses kind and scope and ignores diagnostic details", () => {
    const first = buildWatchdogEventKey("alert", "maps.network_instability");
    const second = buildWatchdogEventKey("alert", "maps.network_instability");
    expect(first).toBe(second);
  });

  it("allows an explicit stable key for distinct events in one scope", () => {
    expect(buildWatchdogEventKey("proposal", "manual_only", "proposal:route-1"))
      .not.toBe(buildWatchdogEventKey("proposal", "manual_only", "proposal:route-2"));
  });

  it("does not include summaries or payload details", () => {
    expect(buildWatchdogEventKey("alert", "status.red"))
      .toBe("alert:status.red");
  });

  it("hashes long identities instead of merging them by truncation", () => {
    const prefix = "x".repeat(180);
    const a = buildWatchdogEventKey("alert", null, prefix + ":incident-a");
    const b = buildWatchdogEventKey("alert", null, prefix + ":incident-b");
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(180);
    expect(b.length).toBeLessThanOrEqual(180);
  });
});
