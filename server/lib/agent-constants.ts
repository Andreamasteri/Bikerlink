/**
 * CANONICAL AGENT LINEUP — BikerLink AI agents (Task #535).
 *
 * Single source of truth for per-agent model defaults, hardware placement and
 * keep_alive policy. Update this table whenever an agent's model or residency
 * changes — all client files reference these constants so a single edit
 * propagates everywhere.
 *
 * | Agent      | Model             | HW              | keep_alive |
 * |------------|-------------------|-----------------|------------|
 * | Horus      | qwen3:4b          | GPU residente   | -1         |
 * | Bowie      | qwen3:1.7b        | GPU residente   | -1         |
 * | Quebracho  | granite4:tiny-h   | CPU+RAM reside. | -1         |
 * | Nadir      | all-minilm        | GPU residente   | -1         |
 * | Ares       | devstral          | On-demand       |  0         |
 * | Coder      | devstral          | On-demand       |  0         |
 *
 * keep_alive semantics (Ollama):
 *   -1  → never unload (resident agents: Horus, Bowie, Quebracho, Nadir)
 *    0  → unload immediately after the call (on-demand agents: Ares, Coder)
 *  "Xm" → unload after X minutes (legacy default, no longer used)
 *
 * IMPORTANT: Ollama interprets the value -1 as "never unload" ONLY when it is
 * the NUMBER -1. The STRING "-1" is treated as 0 seconds (unload immediately).
 * Always send the numeric literal or use normalizeKeepAlive() from ollama-client.
 */

/**
 * keep_alive for resident agents (Horus, Bowie, Quebracho, Nadir).
 * Numeric -1 = never unload from VRAM/RAM.
 */
export const KEEP_ALIVE_RESIDENT: -1 = -1;

/**
 * keep_alive for on-demand agents (Ares, Coder).
 * Numeric 0 = unload immediately after the call to free the slot for others.
 */
export const KEEP_ALIVE_ON_DEMAND: 0 = 0;

/** Default model names (env vars take precedence — see each client file). */
export const AGENT_MODEL_DEFAULTS = {
  bowie: "qwen3:1.7b",
  horus: "qwen3:4b",
  quebracho: "granite4:tiny-h",
  nadir: "all-minilm",
  ares: "devstral:latest",
} as const;
