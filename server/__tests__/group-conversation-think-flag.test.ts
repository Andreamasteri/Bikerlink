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

vi.mock("../lib/quebracho-client", () => ({
  streamQuebrachoChat: vi.fn().mockResolvedValue({ text: "Quebracho risponde." }),
  getQuebrachoModelId: vi.fn().mockReturnValue("quebracho-test-model"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { generateGroupTurn } from "../ai/assistant/group-conversation";
import { streamQuebrachoChat } from "../lib/quebracho-client";

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
    // Reset Quebracho mock so call counts are isolated per test.
    vi.mocked(streamQuebrachoChat).mockReset();
    vi.mocked(streamQuebrachoChat).mockResolvedValue({ text: "Quebracho risponde." });
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
  // Verify that the Ollama/SDK path is never called for it, and that the
  // dedicated HTTP client IS called exactly once.
  // Task #216: both assertions must hold — changing one side without the other
  // (e.g. routing to streamText but forgetting to remove streamQuebrachoChat, or
  // vice-versa) will surface here.

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

  it("chiama streamQuebrachoChat esattamente una volta per persona=quebracho", async () => {
    const deltas: string[] = [];
    await generateGroupTurn({
      topic: "Test topic Quebracho client",
      persona: "quebracho",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: (d) => deltas.push(d),
    });

    expect(vi.mocked(streamQuebrachoChat)).toHaveBeenCalledOnce();
    // streamText must still be untouched.
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("passa il messaggio utente corretto a streamQuebrachoChat per persona=quebracho", async () => {
    const topic = "Argomento di test Quebracho";
    await generateGroupTurn({
      topic,
      persona: "quebracho",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: () => {},
    });

    const callArg = vi.mocked(streamQuebrachoChat).mock.calls[0][0];
    // Must receive a system prompt and a user message containing the topic.
    expect(callArg.system).toBeTruthy();
    expect(callArg.messages).toHaveLength(1);
    expect(callArg.messages[0].role).toBe("user");
    expect(callArg.messages[0].content).toContain(topic);
  });

  // ── Quebracho migration regression guard (Task #216) ─────────────────────
  // If Quebracho is ever migrated to the Vercel AI SDK streamText path (like
  // Horus/Bowie), the think flag MUST be set to true — otherwise qwen3 or any
  // reasoning-capable model would leak chain-of-thought into the group chat.
  //
  // This test is INTENTIONALLY vacuously true today: it does NOT assert that
  // streamText is not called (the separate control test above handles that
  // invariant). Instead it asserts: for every streamText call that does exist,
  // providerOptions.ollama.think must be explicitly true.
  //
  // Migration scenario:
  //   - Developer moves Quebracho to streamText WITH think:true  → test passes ✓
  //   - Developer moves Quebracho to streamText WITHOUT think:true → test fails ✗
  //   - Current routing (streamQuebrachoChat) → vacuously passes, 0 loops run ✓

  it("[migration guard] ogni chiamata streamText per quebracho deve avere think:true", async () => {
    await generateGroupTurn({
      topic: "Migration guard topic",
      persona: "quebracho",
      participants: DEFAULT_PARTICIPANTS,
      priorTurns: [],
      onDelta: () => {},
    });

    // For each streamText invocation (zero today), think must be explicitly true.
    // This loop is vacuously satisfied when Quebracho uses streamQuebrachoChat.
    // It becomes a live assertion the moment the routing is changed.
    for (const [args] of streamTextMock.mock.calls as [Record<string, unknown>][]) {
      const providerOptions = args.providerOptions as Record<string, unknown> | undefined;
      const ollamaOpts = providerOptions?.ollama as Record<string, unknown> | undefined;
      expect(ollamaOpts?.think).toBe(true);
    }
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
