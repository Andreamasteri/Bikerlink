import { describe, it, expect, vi, beforeEach } from "vitest";

// Task #5318 — copertura diretta del Matching Coordinator: stati derivati,
// gate canRunCycleNow, direttive Horus (pause/resume/force_cycle) e fallback
// automatico quando Horus/ThinkCentre è irraggiungibile.

const getAppSettingMock = vi.hoisted(() => vi.fn(async () => undefined));
const upsertAppSettingMock = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("../storage", () => ({
  storage: { getAppSetting: getAppSettingMock, upsertAppSetting: upsertAppSettingMock },
}));

const isPoolHealthyMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("../db", () => ({ isPoolHealthy: isPoolHealthyMock }));

const isThinkCentreOfflineMock = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../lib/thinkcentre-offline", () => ({ isThinkCentreOffline: isThinkCentreOfflineMock }));

const isOllamaReachableMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../lib/ollama-client", () => ({ isOllamaReachable: isOllamaReachableMock }));

const writeWatchdogLogMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../ai/watchdog/log", () => ({ writeWatchdogLog: writeWatchdogLogMock }));

vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

const isQuebrachoUnreachableMock = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../ai/coordinator/job-gate", () => ({ isQuebrachoUnreachable: isQuebrachoUnreachableMock }));

import {
  getCoordinatorState,
  canRunCycleNow,
  applyCoordinatorDirective,
  getCoordinatorSnapshot,
  isValidCoordinatorDirectiveKind,
  __resetCoordinatorForTests,
} from "../matching/coordinator";

beforeEach(() => {
  __resetCoordinatorForTests();
  getAppSettingMock.mockReset().mockResolvedValue(undefined);
  upsertAppSettingMock.mockReset().mockResolvedValue({});
  isPoolHealthyMock.mockReset().mockReturnValue(true);
  isThinkCentreOfflineMock.mockReset().mockResolvedValue(false);
  isOllamaReachableMock.mockReset().mockResolvedValue(true);
  writeWatchdogLogMock.mockReset().mockResolvedValue(undefined);
  isQuebrachoUnreachableMock.mockReset().mockResolvedValue(false);
});

describe("isValidCoordinatorDirectiveKind", () => {
  it("accetta solo pause/resume/force_cycle", () => {
    expect(isValidCoordinatorDirectiveKind("pause")).toBe(true);
    expect(isValidCoordinatorDirectiveKind("resume")).toBe(true);
    expect(isValidCoordinatorDirectiveKind("force_cycle")).toBe(true);
    expect(isValidCoordinatorDirectiveKind("nuke")).toBe(false);
  });
});

describe("getCoordinatorState — nessuna regressione sul comportamento deterministico pre-esistente", () => {
  it("running quando tutto è sano e nessuna direttiva è attiva", async () => {
    const { state, reason } = await getCoordinatorState();
    expect(state).toBe("running");
    expect(reason).toBeTruthy();
  });

  it("stopped quando auto_matching_enabled=false (admin)", async () => {
    getAppSettingMock.mockImplementation(async (key: string) =>
      key === "auto_matching_enabled" ? { value: "false" } : undefined,
    );
    const { state } = await getCoordinatorState();
    expect(state).toBe("stopped");
  });

  it("paused_by_killswitch quando il pool DB è saturo", async () => {
    isPoolHealthyMock.mockReturnValue(false);
    const { state } = await getCoordinatorState();
    expect(state).toBe("paused_by_killswitch");
  });

  it("paused_by_killswitch (senza eccezione) quando getAppSetting lancia un errore di timeout", async () => {
    getAppSettingMock.mockRejectedValue(new Error("connection timeout"));
    const result = await getCoordinatorState();
    expect(result.state).toBe("paused_by_killswitch");
    expect(result.reason).toMatch(/DB unreachable/);
  });
});

describe("canRunCycleNow", () => {
  it("allowed=true, source=deterministic quando running", async () => {
    const decision = await canRunCycleNow();
    expect(decision).toMatchObject({ allowed: true, state: "running", source: "deterministic" });
  });

  it("allowed=false quando stopped", async () => {
    getAppSettingMock.mockImplementation(async (key: string) =>
      key === "auto_matching_enabled" ? { value: "false" } : undefined,
    );
    const decision = await canRunCycleNow();
    expect(decision.allowed).toBe(false);
    expect(decision.state).toBe("stopped");
  });
});

