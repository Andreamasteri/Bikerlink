/**
 * Push model→agent map to the ai-hub at boot (Task #179).
 *
 * The api-server knows the TC-hosted agent models from env vars at start-up.
 * Pushing this map lets ai-hub's GET /vram always show the correct per-agent
 * VRAM breakdown, even after a model upgrade, without manual VRAM_AGENT_MAP
 * edits on the TC.
 *
 * Non-fatal: any error (hub unreachable, misconfigured, TC powered-off) is
 * logged as a warn and never propagated — the server must reach READY regardless.
 */

import { isHubConfigured, hubPost } from "./ai-hub-client";

/**
 * Build the model→agent map from env vars and push it to the ai-hub.
 *
 * Exported for unit-testing; called fire-and-forget from runPostReady().
 */
export async function pushAgentModelMapToHub(): Promise<void> {
  try {
    if (!isHubConfigured()) return;

    // Gate: skip if ThinkCentre is explicitly powered-off — the hub is on the TC.
    const { isThinkCentrePoweredOff } = await import("./thinkcentre-powered-off");
    if (await isThinkCentrePoweredOff().catch(() => false)) return;

    // Build the map. Ares is on a separate machine (not TC) → excluded.
    const modelAgentMap: Record<string, string> = {
      [process.env.BOWIE_OLLAMA_MODEL ?? "qwen3:1.7b"]: "Bowie",
      [process.env.HORUS_OLLAMA_MODEL ?? "qwen3:4b"]: "Horus",
      [process.env.QUEBRACHO_OLLAMA_MODEL ?? "granite4:tiny-h"]: "Quebracho",
      // Nadir's embedding model on TC — no env override exists today.
      "all-minilm": "Nadir",
    };

    const result = await hubPost("/vram/agent-map", { modelAgentMap });
    if (result.ok) {
      console.log("[ai-hub] model\u2192agent map pushed");
    } else {
      console.warn(`[ai-hub] map push failed (non-fatal): ${result.error ?? "unknown"}`);
    }
  } catch (err) {
    console.warn(`[ai-hub] map push failed (non-fatal): ${(err as Error)?.message ?? String(err)}`);
  }
}
