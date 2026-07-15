// Task #130 — Il canale VISIBILE non-streaming /ai/assistant/notification-reply
// (quick-reply Bowie Terminal) deve inoltrare la lingua dell'utente all'agente,
// così la risposta (rispedita come push) è nella lingua dell'utente. Se la lingua
// è assente ricade sull'italiano (comportamento storico).
import { vi, describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const {
  mockGetUser,
  mockRunAssistantAgent,
  mockResolvePersona,
  mockCommitPersona,
  mockHasProvider,
  mockSendPush,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRunAssistantAgent: vi.fn(),
  mockResolvePersona: vi.fn(),
  mockCommitPersona: vi.fn().mockResolvedValue(undefined),
  mockHasProvider: vi.fn().mockReturnValue(true),
  mockSendPush: vi.fn().mockResolvedValue(1),
}));

vi.mock("../storage", () => ({ storage: { getUser: mockGetUser } }));
vi.mock("../ai/assistant/agent", () => ({
  runAssistantAgent: mockRunAssistantAgent,
  extractActions: (text: string) => ({ cleanText: text, actions: [] }),
}));
vi.mock("../ai/assistant/persona-state", () => ({
  resolvePersonaForTurn: mockResolvePersona,
  commitPersonaAfterTurn: mockCommitPersona,
}));
vi.mock("../ai/moderation/provider", () => ({
  hasAnyAiProvider: mockHasProvider,
  AI_NO_PROVIDER_MESSAGE: "no provider",
}));
vi.mock("../ai/assistant/security-filter", () => ({
  filterSensitiveOutput: (text: string) => ({ blocked: false, text }),
  SECURITY_GUARDRAIL: "",
}));
vi.mock("../lib/ai-logger", () => ({ logAiCall: vi.fn() }));
vi.mock("../push-notifications", () => ({ sendBowieReplyPush: mockSendPush }));
vi.mock("../ai/assistant/telemetry", () => ({ logAssistantEvent: vi.fn() }));
vi.mock("../ai/assistant/admin-actions", () => ({
  isWhitelistedAdminAction: vi.fn(() => false),
  validateAdminActionParams: vi.fn(),
  executeAdminAction: vi.fn(),
  getAdminActionMeta: vi.fn(),
}));

import actionsRouter from "../routes/ai-assistant-actions";

// userId distinto per test: la rotta tiene un cooldown anti-abuso a livello di
// modulo, keyed per user.id, che sopravvive tra i test.
function buildApp(userId: string): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request).session = { userId } as unknown as Request["session"];
    next();
  });
  app.use("/api", actionsRouter);
  return app;
}

/** Deferred che si risolve con le opzioni passate a runAssistantAgent (che gira
 *  in background dopo che la rotta ha già risposto 200). */
function deferRunAgent() {
  let resolve!: (opts: Record<string, unknown>) => void;
  const called = new Promise<Record<string, unknown>>((r) => { resolve = r; });
  mockRunAssistantAgent.mockImplementation(async (opts: Record<string, unknown>) => {
    resolve(opts);
    return {
      text: "reply",
      persona: { id: "bowie", name: "Bowie" },
      provider: "ollama",
      model: "qwen3:1.7b",
      farewell: false,
    };
  });
  return called;
}

describe("Task #130 — /ai/assistant/notification-reply inoltra la lingua dell'utente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockImplementation(async (id: string) => ({ id, role: "user" }));
    mockResolvePersona.mockResolvedValue({ persona: "bowie", personaFirstTurn: false, reason: "sticky" });
    mockCommitPersona.mockResolvedValue(undefined);
    mockHasProvider.mockReturnValue(true);
    mockSendPush.mockResolvedValue(1);
  });

  it("language='en' → runAssistantAgent riceve language='en'", async () => {
    const called = deferRunAgent();
    const res = await request(buildApp("u-en"))
      .post("/api/ai/assistant/notification-reply")
      .send({ message: "hello there", platform: "android", source: "bowie_terminal", language: "en" });
    expect(res.status).toBe(200);
    const opts = await called;
    expect(opts.language).toBe("en");
  });

  it("senza language → runAssistantAgent riceve il default italiano", async () => {
    const called = deferRunAgent();
    const res = await request(buildApp("u-default"))
      .post("/api/ai/assistant/notification-reply")
      .send({ message: "ciao come stai", platform: "android" });
    expect(res.status).toBe(200);
    const opts = await called;
    expect(opts.language).toBe("it");
  });

  it("lingua non valida → rifiutata dalla validazione (400)", async () => {
    const res = await request(buildApp("u-invalid"))
      .post("/api/ai/assistant/notification-reply")
      .send({ message: "hi", language: "xx" });
    expect(res.status).toBe(400);
  });
});
