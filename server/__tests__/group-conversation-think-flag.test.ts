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
 * Task #216 — Quebracho think-flag regression guard.
 *   Quebracho currently uses streamQuebrachoChat (HTTP direct) instead of the
 *   Vercel AI SDK streamText path. Two tests protect against a future migration:
 *   (a) assert streamQuebrachoChat IS called and streamText is NOT called;
 *   (b) if Quebracho is ever moved to the streamText path, assert think:true
 *       would be required (the guard test passes vacuously today and fails the
 *       moment the routing changes without the flag).
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

// quebracho-client removed (Task #591 — Quebracho unified into Horus)

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateGroupTurn } from "../ai/assistant/group-conversation";
// streamQuebrachoChat import removed (Task #591 — Quebracho unified into Horus)

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

const DEFAULT_PARTICIPANTS = ["bowie", "horus"] as const; // Task #591: quebracho removed

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
    // Task #591: quebracho removed from group conversation.
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

  // Note: Quebracho group-chat tests removed (Task #591 — Quebracho unified into Horus).
  // GROUP_PARTICIPANTS is now ["bowie", "horus"] only.

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
