/**
 * Task #182 — End-to-end test: POST /vram/agent-map → GET /vram shows correct agent.
 *
 * Tests the real production code in vram-routes.js (which is mounted by server.js).
 * System calls (nvidia-smi, ollama ps, fs) are injected via the `sys` interface so
 * the suite runs without a real GPU or Ollama process.
 *
 * Key regression guarded: pushedAgentMap (from POST /vram/agent-map) must take
 * priority over DEFAULT_AGENT_MAP and env VRAM_AGENT_MAP in buildAgentMap().
 * If that priority is broken, a model upgrade would cause GET /vram to show
 * agent:null or the wrong agent name.
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import supertest from "supertest";

// Import the REAL production module — tests exercise the actual route/logic code.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { mountVramRoutes } = require("../vram-routes") as {
  mountVramRoutes: (
    app: ReturnType<typeof express>,
    opts: {
      sys: {
        readGpuStats: () => { usedMiB: number; totalMiB: number; gpuUtil: number | null };
        readComputeApps: () => { pid: string; usedMiB: number }[];
        readOllamaModels: () => string[];
        loadState: () => {
          samples: unknown[];
          alertActive: boolean;
          alertSince: string | null;
          pushedAgentMap: Record<string, string>;
        };
        saveState: (state: unknown) => void;
      };
      gateMiddleware: ReturnType<typeof express.Router>;
      startSampling: boolean;
    }
  ) => { getVramState: () => { pushedAgentMap: Record<string, string> } };
};

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** No-op gate middleware: bypasses token auth in tests. */
const openGate = (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
  next();

/** Builds a fresh Express app with real vram-routes.js mounted, injectable sys deps. */
function makeTestApp(sys: {
  readGpuStats: () => { usedMiB: number; totalMiB: number; gpuUtil: number | null };
  readComputeApps: () => { pid: string; usedMiB: number }[];
  readOllamaModels: () => string[];
}) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  const { getVramState } = mountVramRoutes(app, {
    sys: {
      ...sys,
      loadState: () => ({ samples: [], alertActive: false, alertSince: null, pushedAgentMap: {} }),
      saveState: () => { /* no-op in tests */ },
    },
    gateMiddleware: openGate as unknown as ReturnType<typeof express.Router>,
    startSampling: false,
  });

  return { client: supertest(app), getVramState };
}

// ─── Stubs ────────────────────────────────────────────────────────────────────

/** Single process running qwen3:8b (upgraded model, not in DEFAULT_AGENT_MAP). */
const singleUpgradedModel = {
  readGpuStats: () => ({ usedMiB: 6000, totalMiB: 24576, gpuUtil: 30 }),
  readComputeApps: () => [{ pid: "12345", usedMiB: 5800 }],
  readOllamaModels: () => ["qwen3:8b"],
};

/** Single process running qwen3:4b (a default known model). */
const singleDefaultModel = {
  readGpuStats: () => ({ usedMiB: 5000, totalMiB: 24576, gpuUtil: 20 }),
  readComputeApps: () => [{ pid: "11111", usedMiB: 4800 }],
  readOllamaModels: () => ["qwen3:4b"],
};

/** Two processes: qwen3:8b (Horus, 5800 MiB) + all-minilm:latest (Nadir, 200 MiB). */
const twoModels = {
  readGpuStats: () => ({ usedMiB: 6000, totalMiB: 24576, gpuUtil: 45 }),
  readComputeApps: () => [
    { pid: "12345", usedMiB: 5800 },
    { pid: "12346", usedMiB: 200 },
  ],
  readOllamaModels: () => ["qwen3:8b", "all-minilm:latest"],
};

