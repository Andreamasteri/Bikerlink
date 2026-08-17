/**
 * LEGACY DIRECT-PATH MODEL DEFAULTS — BikerLink.
 *
 * This file preserves existing Ollama defaults for compatibility while the
 * inactive AI-Hub role registry in server/ai/agent-role-registry.ts defines
 * functional authority for new wiring.
 *
 * Functional roles:
 * - Bowie: chat and invocation only.
 * - Horus: routing, coordination and deep review.
 * - Ares: matching, diagnostics/review and orchestration.
 * - Nadir: audio only.
 * - Quebracho: historical alias, unified into Horus (Task #591).
 * - Indexing/embeddings: separate technical service, not an AI persona.
 *
 * Model/GPU placement is not inferred from this legacy table. AI-Hub runtime
 * discovery is authoritative and the runtime gate must pass before activation.
 *
 * keep_alive semantics (Ollama):
 *   -1  -> never unload (resident direct-path agents)
 *    0  -> unload immediately after the call (on-demand direct-path agents)
 *
 * IMPORTANT: Ollama interprets the value -1 as "never unload" ONLY when it is
 * the NUMBER -1. The STRING "-1" is treated as 0 seconds (unload immediately).
 * Always send the numeric literal or use normalizeKeepAlive() from ollama-client.
 */

/**
 * keep_alive for resident agents (Horus, Bowie, Nadir).
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
  nadir: "all-minilm",
  ares: "devstral:latest",
} as const;
