import { describe, it, expect, vi, beforeEach } from "vitest";

// Copertura del ponte Bowie → Horus: separazione richieste di CONTROLLO
// (write-intent, riservate alla chat admin) da richieste di STATO (read-only,
// aperte a qualsiasi utente, mai dipendenti da Horus/Ollama).

const getAppSettingMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../storage", () => ({ storage: { getAppSetting: getAppSettingMock, upsertAppSetting: vi.fn(async () => ({})) } }));

const isPoolHealthyMock = vi.hoisted(() => vi.fn(() => true));
vi.mock("../db", () => ({ isPoolHealthy: isPoolHealthyMock }));

const isThinkCentreOfflineMock = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../lib/thinkcentre-offline", () => ({ isThinkCentreOffline: isThinkCentreOfflineMock }));

const isOllamaReachableMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../lib/ollama-client", () => ({
  isOllamaReachable: isOllamaReachableMock,
  getOllamaModel: vi.fn(() => "mock-model"),
}));

const writeWatchdogLogMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../ai/watchdog/log", () => ({ writeWatchdogLog: writeWatchdogLogMock }));

vi.mock("../lib/dedup-logger", () => ({ dedupWarn: vi.fn() }));

const generateObjectMock = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateObject: generateObjectMock }));

import { __resetCoordinatorForTests, applyCoordinatorDirective } from "../matching/coordinator";
import {
  isCoordinatorControlRequest,
  isCoordinatorStatusRequest,
  askHorusForCoordinatorDirective,
  getCoordinatorStatusNote,
} from "../ai/assistant/coordinator-bridge";

beforeEach(() => {
  __resetCoordinatorForTests();
  getAppSettingMock.mockReset().mockResolvedValue(undefined);
  isPoolHealthyMock.mockReset().mockReturnValue(true);
  isThinkCentreOfflineMock.mockReset().mockResolvedValue(false);
  isOllamaReachableMock.mockReset().mockResolvedValue(true);
  writeWatchdogLogMock.mockReset().mockResolvedValue(undefined);
  generateObjectMock.mockReset();
});

describe("isCoordinatorControlRequest vs isCoordinatorStatusRequest", () => {
  it("classifica un comando write-intent come richiesta di controllo, non di stato", () => {
    expect(isCoordinatorControlRequest("metti in pausa il matching")).toBe(true);
    expect(isCoordinatorStatusRequest("metti in pausa il matching")).toBe(false);
  });

  it("classifica una domanda informativa come richiesta di stato, non di controllo", () => {
    expect(isCoordinatorControlRequest("perché il matching non funziona?")).toBe(false);
    expect(isCoordinatorStatusRequest("perché il matching non funziona?")).toBe(true);
  });

  it("ignora messaggi non legati al matching", () => {
    expect(isCoordinatorControlRequest("che tempo fa oggi?")).toBe(false);
    expect(isCoordinatorStatusRequest("che tempo fa oggi?")).toBe(false);
  });
});

describe("getCoordinatorStatusNote — lettura diretta, mai dipendente da Horus/Ollama", () => {
  it("riflette lo stato corrente anche se Horus/Ollama non sono mai interrogati", async () => {
    isOllamaReachableMock.mockResolvedValue(false);
    isThinkCentreOfflineMock.mockResolvedValue(true);

    const note = await getCoordinatorStatusNote();
    expect(note).toContain('state="running"');
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("include la direttiva attiva e chi l'ha emessa quando presente", async () => {
    await applyCoordinatorDirective("pause", { reason: "manutenzione admin" }, "admin_manual");
    const note = await getCoordinatorStatusNote();
    expect(note).toContain("admin_manual");
    expect(note).toContain("manutenzione admin");
  });
});

describe("askHorusForCoordinatorDirective — path di scrittura, va invocato SOLO da contesti autorizzati", () => {
  it("applica una direttiva solo se Horus (Ollama) è raggiungibile e decide di agire", async () => {
    generateObjectMock.mockResolvedValue({ object: { directive: "pause", reason: "anomalia rilevata" } });
    const result = await askHorusForCoordinatorDirective("metti in pausa il matching");
    expect(result.applied).toBe(true);
    expect(result.directive).toBe("pause");
  });

  it("non applica nulla se Horus/Ollama è irraggiungibile (fail-safe)", async () => {
    isOllamaReachableMock.mockResolvedValue(false);
    const result = await askHorusForCoordinatorDirective("metti in pausa il matching");
    expect(result.applied).toBe(false);
    expect(result.directive).toBe("none");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