describe("applyCoordinatorDirective", () => {
  it("pause blocca i cicli successivi (source=horus) finché non arriva un resume", async () => {
    const applied = await applyCoordinatorDirective("pause", { reason: "test pausa" }, "horus");
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.state).toBe("paused_by_ai");

    const decision = await canRunCycleNow();
    expect(decision).toMatchObject({ allowed: false, state: "paused_by_ai", source: "horus" });
    expect(writeWatchdogLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "coordinator", scope: "matching_coordinator" }),
    );

    const resumed = await applyCoordinatorDirective("resume", { reason: "test ripresa" }, "horus");
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.state).toBe("running");
    expect((await canRunCycleNow()).allowed).toBe(true);
  });

  it("force_cycle è one-shot: bypassa UNA sola pausa attiva poi torna a bloccare", async () => {
    await applyCoordinatorDirective("pause", { reason: "pausa" }, "horus");
    await applyCoordinatorDirective("force_cycle", { reason: "forza subito" }, "horus");

    const first = await canRunCycleNow();
    expect(first).toMatchObject({ allowed: true, forcedByHorus: true, source: "horus" });

    const second = await canRunCycleNow();
    expect(second).toMatchObject({ allowed: false, state: "paused_by_ai" });
  });

  it("force_cycle NON bypassa il kill-switch DB (safety > policy Horus)", async () => {
    isPoolHealthyMock.mockReturnValue(false);
    await applyCoordinatorDirective("force_cycle", { reason: "forza" }, "horus");
    const decision = await canRunCycleNow();
    expect(decision).toMatchObject({ allowed: false, state: "paused_by_killswitch" });
  });

  it("force_cycle emesso mentre già running viene consumato subito e NON resta pending per una pausa futura", async () => {
    const noop = await canRunCycleNow();
    expect(noop).toMatchObject({ allowed: true, state: "running", source: "deterministic" });

    await applyCoordinatorDirective("force_cycle", { reason: "forza mentre running" }, "horus");
    const whileRunning = await canRunCycleNow();
    expect(whileRunning).toMatchObject({ allowed: true, state: "running", forcedByHorus: false });

    await applyCoordinatorDirective("pause", { reason: "pausa dopo il force stale" }, "horus");
    const afterPause = await canRunCycleNow();
    expect(afterPause).toMatchObject({ allowed: false, state: "paused_by_ai", forcedByHorus: false });
  });

  it("force_cycle emesso mentre stopped non ha effetto e non resta pending dopo il resume", async () => {
    getAppSettingMock.mockImplementation(async (key: string) =>
      key === "auto_matching_enabled" ? { value: "false" } : undefined,
    );
    await applyCoordinatorDirective("force_cycle", { reason: "forza mentre stopped" }, "horus");
    const whileStopped = await canRunCycleNow();
    expect(whileStopped).toMatchObject({ allowed: false, state: "stopped", forcedByHorus: false });

    getAppSettingMock.mockImplementation(async () => undefined);
    await applyCoordinatorDirective("pause", { reason: "pausa dopo riattivazione admin" }, "horus");
    const afterResume = await canRunCycleNow();
    expect(afterResume).toMatchObject({ allowed: false, state: "paused_by_ai", forcedByHorus: false });
  });

  it("rifiuta un kind sconosciuto e parametri invalidi", async () => {
    const badKind = await applyCoordinatorDirective("nuke", { reason: "x" }, "horus");
    expect(badKind.ok).toBe(false);

    const badParams = await applyCoordinatorDirective("pause", { reason: "" }, "horus");
    expect(badParams.ok).toBe(false);
  });
});

describe("fallback automatico — Horus/ThinkCentre irraggiungibile", () => {
  it("una pausa attiva viene ignorata (fallback deterministico) se Ollama horus non è raggiungibile", async () => {
    await applyCoordinatorDirective("pause", { reason: "pausa" }, "horus");
    isOllamaReachableMock.mockResolvedValue(false);

    const { state } = await getCoordinatorState();
    expect(state).toBe("running");
    expect(writeWatchdogLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "warn", details: expect.objectContaining({ event: "fallback_transition" }) }),
    );
  });

  it("una pausa attiva viene ignorata se il ThinkCentre è offline", async () => {
    await applyCoordinatorDirective("pause", { reason: "pausa" }, "horus");
    isThinkCentreOfflineMock.mockResolvedValue(true);

    const { state } = await getCoordinatorState();
    expect(state).toBe("running");
  });

  it("una pausa manuale dell'admin NON viene ignorata anche se Horus/ThinkCentre sono irraggiungibili", async () => {
    await applyCoordinatorDirective("pause", { reason: "stop di emergenza" }, "admin_manual");
    isOllamaReachableMock.mockResolvedValue(false);
    isThinkCentreOfflineMock.mockResolvedValue(true);

    const { state } = await getCoordinatorState();
    expect(state).toBe("paused_by_ai");
    const decision = await canRunCycleNow();
    expect(decision.allowed).toBe(false);
  });
});

