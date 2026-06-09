import Bottleneck from "bottleneck";

/**
 * Centralised rate limiters for outbound provider calls (Task #2517).
 *
 * All call sites that hit an external AI / mapping provider should route
 * through the matching limiter so per-provider quotas are honoured globally,
 * independent of how many call sites or queues are firing.
 *
 * Usage:
 *   import { limiters } from "@/server/lib/throttle";
 *   const result = await limiters.openai.schedule(() => callOpenAi(...));
 */

const isTest = process.env.NODE_ENV === "test";

function make(opts: Bottleneck.ConstructorOptions): Bottleneck {
  return new Bottleneck(
    isTest
      ? { maxConcurrent: 100, minTime: 0 }
      : opts,
  );
}

export const limiters = {
  // OpenAI: shared embeddings + chat. Conservative defaults — raise per-key.
  openai: make({
    maxConcurrent: 5,
    minTime: 50, // ~20 req/s ceiling
    reservoir: 500,
    reservoirRefreshAmount: 500,
    reservoirRefreshInterval: 60 * 1000,
  }),
  // Free tier Gemini 2.5 Flash: 15 RPM. Override con GEMINI_RPM_LIMIT se passi a pagamento.
  gemini: make({
    maxConcurrent: 3,
    minTime: 200,
    reservoir: Number(process.env.GEMINI_RPM_LIMIT ?? 15),
    reservoirRefreshAmount: Number(process.env.GEMINI_RPM_LIMIT ?? 15),
    reservoirRefreshInterval: 60 * 1000,
  }),
  // Free tier Groq Llama 3.3 70B: 30 RPM. Override con GROQ_RPM_LIMIT se passi al tier Developer.
  groq: make({
    maxConcurrent: 3,
    minTime: 200,
    reservoir: Number(process.env.GROQ_RPM_LIMIT ?? 30),
    reservoirRefreshAmount: Number(process.env.GROQ_RPM_LIMIT ?? 30),
    reservoirRefreshInterval: 60 * 1000,
  }),
  mapbox: make({
    maxConcurrent: 10,
    minTime: 50,
    reservoir: 600,
    reservoirRefreshAmount: 600,
    reservoirRefreshInterval: 60 * 1000,
  }),
  tomtom: make({
    maxConcurrent: 5,
    minTime: 200,
    reservoir: 5,
    reservoirRefreshAmount: 5,
    reservoirRefreshInterval: 1000,
  }),
} as const;

export type LimiterName = keyof typeof limiters;

export function getLimiter(name: LimiterName): Bottleneck {
  return limiters[name];
}

export function getLimiterStats(): Record<string, ReturnType<Bottleneck["counts"]>> {
  const out: Record<string, ReturnType<Bottleneck["counts"]>> = {};
  for (const [name, lim] of Object.entries(limiters)) {
    out[name] = lim.counts();
  }
  return out;
}
