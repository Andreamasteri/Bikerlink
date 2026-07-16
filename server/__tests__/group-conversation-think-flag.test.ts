/**
 * Task #128 — Guard: `think:true` must be passed to Ollama for both Horus and
 * Bowie in the group-chat path (`generateGroupTurn`).
 *
 * Context:
 *   - Task #100/#130 set `thinkSeparated = true` (hard-coded) and pass it via
 *     `providerOptions: { ollama: { think: thinkSeparated } }` inside
 *     `generateGroupTurn`. Without this flag, qwen3 models (used by both Horus
 *     and Bowie) dump their chain-of-thought into the `content` stream, leaking
 *     raw English reasoning to every admin watching the round table.
 *   - Task #130 extended the protection to Bowie as well (think:true for BOTH
 *     Ollama personas), so this test covers both.
 *
 * This is a pure-unit test: no ThinkCentre, no DB, no live Ollama required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist stable mock refs before any vi.mock() factory runs
// ---------------------------------------------------------------------------
const streamTextMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Module mocks (hoisted; order here doesn't matter — all are hoisted)
// ---------------------------------------------------------------------------

vi.mock("ai", () => ({
  streamText: streamTextMock,
}));

vi.mock("../lib/ollama-client", () => ({
  getOllamaModel: vi.fn(() => ({ __provider: "ollama" })),
  isOllamaConfigured: true,
  isOllamaReachable: vi.fn().mockResolvedValue(true),
}));

vi.mock("../lib/quebracho-client", () => ({
  streamQuebrachoChat: vi.fn().mockResolvedValue({ text: "Quebracho risponde." }),
  getQuebrachoModelId: vi.fn().mockReturnValue("quebracho-test-model"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateGroupTurn } from "../ai/assistant/group-conversation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal AsyncIterable<string> that yields the given chunks.
 * Used to simulate `streamText(…).textStream`.
 */
function makeTextStream(chunks: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next(): Promise<IteratorResult<string>> {
          if (i < chunks.length) return { value: chunks[i++], done: false };
          return { value: "", done: true };
        },
      };
    },
  };
}

const DEFAULT_PARTICIPANTS = ["bowie", "horus", "quebracho"] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateGroupTurn — Ollama providerOptions.ollama.think flag", () => {
  beforeEach(() => {
    streamTextMock.mockReset();
    // Default: a healthy one-chunk stream so the function can complete.
    streamTextMock.mockReturnValue({
      textStream: makeTextStream(["Risposta di test."]),
    });
  });

  // ── Horus ─────────────────────────────────────────────────────────────────

  it("passa think:true a Ollama per persona=horus (primo turno)", async () => {
    const deltas: string[] = [];
    await generateGroupTurn({
      topic: "Test topic per il guard think:true",
      persona: "horus",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: (d) => deltas.push(d),
    });

    expect(streamTextMock).toHaveBeenCalledOnce();
    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    expect(providerOptions?.ollama).toMatchObject({ think: true });
  });

  it("passa think:true a Ollama per persona=horus (turno di risposta)", async () => {
    const deltas: string[] = [];
    await generateGroupTurn({
      topic: "Test topic per il guard think:true",
      persona: "horus",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [{ persona: "bowie", content: "Bowie ha già parlato." }],
      onDelta: (d) => deltas.push(d),
    });

    expect(streamTextMock).toHaveBeenCalledOnce();
    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    expect(providerOptions?.ollama).toMatchObject({ think: true });
  });

  // ── Bowie ─────────────────────────────────────────────────────────────────
  // Task #130 extended think:true to Bowie as well so it doesn't leak
  // reasoning in English in the group-chat context.

  it("passa think:true a Ollama per persona=bowie (Task #130)", async () => {
    const deltas: string[] = [];
    await generateGroupTurn({
      topic: "Test topic per il guard think:true",
      persona: "bowie",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: (d) => deltas.push(d),
    });

    expect(streamTextMock).toHaveBeenCalledOnce();
    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    expect(providerOptions?.ollama).toMatchObject({ think: true });
  });

  // ── Quebracho (control) ───────────────────────────────────────────────────
  // Quebracho uses its own HTTP client (streamQuebrachoChat), NOT streamText.
  // Verify that the Ollama path is never called for it.

  it("NON chiama streamText per persona=quebracho (usa streamQuebrachoChat)", async () => {
    await generateGroupTurn({
      topic: "Test topic per il guard think:true",
      persona: "quebracho",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: () => {},
    });

    expect(streamTextMock).not.toHaveBeenCalled();
  });

  // ── Regression guard ──────────────────────────────────────────────────────
  // Explicitly assert that think is NOT absent or false. This is the exact
  // failure mode the task guards against: someone sets think:false or deletes
  // the providerOptions block entirely.

  it("think non è false né assente nella chiamata a Ollama per horus", async () => {
    await generateGroupTurn({
      topic: "Regression guard topic",
      persona: "horus",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: () => {},
    });

    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    const ollamaOpts = providerOptions?.ollama as Record<string, unknown> | undefined;

    // Must be explicitly true, NOT undefined/null/false.
    expect(ollamaOpts?.think).toBe(true);
  });

  it("think non è false né assente nella chiamata a Ollama per bowie", async () => {
    await generateGroupTurn({
      topic: "Regression guard topic",
      persona: "bowie",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: () => {},
    });

    const callArgs = streamTextMock.mock.calls[0][0] as Record<string, unknown>;
    const providerOptions = callArgs.providerOptions as Record<string, unknown> | undefined;
    const ollamaOpts = providerOptions?.ollama as Record<string, unknown> | undefined;

    expect(ollamaOpts?.think).toBe(true);
  });
});
