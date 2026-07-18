/**
 * Unit tests for the retired-model guard in check-vram-agent-map-drift.ts.
 *
 * These tests exercise the core check logic with synthetic fixture strings so
 * the suite runs without a real filesystem, GPU, or ThinkCentre connection.
 *
 * Coverage:
 *  - parseAgentModelDefaults()  — regex extracts agent→model pairs correctly
 *  - parseDefaultAgentMapKeys() — regex extracts model keys correctly
 *  - runDriftCheck() retired-model path
 *      • granite4:tiny-h re-introduced in DEFAULT_AGENT_MAP → fails (exit 1 scenario)
 *      • granite4:tiny-h re-introduced in AGENT_MODEL_DEFAULTS → fails
 *      • both sources clean → passes (exit 0 scenario)
 *  - runDriftCheck() drift path
 *      • model in AGENT_MODEL_DEFAULTS missing from DEFAULT_AGENT_MAP → fails
 *      • all models present → passes
 *  - runDriftCheck() combined: retired violation + drift → both reported
 */

import { describe, it, expect } from "vitest";
import {
  parseAgentModelDefaults,
  parseDefaultAgentMapKeys,
  runDriftCheck,
  RETIRED_MODELS,
} from "../check-vram-agent-map-drift";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** Minimal agent-constants.ts snippet containing AGENT_MODEL_DEFAULTS. */
function makeAgentConstantsSrc(entries: Record<string, string>): string {
  const body = Object.entries(entries)
    .map(([k, v]) => `  ${k}: "${v}",`)
    .join("\n");
  return `export const AGENT_MODEL_DEFAULTS = {\n${body}\n} as const;\n`;
}

/** Minimal vram-routes.js snippet containing DEFAULT_AGENT_MAP. */
function makeVramRoutesSrc(keys: string[]): string {
  const body = keys.map((k) => `  "${k}": "SomeAgent",`).join("\n");
  return `const DEFAULT_AGENT_MAP = {\n${body}\n};\n`;
}

// ─── parseAgentModelDefaults ──────────────────────────────────────────────────

describe("parseAgentModelDefaults", () => {
  it("extracts agent→model pairs from a well-formed AGENT_MODEL_DEFAULTS block", () => {
    const src = makeAgentConstantsSrc({ horus: "qwen3:4b", bowie: "qwen3:1.7b" });
    const result = parseAgentModelDefaults(src);
    expect(result.get("horus")).toBe("qwen3:4b");
    expect(result.get("bowie")).toBe("qwen3:1.7b");
    expect(result.size).toBe(2);
  });

  it("throws when AGENT_MODEL_DEFAULTS block is absent", () => {
    expect(() => parseAgentModelDefaults("// no block here\n")).toThrow(
      /Cannot find AGENT_MODEL_DEFAULTS block/
    );
  });

  it("throws when the block is present but contains no string entries", () => {
    // A block with only numeric values won't be captured by the string-value regex.
    const src = `export const AGENT_MODEL_DEFAULTS = {\n  count: 42,\n} as const;\n`;
    expect(() => parseAgentModelDefaults(src)).toThrow(/parsed 0 entries/);
  });
});

// ─── parseDefaultAgentMapKeys ─────────────────────────────────────────────────

describe("parseDefaultAgentMapKeys", () => {
  it("extracts all quoted model keys from a well-formed DEFAULT_AGENT_MAP block", () => {
    const src = makeVramRoutesSrc(["qwen3:4b", "qwen3:1.7b", "all-minilm"]);
    const result = parseDefaultAgentMapKeys(src);
    expect(result.has("qwen3:4b")).toBe(true);
    expect(result.has("qwen3:1.7b")).toBe(true);
    expect(result.has("all-minilm")).toBe(true);
    expect(result.size).toBe(3);
  });

  it("throws when DEFAULT_AGENT_MAP block is absent", () => {
    expect(() => parseDefaultAgentMapKeys("// no map here\n")).toThrow(
      /Cannot find DEFAULT_AGENT_MAP block/
    );
  });
});

// ─── runDriftCheck — retired-model guard ─────────────────────────────────────

