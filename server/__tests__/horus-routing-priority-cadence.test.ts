// Task #35 — Il gate di priorità (Task #23) fa cedere il turno al ciclo
// diagnostico di Horus quando l'AI di routing è occupata, ma questo NON deve
// mai alterare la cadenza dello scheduler (skip un tick, non un ritardo
// dell'intero schedule) né bloccare il trigger manuale ("analizza ora").
//
// Questo test blocca in automatico un futuro refactor che trasformasse
// silenziosamente "cedi questo tick" in "rallenta tutto il ciclo".
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Ollama locale (Horus) — configurabile per test ───────────────────────────
const ollamaState = vi.hoisted(() => ({ configured: true, reachable: true }));
const ollamaChatMock = vi.hoisted(() => vi.fn(async () => "Stato sistema nominale, nessun rischio rilevato."));

vi.mock("../lib/ollama-client", () => ({
  get isOllamaConfigured() {
    return ollamaState.configured;
  },
  isOllamaReachable: vi.fn(async () => ollamaState.reachable),
  callOllamaChat: ollamaChatMock,
  getOllamaModelId: vi.fn(() => "horus:latest"),
}));

// ── Utenti online (load-gate) — basso carico di default ──────────────────────
const onlineUsersMock = vi.hoisted(() => vi.fn(() => 0));
vi.mock("../online-tracker", () => ({
  onlineTracker: { countOnlineUsers: onlineUsersMock },
}));

// ── Fonti dati (sola lettura) — di default nessun dato pregresso ─────────────
vi.mock("../ai/db-integrity/runner", () => ({
  getLatestRunSummary: vi.fn(async () => null),
  listOpenViolations: vi.fn(async () => []),
}));
vi.mock("../ai/watchdog/aggregator.part2", () => ({
  getLatestSnapshot: vi.fn(() => null),
}));

// ── Passthrough per dipendenze non rilevanti a questo invariante ─────────────
vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: (fn: () => unknown) => Promise.resolve(fn()),
}));
vi.mock("../ai/moderation/redact", () => ({
  redactPII: (s: string) => s,
}));
vi.mock("../ai/assistant/security-filter", () => ({
  matchesSensitive: () => false,
}));
vi.mock("../ai/coordinator/gated-job", () => ({
  withJobGate: (_name: string, fn: (...args: unknown[]) => unknown) => fn,
}));

// ── DB: solo quanto basta a persistere un run manuale completato ────────────
function thenableChain<T>(returningValue: T[]) {
  return {
    returning: vi.fn(async () => returningValue),
    then: (resolve: (v: unknown) => void) => resolve(undefined),
  };
}
vi.mock("../db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => thenableChain([{ id: "run-1" }])),
    })),
  },
}));

// fs: evita scritture reali del file mirror .md durante il test.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
    },
  };
});

import {
  runCycle,
  getHorusAnalysisStats,
  __resetHorusAnalyzerStateForTest,
} from "../ai/assistant/horus-analyzer";
import {
  withRoutingAiPriority,
  _resetRoutingAiPriorityForTests,
} from "../ai/ai-priority-gate";

/** Tiene il gate di priorità "occupato" finché non si chiama `release()`. */
function holdRoutingBusy() {
  let release!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  const done = withRoutingAiPriority(() => hold);
  return { release, done };
}

beforeEach(() => {
  __resetHorusAnalyzerStateForTest();
  _resetRoutingAiPriorityForTests();
  ollamaState.configured = true;
  ollamaState.reachable = true;
  ollamaChatMock.mockClear();
  onlineUsersMock.mockClear();
  onlineUsersMock.mockReturnValue(0);
});

describe("Horus cadence invariance sotto priorità di routing (Task #35)", () => {
  it("un ciclo schedulato ceduto per AI di routing occupata non tocca lastRunAt/cooldown", async () => {
    const { release, done } = holdRoutingBusy();
    try {
      const out = await runCycle("schedule");
      expect(out.ran).toBe(false);
      expect(out.reason).toMatch(/ceduto/);
    } finally {
      release();
      await done;
    }

    // Cadenza invariata: nessun run reale è mai partito, quindi lastRunAt resta
    // null e il contatore di skip riflette esattamente lo yield avvenuto.
    const stats = getHorusAnalysisStats();
    expect(stats.lastRunAt).toBeNull();
    expect(stats.totalSkippedRoutingBusy).toBe(1);
    expect(stats.running).toBe(false); // single-flight non rimane bloccato
  });

  it("dopo uno yield, il tick schedulato successivo NON è ritardato dal cooldown", async () => {
    // Rende irraggiungibile Ollama per isolare la causa del prossimo skip:
    // se fosse "cooldown attivo" vorrebbe dire che lo yield ha sporcato lastRunAt.
    ollamaState.reachable = false;

    const { release, done } = holdRoutingBusy();
    const busySkip = await runCycle("schedule");
    release();
    await done;
    expect(busySkip.reason).toMatch(/ceduto/);

    // Supera la finestra di grazia del gate (GRACE_MS) così il prossimo tick
    // non veda più "busy" per via della grazia, non del cooldown diagnostico.
    await new Promise((r) => setTimeout(r, 2100));

    // Nessuna finestra di attesa aggiuntiva introdotta dallo yield: il tick
    // successivo riprova e la ragione dello skip è la raggiungibilità di
    // Ollama, non un cooldown introdotto per errore dallo yield precedente.
    const nextTick = await runCycle("schedule");
    expect(nextTick.ran).toBe(false);
    expect(nextTick.reason).not.toMatch(/cooldown/);
    expect(nextTick.reason).toMatch(/raggiungibile/);
  }, 10_000);

  it("il trigger manuale ('analizza ora') non cede MAI, anche con AI di routing occupata", async () => {
    const { release, done } = holdRoutingBusy();
    try {
      const out = await runCycle("manual");
      expect(out.ran).toBe(true);
      expect(out.reason).toBeUndefined();
    } finally {
      release();
      await done;
    }

    expect(ollamaChatMock).toHaveBeenCalledTimes(1);
    // Il contatore di skip-per-routing-busy è dedicato al percorso schedulato:
    // il manuale non deve mai incrementarlo.
    expect(getHorusAnalysisStats().totalSkippedRoutingBusy).toBe(0);
  });

  it("con AI di routing libera, il ciclo schedulato procede regolarmente (nessun falso yield)", async () => {
    const out = await runCycle("schedule");
    expect(out.ran).toBe(true);
    expect(getHorusAnalysisStats().totalSkippedRoutingBusy).toBe(0);
  });
});
