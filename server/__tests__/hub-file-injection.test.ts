/**
 * Tests for hub-file-injection — Task #163 / Task #169
 *
 * Verifica che `createSaveDirectiveStreamFilter` sopprima COMPLETAMENTE i blocchi
 * [[AGENT_SAVE_FILE:…]][[/AGENT_SAVE_FILE]] dallo stream (nessun byte raggiunge il
 * client), che i blocchi vengano catturati correttamente, e che i marcatori spezzati
 * tra due chunk vengano gestiti. Copre anche `executeHubFileSaves` e
 * `buildHubFileContextForPrompt` (hub mock).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock ai-hub-client PRIMA dell'import del modulo ───────────────────────────
vi.mock("../lib/ai-hub-client", () => ({
  isHubAvailable: vi.fn(() => true),
  hubPost: vi.fn(async () => ({ ok: true, status: 200 })),
  hubGet: vi.fn(async () => ({ ok: true, status: 200, data: { files: [] } })),
  HUB_FILE_READ_TIMEOUT_MS: 5_000,
}));

import {
  createSaveDirectiveStreamFilter,
  executeHubFileSaves,
  buildHubFileContextForPrompt,
  SAVE_OPEN_PREFIX,
  SAVE_CLOSE_MARKER,
  isSafeRelativePath,
} from "../ai/assistant/hub-file-injection";
import { hubPost, hubGet, isHubAvailable } from "../lib/ai-hub-client";

// ── Helper ────────────────────────────────────────────────────────────────────

/** Collects all safe text emitted by the filter when fed deltas one at a time. */
function feedDeltas(deltas: string[]): { emitted: string; directives: ReturnType<ReturnType<typeof createSaveDirectiveStreamFilter>["flush"]> } {
  const filter = createSaveDirectiveStreamFilter();
  let emitted = "";
  for (const d of deltas) {
    filter.push(d, (safe) => { emitted += safe; });
  }
  const directives = filter.flush((safe) => { emitted += safe; });
  return { emitted, directives };
}

// ── isSafeRelativePath ────────────────────────────────────────────────────────

describe("isSafeRelativePath", () => {
  it("accepts simple relative paths", () => {
    expect(isSafeRelativePath("ares/report.md")).toBe(true);
    expect(isSafeRelativePath("docs/analisi.txt")).toBe(true);
    expect(isSafeRelativePath("note.md")).toBe(true);
  });
  it("rejects absolute paths", () => {
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
  });
  it("rejects path traversal", () => {
    expect(isSafeRelativePath("../secret")).toBe(false);
    expect(isSafeRelativePath("ares/../../etc")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("   ")).toBe(false);
  });
  it("rejects null bytes", () => {
    expect(isSafeRelativePath("file\0name")).toBe(false);
  });
});

// ── createSaveDirectiveStreamFilter — no directive ───────────────────────────

describe("createSaveDirectiveStreamFilter — no directive", () => {
  it("passes through plain text unchanged", () => {
    const { emitted, directives } = feedDeltas(["Hello, ", "world!"]);
    expect(emitted).toBe("Hello, world!");
    expect(directives).toHaveLength(0);
  });

  it("passes through text with brackets that are not directives", () => {
    const { emitted, directives } = feedDeltas(["[NOTE: some annotation]", " normal text"]);
    expect(emitted).toBe("[NOTE: some annotation] normal text");
    expect(directives).toHaveLength(0);
  });
});

// ── createSaveDirectiveStreamFilter — single directive ───────────────────────

describe("createSaveDirectiveStreamFilter — single directive", () => {
  const path = "ares/report.md";
  const content = "# Report\nLine one.\nLine two.";
  const directive = `${SAVE_OPEN_PREFIX} ${path}]]\n${content}\n${SAVE_CLOSE_MARKER}`;

  it("suppresses directive bytes completely (single chunk)", () => {
    const { emitted, directives } = feedDeltas([directive]);
    expect(emitted).toBe("");
    expect(directives).toHaveLength(1);
    expect(directives[0].path).toBe(path);
    expect(directives[0].content).toBe(content + "\n");
  });

  it("suppresses directive with surrounding text (newlines outside directive preserved)", () => {
    // The filter suppresses directive bytes only; the \n before/after in surrounding
    // text are NOT part of the directive and are emitted as-is.
    const { emitted, directives } = feedDeltas([`Before.\n${directive}\nAfter.`]);
    expect(emitted).toBe("Before.\n\nAfter.");
    expect(directives).toHaveLength(1);
    expect(directives[0].path).toBe(path);
  });

  it("suppresses directive split across many small chunks", () => {
    // Split each character into its own delta — worst case for buffering.
    // Surrounding newlines (not part of directive) are emitted.
    const full = `Text before.\n${directive}\nText after.`;
    const deltas = full.split("").map((c) => c);
    const { emitted, directives } = feedDeltas(deltas);
    expect(emitted).toBe("Text before.\n\nText after.");
    expect(directives).toHaveLength(1);
    expect(directives[0].path).toBe(path);
  });

  it("suppresses directive when open marker is split at chunk boundary", () => {
    const half = Math.floor(SAVE_OPEN_PREFIX.length / 2);
    const full = `Intro. ${directive} Outro.`;
    // Split deliberately at the open prefix boundary
    const chunk1 = full.slice(0, full.indexOf(SAVE_OPEN_PREFIX) + half);
    const chunk2 = full.slice(chunk1.length);
    const { emitted, directives } = feedDeltas([chunk1, chunk2]);
    expect(emitted).toBe("Intro.  Outro.");
    expect(directives).toHaveLength(1);
  });

  it("emits no directive bytes even when content is long", () => {
    const bigContent = "x".repeat(10_000);
    const bigDirective = `${SAVE_OPEN_PREFIX} ares/big.md]]\n${bigContent}\n${SAVE_CLOSE_MARKER}`;
    const { emitted, directives } = feedDeltas([bigDirective]);
    expect(emitted).not.toContain("[[");
    expect(emitted).not.toContain("AGENT_SAVE_FILE");
    expect(directives).toHaveLength(1);
    expect(directives[0].content).toBe(bigContent + "\n");
  });
});