describe("runDriftCheck — retired-model guard", () => {
  /** Canonical clean agent defaults (no retired models). */
  const cleanAgentDefaults = new Map([
    ["horus", "qwen3:4b"],
    ["bowie", "qwen3:1.7b"],
  ]);

  /** Canonical clean DEFAULT_AGENT_MAP keys (includes every model above). */
  const cleanDefaultMapKeys = new Set(["qwen3:4b", "qwen3:1.7b"]);

  it("passes (failed=false) when both sources are clean", () => {
    const result = runDriftCheck(cleanAgentDefaults, cleanDefaultMapKeys);
    expect(result.failed).toBe(false);
    expect(result.retiredViolations).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it("fails when granite4:tiny-h is re-introduced into DEFAULT_AGENT_MAP", () => {
    // Simulate someone adding the retired Quebracho model back to vram-routes.js.
    const mapWithRetired = new Set([...cleanDefaultMapKeys, "granite4:tiny-h"]);

    const result = runDriftCheck(cleanAgentDefaults, mapWithRetired);

    expect(result.failed).toBe(true);
    expect(result.retiredViolations).toHaveLength(1);

    const [violation] = result.retiredViolations;
    expect(violation.model).toBe("granite4:tiny-h");
    expect(violation.location).toContain("DEFAULT_AGENT_MAP");
    expect(violation.reason).toContain("Quebracho");
  });

  it("fails when granite4:tiny-h is re-introduced into AGENT_MODEL_DEFAULTS", () => {
    // Simulate someone adding the retired model to agent-constants.ts.
    const agentDefaultsWithRetired = new Map([
      ...cleanAgentDefaults,
      ["quebracho", "granite4:tiny-h"],
    ]);

    const result = runDriftCheck(agentDefaultsWithRetired, cleanDefaultMapKeys);

    expect(result.failed).toBe(true);
    expect(result.retiredViolations).toHaveLength(1);

    const [violation] = result.retiredViolations;
    expect(violation.model).toBe("granite4:tiny-h");
    expect(violation.location).toContain("AGENT_MODEL_DEFAULTS");
    expect(violation.reason).toContain("Quebracho");
  });

  it("fails with two violations when granite4:tiny-h appears in both sources", () => {
    const mapWithRetired = new Set([...cleanDefaultMapKeys, "granite4:tiny-h"]);
    const agentDefaultsWithRetired = new Map([
      ...cleanAgentDefaults,
      ["quebracho", "granite4:tiny-h"],
    ]);

    const result = runDriftCheck(agentDefaultsWithRetired, mapWithRetired);

    expect(result.failed).toBe(true);
    expect(result.retiredViolations).toHaveLength(2);

    const locations = result.retiredViolations.map((v) => v.location);
    expect(locations.some((l) => l.includes("DEFAULT_AGENT_MAP"))).toBe(true);
    expect(locations.some((l) => l.includes("AGENT_MODEL_DEFAULTS"))).toBe(true);
  });

  it("the RETIRED_MODELS export includes granite4:tiny-h with a Quebracho reason", () => {
    // Regression guard: if the blocklist entry is accidentally removed, this
    // test surfaces it immediately without waiting for a live re-introduction.
    expect(Object.keys(RETIRED_MODELS)).toContain("granite4:tiny-h");
    expect(RETIRED_MODELS["granite4:tiny-h"]).toMatch(/Quebracho/);
  });
});

// ─── runDriftCheck — drift check (model missing from DEFAULT_AGENT_MAP) ───────

describe("runDriftCheck — missing model drift", () => {
  it("fails when a model in AGENT_MODEL_DEFAULTS is absent from DEFAULT_AGENT_MAP", () => {
    const agentDefaults = new Map([
      ["horus", "qwen3:4b"],
      ["ares", "devstral:latest"],
    ]);
    // devstral:latest is missing from the map keys.
    const defaultMapKeys = new Set(["qwen3:4b"]);

    const result = runDriftCheck(agentDefaults, defaultMapKeys);

    expect(result.failed).toBe(true);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].agent).toBe("ares");
    expect(result.missing[0].model).toBe("devstral:latest");
    expect(result.retiredViolations).toHaveLength(0);
  });

  it("passes when every model in AGENT_MODEL_DEFAULTS is present in DEFAULT_AGENT_MAP", () => {
    const agentDefaults = new Map([
      ["horus", "qwen3:4b"],
      ["bowie", "qwen3:1.7b"],
      ["nadir", "all-minilm"],
    ]);
    const defaultMapKeys = new Set(["qwen3:4b", "qwen3:1.7b", "all-minilm", "all-minilm:latest"]);

    const result = runDriftCheck(agentDefaults, defaultMapKeys);

    expect(result.failed).toBe(false);
    expect(result.missing).toHaveLength(0);
    expect(result.retiredViolations).toHaveLength(0);
  });
});

// ─── runDriftCheck — combined retired + drift ─────────────────────────────────

describe("runDriftCheck — combined retired violation and drift", () => {
  it("reports both violations when a retired model reappears and another model is missing", () => {
    // quebracho re-introduced in agent-constants + ares model missing from vram-routes.
    const agentDefaults = new Map([
      ["horus", "qwen3:4b"],
      ["ares", "devstral:latest"],
      ["quebracho", "granite4:tiny-h"],
    ]);
    // devstral:latest absent; granite4:tiny-h absent from map (but present in agentDefaults).
    const defaultMapKeys = new Set(["qwen3:4b"]);

    const result = runDriftCheck(agentDefaults, defaultMapKeys);

    expect(result.failed).toBe(true);
    expect(result.retiredViolations).toHaveLength(1);
    expect(result.retiredViolations[0].model).toBe("granite4:tiny-h");
    // Both devstral:latest and granite4:tiny-h are missing from defaultMapKeys.
    expect(result.missing.length).toBeGreaterThanOrEqual(1);
    expect(result.missing.some((m) => m.model === "devstral:latest")).toBe(true);
  });
});

// ─── End-to-end: real files on disk ──────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";

describe("real-file drift check — production sources", () => {
  it("current agent-constants.ts and vram-routes.js have no drift and no retired models", () => {
    const root = path.resolve(__dirname, "../..");
    const agentConstantsSrc = fs.readFileSync(
      path.join(root, "server", "lib", "agent-constants.ts"),
      "utf8"
    );
    const vramRoutesSrc = fs.readFileSync(
      path.join(root, "scripts", "thinkcentre", "ai-hub", "vram-routes.js"),
      "utf8"
    );

    const agentDefaults = parseAgentModelDefaults(agentConstantsSrc);
    const defaultMapKeys = parseDefaultAgentMapKeys(vramRoutesSrc);
    const result = runDriftCheck(agentDefaults, defaultMapKeys, RETIRED_MODELS);

    expect(
      result.retiredViolations,
      result.retiredViolations
        .map((v) => `RETIRED: "${v.model}" in ${v.location} — ${v.reason}`)
        .join("\n") || "no violations"
    ).toHaveLength(0);

    expect(
      result.missing,
      result.missing
        .map((m) => `MISSING from DEFAULT_AGENT_MAP: agent=${m.agent} model="${m.model}"`)
        .join("\n") || "no missing"
    ).toHaveLength(0);

    expect(result.failed).toBe(false);
  });
});
