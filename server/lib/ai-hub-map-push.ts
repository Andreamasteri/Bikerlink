/**
 * Push model→agent map to the ai-hub at boot and on a periodic schedule.
 *
 * The api-server knows the TC-hosted agent models from env vars at start-up.
 * Pushing this map lets ai-hub's GET /vram always show the correct per-agent
 * VRAM breakdown, even after a model upgrade, without manual VRAM_AGENT_MAP
 * edits on the TC.
 *
 * Periodic re-push (default 6 h, env AI_HUB_MAP_PUSH_INTERVAL_MS) ensures
 * the map self-heals when the vram-state.json on TC is wiped (e.g. after a
 * fresh ai-hub deploy or manual cleanup) without requiring an api-server restart.
 *
 * Non-fatal: any error (hub unreachable, misconfigured, TC powered-off) is
 * logged as a warn and never propagated — the server must reach READY regardless.
 */

import { isHubConfigured, hubPost } from "./ai-hub-client";
import { AGENT_MODEL_DEFAULTS } from "./agent-constants";

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

    // Task #535 — Build the canonical model→agent map from env vars and push it.
    // Canonical lineup: Horus=qwen3:4b, Bowie=qwen3:1.7b,
    // Nadir=all-minilm, Ares=devstral:latest (on-demand — included for correct
    // attribution in the monitoring breakdown, even if Ares is on a separate machine).
    const modelAgentMap: Record<string, string> = {
      [process.env.BOWIE_OLLAMA_MODEL ?? AGENT_MODEL_DEFAULTS.bowie]: "Bowie",
      [process.env.HORUS_OLLAMA_MODEL ?? AGENT_MODEL_DEFAULTS.horus]: "Horus",
      // Quebracho removed (Task #591 — unified into Horus).
      // Nadir's embedding model on TC — no env override exists today.
      [AGENT_MODEL_DEFAULTS.nadir]: "Nadir",
      // Ares — on-demand (devstral), separate machine. Included so GET /vram
      // correctly attributes the model when Ares borrows the TC GPU slot.
      [process.env.ARES_OLLAMA_MODEL ?? AGENT_MODEL_DEFAULTS.ares]: "Ares",
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

/**
 * Start a periodic re-push of the model→agent map so that the ai-hub
 * self-heals when its vram-state.json is wiped (e.g. after a fresh deploy
 * or manual cleanup on the TC), without requiring an api-server restart.
 *
 * Interval defaults to 6 h; override with AI_HUB_MAP_PUSH_INTERVAL_MS.
 * Non-fatal: errors are only logged.
 */
export function scheduleAgentMapRepush(): void {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const intervalMs = Number(process.env.AI_HUB_MAP_PUSH_INTERVAL_MS) || SIX_HOURS_MS;
  setInterval(() => {
    void pushAgentModelMapToHub();
  }, intervalMs);
  console.log(`[ai-hub] periodic map re-push scheduled every ${intervalMs / 3_600_000}h`);
}
