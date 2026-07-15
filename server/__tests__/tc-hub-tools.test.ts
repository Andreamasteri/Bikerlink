/**
 * Task #153 — Smoke test dei tool file/VRAM verso l'ai-hub del TC
 * (server/ai/assistant/tc-hub-tools.ts).
 *
 * Garanzie:
 *   - con hub NON disponibile ogni tool ritorna { ok:false, error } senza throw
 *     e senza chiamare la rete;
 *   - con hub disponibile save_file→hubPost("/files/write"),
 *     read_file→hubGet("/files/read"), list_files→hubGet("/files/list"),
 *     check_vram_usage→hubGet("/vram");
 *   - save_file è presente solo con includeWrite:true;
 *   - path traversal (../) rifiutato lato client senza chiamare l'hub.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hubMocks = vi.hoisted(() => ({
  isHubAvailable: vi.fn(() => true),
  hubGet: vi.fn(async () => ({ ok: true, data: {} })),
  hubPost: vi.fn(async () => ({ ok: true, data: {} })),
}));

vi.mock("../lib/ai-hub-client", () => ({
  isHubAvailable: hubMocks.isHubAvailable,
  hubGet: hubMocks.hubGet,
  hubPost: hubMocks.hubPost,
}));

import { buildHubFileTools, buildCheckVramTool } from "../ai/assistant/tc-hub-tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exec(t: any, input: unknown) {
  return t.execute(input, {});
}

beforeEach(() => {
  hubMocks.isHubAvailable.mockReset().mockReturnValue(true);
  hubMocks.hubGet.mockReset().mockResolvedValue({ ok: true, data: {} });
  hubMocks.hubPost.mockReset().mockResolvedValue({ ok: true, data: {} });
});

describe("tc-hub-tools", () => {
  it("save_file presente solo con includeWrite:true", () => {
    const writable = buildHubFileTools({ includeWrite: true });
    const readonly = buildHubFileTools({ includeWrite: false });
    expect(Object.keys(writable).sort()).toEqual(["list_files", "read_file", "save_file"]);
    expect(Object.keys(readonly).sort()).toEqual(["list_files", "read_file"]);
  });

  it("hub non disponibile → tool ritornano { ok:false } senza chiamare la rete", async () => {
    hubMocks.isHubAvailable.mockReturnValue(false);
    const tools = buildHubFileTools({ includeWrite: true }) as Record<string, unknown>;
    const vram = buildCheckVramTool() as Record<string, unknown>;

    const read = await exec(tools.read_file, { path: "nadir/note.md" });
    const list = await exec(tools.list_files, { path: null });
    const save = await exec(tools.save_file, { path: "nadir/note.md", content: "x" });
    const gpu = await exec(vram.check_vram_usage, {});

    for (const r of [read, list, save, gpu]) {
      expect(r.ok).toBe(false);
      expect(r.error).toBe("TC ai-hub non disponibile");
    }
    expect(hubMocks.hubGet).not.toHaveBeenCalled();
    expect(hubMocks.hubPost).not.toHaveBeenCalled();
  });

  it("hub disponibile → ogni tool chiama l'endpoint corretto", async () => {
    const tools = buildHubFileTools({ includeWrite: true }) as Record<string, unknown>;
    const vram = buildCheckVramTool() as Record<string, unknown>;

    await exec(tools.read_file, { path: "nadir/note.md" });
    expect(hubMocks.hubGet).toHaveBeenCalledWith("/files/read", { path: "nadir/note.md" });

    await exec(tools.list_files, { path: "docs" });
    expect(hubMocks.hubGet).toHaveBeenCalledWith("/files/list", { path: "docs" });

    await exec(tools.list_files, { path: null });
    expect(hubMocks.hubGet).toHaveBeenCalledWith("/files/list", { path: "" });

    await exec(tools.save_file, { path: "docs/a.md", content: "hello" });
    expect(hubMocks.hubPost).toHaveBeenCalledWith("/files/write", { path: "docs/a.md", content: "hello" });

    await exec(vram.check_vram_usage, {});
    expect(hubMocks.hubGet).toHaveBeenCalledWith("/vram");
  });

  it("path traversal rifiutato senza chiamare l'hub", async () => {
    const tools = buildHubFileTools({ includeWrite: true }) as Record<string, unknown>;
    const read = await exec(tools.read_file, { path: "../../etc/passwd" });
    const save = await exec(tools.save_file, { path: "/absolute", content: "x" });

    expect(read.ok).toBe(false);
    expect(save.ok).toBe(false);
    expect(hubMocks.hubGet).not.toHaveBeenCalled();
    expect(hubMocks.hubPost).not.toHaveBeenCalled();
  });
});