describe("getCoordinatorSnapshot", () => {
  it("espone stato, direttiva attiva e raggiungibilità di Horus per admin/Bowie", async () => {
    await applyCoordinatorDirective("pause", { reason: "manutenzione" }, "horus");
    const snapshot = await getCoordinatorSnapshot();
    expect(snapshot.state).toBe("paused_by_ai");
    expect(snapshot.activeDirective).toMatchObject({ kind: "pause", issuedBy: "horus" });
    expect(snapshot.horusReachable).toBe(true);
    expect(snapshot.thinkCentreOffline).toBe(false);
  });

  it("espone anche la raggiungibilità e la direttiva di Quebracho", async () => {
    await applyCoordinatorDirective("pause", { reason: "manutenzione quebracho" }, "quebracho");
    const snapshot = await getCoordinatorSnapshot();
    expect(snapshot.quebrachoReachable).toBe(true);
    expect(snapshot.directives.quebracho).toMatchObject({ kind: "pause", issuedBy: "quebracho" });
    expect(snapshot.directives.horus).toBeNull();
    expect(snapshot.directives.admin_manual).toBeNull();
  });
});

describe("direttive multi-issuer (Task #9) — Horus e Quebracho pari grado, admin sempre prioritario", () => {
  it("due pause simultanee (horus + quebracho) non si cancellano a vicenda: entrambe restano attive nella mappa per-issuer", async () => {
    await applyCoordinatorDirective("pause", { reason: "pausa horus" }, "horus");
    await applyCoordinatorDirective("pause", { reason: "pausa quebracho" }, "quebracho");

    const snapshot = await getCoordinatorSnapshot();
    expect(snapshot.directives.horus).toMatchObject({ kind: "pause", issuedBy: "horus" });
    expect(snapshot.directives.quebracho).toMatchObject({ kind: "pause", issuedBy: "quebracho" });
    expect((await canRunCycleNow()).allowed).toBe(false);
  });

  it("resume di un issuer non tocca la pausa dell'altro (resume indipendente per-issuer)", async () => {
    await applyCoordinatorDirective("pause", { reason: "pausa horus" }, "horus");
    await applyCoordinatorDirective("pause", { reason: "pausa quebracho" }, "quebracho");

    await applyCoordinatorDirective("resume", { reason: "riprendi horus" }, "horus");
    let snapshot = await getCoordinatorSnapshot();
    expect(snapshot.directives.horus).toBeNull();
    expect(snapshot.directives.quebracho).toMatchObject({ kind: "pause" });
    // Quebracho pausa ancora attiva → il ciclo resta bloccato.
    expect((await canRunCycleNow()).allowed).toBe(false);

    await applyCoordinatorDirective("resume", { reason: "riprendi quebracho" }, "quebracho");
    snapshot = await getCoordinatorSnapshot();
    expect(snapshot.directives.quebracho).toBeNull();
    expect((await canRunCycleNow()).allowed).toBe(true);
  });

  it("una pausa di Quebracho viene ignorata (fallback deterministico) se Quebracho è irraggiungibile", async () => {
    await applyCoordinatorDirective("pause", { reason: "pausa quebracho" }, "quebracho");
    isQuebrachoUnreachableMock.mockResolvedValue(true);

    const { state } = await getCoordinatorState();
    expect(state).toBe("running");
    expect((await canRunCycleNow()).allowed).toBe(true);
  });

  it("admin_manual resta efficace anche con pause horus+quebracho attive e con entrambi irraggiungibili", async () => {
    await applyCoordinatorDirective("pause", { reason: "pausa horus" }, "horus");
    await applyCoordinatorDirective("pause", { reason: "pausa quebracho" }, "quebracho");
    await applyCoordinatorDirective("pause", { reason: "stop admin" }, "admin_manual");
    isOllamaReachableMock.mockResolvedValue(false);
    isQuebrachoUnreachableMock.mockResolvedValue(true);

    const { state } = await getCoordinatorState();
    expect(state).toBe("paused_by_ai");
    expect((await canRunCycleNow()).allowed).toBe(false);
  });
});
