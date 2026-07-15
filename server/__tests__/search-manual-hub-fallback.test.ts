/**
 * Task #153 — search_manual instrada verso il TC ai-hub con fallback pgvector.
 *
 * Garanzie:
 *   - isHubAvailable()=true → chiama hubPost("/nadir/search") e NON searchNadir;
 *   - isHubAvailable()=false → chiama searchNadir (fallback storico), NON l'hub;
 *   - hub disponibile ma risposta in errore → fallback a searchNadir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hubMocks = vi.hoisted(() => ({
  isHubAvailable: vi.fn(() => true),
  hubPost: vi.fn(),
}));
const nadirMocks = vi.hoisted(() => ({
  searchNadir: vi.fn(),
}));

vi.mock("../lib/ai-hub-client", () => ({
  isHubAvailable: hubMocks.isHubAvailable,
  hubPost: hubMocks.hubPost,
}));
vi.mock("../ai/nadir", () => ({
  searchNadir: nadirMocks.searchNadir,
}));
// Dipendenze inter-agente non usate da search_manual: mock leggeri per evitare
// di caricare i client Ollama/DB reali all'import.
vi.mock("../ai/assistant/inter-agent", () => ({
  askHorus: vi.fn(),
  askQuebracho: vi.fn(),
  askAres: vi.fn(),
}));
vi.mock("../ai/assistant/horus-memory", () => ({ appendHorusNote: vi.fn() }));
vi.mock("../ai/assistant/task-review", () => ({ reviewTaskPlan: vi.fn() }));

import { buildSearchManualTool } from "../ai/assistant/inter-agent-tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTool(): any {
  const tools = buildSearchManualTool({
    signal: undefined,
    requesterId: "user-1",
    includeAllUsers: false,
    language: "it",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as Record<string, any>;
  return tools.search_manual;
}

beforeEach(() => {
  hubMocks.isHubAvailable.mockReset().mockReturnValue(true);
  hubMocks.hubPost.mockReset();
  nadirMocks.searchNadir.mockReset();
});

describe("search_manual — ai-hub vs fallback pgvector", () => {
  it("hub disponibile → usa hubPost e NON searchNadir", async () => {
    hubMocks.hubPost.mockResolvedValue({
      ok: true,
      data: { model: "ai-hub:all-minilm", fragments: [{ origin: "it.md", similarity: 0.91, text: "come pianificare un percorso" }] },
    });
    const tool = buildTool();

    const res = await tool.execute({ query: "come pianifico un percorso?", limit: 5 }, {});

    expect(hubMocks.hubPost).toHaveBeenCalledWith("/nadir/search", { query: "come pianifico un percorso?", limit: 5, language: "it" });
    expect(nadirMocks.searchNadir).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.model).toBe("ai-hub:all-minilm");
    expect(res.fragments[0]).toEqual({ origin: "it.md", similarity: 0.91, text: "come pianificare un percorso" });
  });

  it("hub non disponibile → fallback searchNadir, hub mai chiamato", async () => {
    hubMocks.isHubAvailable.mockReturnValue(false);
    nadirMocks.searchNadir.mockResolvedValue({
      model: "local:e5", fragments: [{ origin: "manual", similarity: 0.8, text: "testo locale" }],
    });
    const tool = buildTool();

    const res = await tool.execute({ query: "domanda", limit: 5 }, {});

    expect(hubMocks.hubPost).not.toHaveBeenCalled();
    expect(nadirMocks.searchNadir).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.model).toBe("local:e5");
    expect(res.fragments[0].text).toBe("testo locale");
  });

  it("hub disponibile ma risposta in errore → fallback searchNadir", async () => {
    hubMocks.hubPost.mockResolvedValue({ ok: false, error: "timeout" });
    nadirMocks.searchNadir.mockResolvedValue({
      model: "local:e5", fragments: [{ origin: "manual", similarity: 0.7, text: "fallback" }],
    });
    const tool = buildTool();

    const res = await tool.execute({ query: "domanda", limit: null }, {});

    expect(hubMocks.hubPost).toHaveBeenCalledTimes(1);
    expect(nadirMocks.searchNadir).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    expect(res.fragments[0].text).toBe("fallback");
  });
});