// ── createSaveDirectiveStreamFilter — multiple directives ────────────────────

describe("createSaveDirectiveStreamFilter — multiple directives", () => {
  it("captures two directives and emits surrounding text (newlines outside preserved)", () => {
    const d1 = `${SAVE_OPEN_PREFIX} one.md]]\ncontent one\n${SAVE_CLOSE_MARKER}`;
    const d2 = `${SAVE_OPEN_PREFIX} two.md]]\ncontent two\n${SAVE_CLOSE_MARKER}`;
    const { emitted, directives } = feedDeltas([`A\n${d1}\nB\n${d2}\nC`]);
    expect(emitted).toBe("A\n\nB\n\nC");
    expect(directives).toHaveLength(2);
    expect(directives[0].path).toBe("one.md");
    expect(directives[1].path).toBe("two.md");
  });
});

// ── createSaveDirectiveStreamFilter — security ───────────────────────────────

describe("createSaveDirectiveStreamFilter — security", () => {
  it("rejects path traversal in directive path", () => {
    const badDir = `${SAVE_OPEN_PREFIX} ../../etc/passwd]]\nevil\n${SAVE_CLOSE_MARKER}`;
    const { emitted, directives } = feedDeltas([`Before\n${badDir}\nAfter`]);
    // Directive bytes still suppressed from stream (good); surrounding newlines remain.
    // Directive NOT captured (path rejected by isSafeRelativePath).
    expect(emitted).toBe("Before\n\nAfter");
    expect(directives).toHaveLength(0);
  });

  it("rejects absolute path in directive", () => {
    const badDir = `${SAVE_OPEN_PREFIX} /etc/passwd]]\nevil\n${SAVE_CLOSE_MARKER}`;
    const { directives } = feedDeltas([badDir]);
    expect(directives).toHaveLength(0);
  });
});

// ── createSaveDirectiveStreamFilter — malformed directive ────────────────────

describe("createSaveDirectiveStreamFilter — malformed (no close marker)", () => {
  it("silently discards unclosed directive and suppresses its bytes", () => {
    const incomplete = `${SAVE_OPEN_PREFIX} ares/file.md]]\ncontent without close`;
    const { emitted, directives } = feedDeltas(["Normal text. ", incomplete]);
    // Normal text is emitted; incomplete directive bytes suppressed
    expect(emitted).toBe("Normal text. ");
    expect(directives).toHaveLength(0);
  });
});

// ── executeHubFileSaves ───────────────────────────────────────────────────────

describe("executeHubFileSaves", () => {
  beforeEach(() => {
    vi.mocked(hubPost).mockReset();
    vi.mocked(hubGet).mockReset();
    vi.mocked(isHubAvailable).mockReturnValue(true);
  });

  it("returns empty array when no directives", async () => {
    const outcomes = await executeHubFileSaves([]);
    expect(outcomes).toHaveLength(0);
    expect(hubPost).not.toHaveBeenCalled();
  });

  it("calls hubPost for each directive and returns ok:true on success", async () => {
    vi.mocked(hubPost).mockResolvedValue({ ok: true, status: 200 });
    const outcomes = await executeHubFileSaves([
      { path: "ares/a.md", content: "content a" },
      { path: "ares/b.md", content: "content b" },
    ]);
    expect(hubPost).toHaveBeenCalledTimes(2);
    expect(hubPost).toHaveBeenCalledWith("/files/write", { path: "ares/a.md", content: "content a" });
    expect(hubPost).toHaveBeenCalledWith("/files/write", { path: "ares/b.md", content: "content b" });
    expect(outcomes[0]).toEqual({ path: "ares/a.md", ok: true });
    expect(outcomes[1]).toEqual({ path: "ares/b.md", ok: true });
  });

  it("returns ok:false with error on hub failure", async () => {
    vi.mocked(hubPost).mockResolvedValue({ ok: false, status: 500, error: "server error" });
    const outcomes = await executeHubFileSaves([{ path: "ares/fail.md", content: "x" }]);
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].error).toBe("server error");
  });

  it("returns ok:false when hub is unavailable (no network call)", async () => {
    vi.mocked(isHubAvailable).mockReturnValue(false);
    const outcomes = await executeHubFileSaves([{ path: "ares/x.md", content: "x" }]);
    expect(hubPost).not.toHaveBeenCalled();
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].error).toMatch(/non disponibile/);
  });

  it("is non-fatal when hubPost throws", async () => {
    vi.mocked(hubPost).mockRejectedValue(new Error("network timeout"));
    const outcomes = await executeHubFileSaves([{ path: "ares/x.md", content: "x" }]);
    expect(outcomes[0].ok).toBe(false);
    expect(outcomes[0].error).toMatch(/network timeout/);
  });
});