/** No running GPU processes. */
const noProcesses = {
  readGpuStats: () => ({ usedMiB: 0, totalMiB: 24576, gpuUtil: 0 }),
  readComputeApps: () => [],
  readOllamaModels: () => [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("vram-routes.js — agent name after model upgrade (real production code)", () => {
  beforeEach(() => {
    delete process.env.VRAM_AGENT_MAP;
  });

  it("after POST /vram/agent-map sets qwen3:8b → Horus, GET /vram returns agent:Horus", async () => {
    const { client } = makeTestApp(singleUpgradedModel);

    // Simulate what the api-server sends at boot after a Horus model upgrade.
    const postRes = await client
      .post("/vram/agent-map")
      .send({ modelAgentMap: { "qwen3:8b": "Horus" } });
    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);

    const getRes = await client.get("/vram");
    expect(getRes.status).toBe(200);
    expect(getRes.body.ok).toBe(true);

    const entry = getRes.body.breakdown[0];
    expect(entry.model).toBe("qwen3:8b");
    expect(entry.agent).toBe("Horus");
    expect(getRes.body.breakdownConfidence).toBe("exact");
  });

  it("without a push, an upgraded model not in DEFAULT_AGENT_MAP shows agent:null", async () => {
    const { client } = makeTestApp(singleUpgradedModel);

    // qwen3:8b is NOT in DEFAULT_AGENT_MAP → agent must be null before any push.
    const res = await client.get("/vram");
    expect(res.status).toBe(200);
    expect(res.body.breakdown[0].model).toBe("qwen3:8b");
    expect(res.body.breakdown[0].agent).toBeNull();
  });

  it("pushedAgentMap overrides DEFAULT_AGENT_MAP for the same key", async () => {
    // qwen3:4b maps to "Horus" in DEFAULT_AGENT_MAP. Push overrides it to "Bowie"
    // (unusual but tests that pushed values really win).
    const { client } = makeTestApp(singleDefaultModel);

    await client
      .post("/vram/agent-map")
      .send({ modelAgentMap: { "qwen3:4b": "Bowie" } });

    const res = await client.get("/vram");
    expect(res.body.breakdown[0].model).toBe("qwen3:4b");
    expect(res.body.breakdown[0].agent).toBe("Bowie");
  });

  it("pushedAgentMap takes priority over env VRAM_AGENT_MAP", async () => {
    process.env.VRAM_AGENT_MAP = "qwen3:8b:WrongAgent";
    const { client } = makeTestApp(singleUpgradedModel);

    await client
      .post("/vram/agent-map")
      .send({ modelAgentMap: { "qwen3:8b": "Horus" } });

    const res = await client.get("/vram");
    expect(res.body.breakdown[0].agent).toBe("Horus");
  });

  it("multiple pushes are merged — latest write wins per key", async () => {
    const { client } = makeTestApp(singleUpgradedModel);

    await client.post("/vram/agent-map").send({ modelAgentMap: { "qwen3:8b": "Bowie" } });
    await client.post("/vram/agent-map").send({ modelAgentMap: { "qwen3:8b": "Horus" } });

    const res = await client.get("/vram");
    expect(res.body.breakdown[0].agent).toBe("Horus");
  });

  it("two agents: both get correct names from pushed map", async () => {
    const { client } = makeTestApp(twoModels);

    // Full BikerLink map (matches what api-server pushes at boot).
    await client.post("/vram/agent-map").send({
      modelAgentMap: {
        "qwen3:8b": "Horus",
        "all-minilm": "Nadir",
        "all-minilm:latest": "Nadir",
        "qwen3:1.7b": "Bowie",
        "granite4:tiny-h": "Quebracho",
      },
    });

    const res = await client.get("/vram");
    expect(res.body.breakdownConfidence).toBe("heuristic-paired");

    // Apps sorted by VRAM desc: 5800 MiB → qwen3:8b, 200 MiB → all-minilm:latest.
    const [first, second] = res.body.breakdown;
    expect(first.model).toBe("qwen3:8b");
    expect(first.agent).toBe("Horus");
    expect(second.model).toBe("all-minilm:latest");
    expect(second.agent).toBe("Nadir");
  });

  it("DEFAULT_AGENT_MAP resolves known models before any push is received", async () => {
    // qwen3:4b is in DEFAULT_AGENT_MAP → must show agent:Horus without any push.
    const { client } = makeTestApp(singleDefaultModel);

    const res = await client.get("/vram");
    expect(res.body.breakdown[0].model).toBe("qwen3:4b");
    expect(res.body.breakdown[0].agent).toBe("Horus");
  });

  it("no GPU processes → breakdown is empty and confidence is 'none'", async () => {
    const { client } = makeTestApp(noProcesses);

    await client.post("/vram/agent-map").send({ modelAgentMap: { "qwen3:8b": "Horus" } });

    const res = await client.get("/vram");
    expect(res.status).toBe(200);
    expect(res.body.breakdown).toHaveLength(0);
    expect(res.body.breakdownConfidence).toBe("none");
  });

  it("POST /vram/agent-map persists into vramState (readable via getVramState)", async () => {
    const { client, getVramState } = makeTestApp(singleUpgradedModel);

    await client.post("/vram/agent-map").send({ modelAgentMap: { "qwen3:8b": "Horus" } });

    const state = getVramState();
    expect(state.pushedAgentMap["qwen3:8b"]).toBe("Horus");
  });

  it("POST /vram/agent-map rejects a non-object modelAgentMap", async () => {
    const { client } = makeTestApp(noProcesses);

    const res = await client.post("/vram/agent-map").send({ modelAgentMap: ["bad"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/modelAgentMap/);
  });

  it("POST /vram/agent-map rejects non-string values in the map", async () => {
    const { client } = makeTestApp(noProcesses);

    const res = await client.post("/vram/agent-map").send({ modelAgentMap: { "qwen3:8b": 42 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/string/);
  });
});