// ── buildHubFileContextForPrompt ──────────────────────────────────────────────

describe("buildHubFileContextForPrompt", () => {
  beforeEach(() => {
    vi.mocked(hubPost).mockReset();
    vi.mocked(hubGet).mockReset();
    vi.mocked(isHubAvailable).mockReturnValue(true);
  });

  it("returns empty string when hub is unavailable (no intent check, no network call)", async () => {
    vi.mocked(isHubAvailable).mockReturnValue(false);
    const result = await buildHubFileContextForPrompt("leggi il file nadir/note.md");
    expect(result).toBe("");
    expect(hubGet).not.toHaveBeenCalled();
  });

  it("returns empty string when message has no file intent", async () => {
    const result = await buildHubFileContextForPrompt("Come stai? Dimmi una cosa a caso.");
    expect(result).toBe("");
    expect(hubGet).not.toHaveBeenCalled();
  });

  it("read intent — fetches /files/read and includes content in returned block", async () => {
    vi.mocked(hubGet).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, content: "# Ciao\nTesto del file.", path: "nadir/note.md" },
    });
    const result = await buildHubFileContextForPrompt("leggi il file nadir/note.md");
    expect(hubGet).toHaveBeenCalledWith("/files/read", { path: "nadir/note.md" }, 5_000);
    expect(result).toContain("AI-HUB FILE READ");
    expect(result).toContain("nadir/note.md");
    expect(result).toContain("# Ciao");
  });

  it("read intent — hub returns error → includes error message in block, no throw", async () => {
    vi.mocked(hubGet).mockResolvedValue({ ok: false, status: 500, error: "file not found" });
    const result = await buildHubFileContextForPrompt("leggi il file nadir/missing.md");
    // Should still return a non-empty block describing the error (best-effort)
    // and must not throw
    expect(typeof result).toBe("string");
    expect(hubGet).toHaveBeenCalled();
  });

  it("list intent — fetches /files/list and includes listing in returned block", async () => {
    vi.mocked(hubGet).mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        files: [
          { name: "report.md", type: "file", size: 1234 },
          { name: "docs", type: "directory" },
        ],
        path: "",
      },
    });
    const result = await buildHubFileContextForPrompt("elenca i file nella cartella condivisa");
    expect(hubGet).toHaveBeenCalledWith("/files/list", expect.anything(), 5_000);
    expect(result).toContain("AI-HUB FILE LIST");
    expect(result).toContain("report.md");
    expect(result).toContain("docs");
  });

  it("list intent — hub returns empty listing → block still present, no throw", async () => {
    vi.mocked(hubGet).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, files: [], path: "" },
    });
    const result = await buildHubFileContextForPrompt("elenca i file nella cartella condivisa");
    expect(typeof result).toBe("string");
    expect(hubGet).toHaveBeenCalled();
  });

  it("list intent — hub throws → returns empty string (best-effort, no throw)", async () => {
    vi.mocked(hubGet).mockRejectedValue(new Error("network error"));
    const result = await buildHubFileContextForPrompt("elenca i file nella cartella agent-shared");
    expect(typeof result).toBe("string");
    // no throw
  });

  it("includeWrite:true → returned block contains the save directive hint", async () => {
    vi.mocked(hubGet).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, files: [{ name: "x.md", type: "file" }], path: "" },
    });
    const result = await buildHubFileContextForPrompt("elenca i file nella cartella condivisa", { includeWrite: true });
    expect(result).toContain("[[AGENT_SAVE_FILE:");
  });

  it("includeWrite:false (default) → returned block does not contain the save directive hint", async () => {
    vi.mocked(hubGet).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, files: [{ name: "x.md", type: "file" }], path: "" },
    });
    const result = await buildHubFileContextForPrompt("elenca i file nella cartella condivisa");
    expect(result).not.toContain("[[AGENT_SAVE_FILE:");
  });
});
