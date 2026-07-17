/**
 * Unit tests for horus-propose-tasks.ts
 *
 * Covers:
 *  - normalizeArchitectSection: bullet/numbered list → table conversion and
 *    pass-through when a table is already present.
 *  - parseTasks: architectFormatValid flag + stderr warning on the fallback
 *    path when the architect file has no parseable ## TASK VALIDATI section.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeArchitectSection, parseTasks } from "../horus-propose-tasks";

// ─── normalizeArchitectSection ────────────────────────────────────────────────

describe("normalizeArchitectSection", () => {
  it("returns normalized=false and content unchanged when there is no ## TASK VALIDATI header", () => {
    const content = "# Report\n\n## TASK PROPOSTI DA HORUS\n| Titolo | Priorità |\n|--------|----------|\n| Fix X | alta |\n";
    const result = normalizeArchitectSection(content);
    expect(result.normalized).toBe(false);
    expect(result.content).toBe(content);
  });

  it("returns normalized=false when ## TASK VALIDATI already contains a table", () => {
    const content =
      "## TASK VALIDATI\n| Titolo | Priorità | Motivazione |\n|--------|----------|-------------|\n| Fix A | alta | bug critico |\n";
    const result = normalizeArchitectSection(content);
    expect(result.normalized).toBe(false);
    expect(result.content).toBe(content);
  });

  it("converts a bullet-list ## TASK VALIDATI section to a markdown table", () => {
    const content =
      "## TASK VALIDATI\n- Fix the broken timeout\n- Add retry logic\n- Log warnings to stderr\n\n## ALTRO\nsome text\n";
    const { content: out, normalized } = normalizeArchitectSection(content);

    expect(normalized).toBe(true);
    // The resulting content must contain a table header
    expect(out).toContain("| Titolo | Priorità | Motivazione |");
    expect(out).toContain("|--------|----------|-------------|");
    // Each bullet item must appear as a table row
    expect(out).toContain("| Fix the broken timeout |");
    expect(out).toContain("| Add retry logic |");
    expect(out).toContain("| Log warnings to stderr |");
    // The trailing section must be preserved
    expect(out).toContain("## ALTRO");
  });

  it("converts a numbered-list ## TASK VALIDATI section to a markdown table", () => {
    const content =
      "## TASK VALIDATI\n1. First task\n2. Second task\n";
    const { content: out, normalized } = normalizeArchitectSection(content);

    expect(normalized).toBe(true);
    expect(out).toContain("| First task |");
    expect(out).toContain("| Second task |");
  });

  it("returns normalized=false when ## TASK VALIDATI is present but has no list items", () => {
    const content = "## TASK VALIDATI\nSolo testo libero senza lista.\n";
    const result = normalizeArchitectSection(content);
    expect(result.normalized).toBe(false);
    expect(result.content).toBe(content);
  });

  it("truncates very long bullet titles to 80 characters in the generated table", () => {
    const longTitle = "A".repeat(120);
    const content = `## TASK VALIDATI\n- ${longTitle}\n`;
    const { content: out, normalized } = normalizeArchitectSection(content);

    expect(normalized).toBe(true);
    // The title in the table row should be capped at 80 chars
    const match = out.match(/\| ([^|]+) \| media \|/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeLessThanOrEqual(80);
  });

  it("escapes pipe characters inside bullet titles", () => {
    const content = "## TASK VALIDATI\n- Fix foo | bar issue\n";
    const { content: out } = normalizeArchitectSection(content);
    // Pipes inside the title must be replaced with em-dash to avoid breaking the table
    expect(out).toContain("Fix foo — bar issue");
  });

  it("strips a complete '(file: foo.ts)' annotation from a bullet title", () => {
    const content =
      "## TASK VALIDATI\n- Correggere il race condition nel probe (file: server/probe.ts)\n";
    const { content: out, normalized } = normalizeArchitectSection(content);
    expect(normalized).toBe(true);
    // The table title must not contain the file annotation
    expect(out).not.toContain("(file:");
    expect(out).toContain("Correggere il race condition nel probe");
  });

  it("strips an incomplete '(file: `foo' cut-off annotation from a bullet title", () => {
    const content =
      "## TASK VALIDATI\n- Correggere il race condition (file: `server/probe\n";
    const { content: out, normalized } = normalizeArchitectSection(content);
    expect(normalized).toBe(true);
    expect(out).not.toContain("(file:");
    expect(out).toContain("Correggere il race condition");
  });

  it("truncates a long title at a word boundary — no mid-word cut", () => {
    // Title is >80 chars with clear word boundaries; the 80-char prefix ends mid-word
    const longTitle =
      "Aggiungere un meccanismo di retry automatico al probe ThinkCentre quando la connessione fallisce";
    expect(longTitle.length).toBeGreaterThan(80);

    const content = `## TASK VALIDATI\n- ${longTitle}\n`;
    const { content: out, normalized } = normalizeArchitectSection(content);
    expect(normalized).toBe(true);

    // Extract the title cell from the first data row
    const dataRow = out
      .split("\n")
      .find(
        (l) =>
          l.startsWith("|") &&
          !/^\|\s*Titolo\s*\|/.test(l) &&
          !/^\|[-| ]+\|$/.test(l.trim()),
      ) ?? "";
    const cells = dataRow.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    const title = cells[0] ?? "";

    // Must be within the limit
    expect(title.length).toBeLessThanOrEqual(80);
    // Must end on a complete word — every word in the title must be a whole word from the original
    const originalWords = longTitle.split(" ");
    const titleWords = title.split(" ");
    titleWords.forEach((word, i) => {
      expect(word).toBe(originalWords[i]);
    });
  });

  it("strips '(file: …)' annotation before truncating a long title", () => {
    const longItem =
      "Aggiungere un meccanismo di retry automatico al probe del ThinkCentre per la connessione (file: server/probe.ts)";
    const content = `## TASK VALIDATI\n- ${longItem}\n`;
    const { content: out, normalized } = normalizeArchitectSection(content);
    expect(normalized).toBe(true);
    expect(out).not.toContain("(file:");
    // The resulting title must still be within the limit
    const dataRow = out
      .split("\n")
      .find(
        (l) =>
          l.startsWith("|") &&
          !/^\|\s*Titolo\s*\|/.test(l) &&
          !/^\|[-| ]+\|$/.test(l.trim()),
      ) ?? "";
    const cells = dataRow.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    expect((cells[0] ?? "").length).toBeLessThanOrEqual(80);
  });
});

// ─── parseTasks ───────────────────────────────────────────────────────────────

describe("parseTasks — no architect content", () => {
  it("returns architectFormatValid=true and parses tasks from ## TASK PROPOSTI DA HORUS", () => {
    const report =
      "## TASK PROPOSTI DA HORUS\n" +
      "| Titolo | Priorità | Problema | Azione |\n" +
      "|--------|----------|----------|---------|\n" +
      "| Fix timeout | alta | timeout ricorrente | aggiungere retry |\n";
    const result = parseTasks(report, null);
    expect(result.architectFormatValid).toBe(true);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe("Fix timeout");
  });

  it("returns architectFormatValid=true and empty tasks when the report has no recognisable section", () => {
    const result = parseTasks("# Report senza sezioni note\n", null);
    expect(result.architectFormatValid).toBe(true);
    expect(result.tasks).toHaveLength(0);
  });
});

describe("parseTasks — architect content with bullet list (normalizer path)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns architectFormatValid=true and tasks when architect sends a bullet list", () => {
    const architectContent =
      "## TASK VALIDATI\n- Fix the broken timeout\n- Add retry logic\n";
    const report =
      "## TASK PROPOSTI DA HORUS\n" +
      "| Titolo | Priorità | Problema | Azione |\n" +
      "|--------|----------|----------|---------|\n" +
      "| Original task | media | problema | azione |\n";

    const result = parseTasks(report, architectContent);

    expect(result.architectFormatValid).toBe(true);
    // Tasks come from the normalised architect section, not the original
    expect(result.tasks.length).toBeGreaterThanOrEqual(1);
    expect(result.tasks.some((t) => t.title.includes("Fix the broken timeout"))).toBe(true);
  });

  it("logs the normalizer warning to stderr when a bullet list is converted", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const architectContent =
      "## TASK VALIDATI\n- Task alpha\n- Task beta\n";
    const report = "## TASK PROPOSTI DA HORUS\n| Titolo | Priorità |\n|--------|----------|\n";

    parseTasks(report, architectContent);

    const warnings = warnSpy.mock.calls.map((c) => c.join(" "));
    const hasFormatWarning = warnings.some(
      (w) => w.includes("ARCHITECT FORMAT") && w.includes("lista"),
    );
    expect(hasFormatWarning).toBe(true);
  });
});

describe("parseTasks — architect content with no table and no list (fallback path)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns architectFormatValid=false when architect file has no ## TASK VALIDATI section", () => {
    const architectContent = "# Revisione\n\nIl report sembra buono nel complesso.\n";
    const report =
      "## TASK PROPOSTI DA HORUS\n" +
      "| Titolo | Priorità | Problema | Azione |\n" +
      "|--------|----------|----------|---------|\n" +
      "| Task originale | media | bug | fix |\n";

    const result = parseTasks(report, architectContent);

    expect(result.architectFormatValid).toBe(false);
  });

  it("falls back to the original Horus section when architect format is invalid", () => {
    const architectContent = "Nessuna sezione strutturata qui.\n";
    const report =
      "## TASK PROPOSTI DA HORUS\n" +
      "| Titolo | Priorità | Problema | Azione |\n" +
      "|--------|----------|----------|---------|\n" +
      "| Task originale | media | bug | fix |\n";

    const result = parseTasks(report, architectContent);

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe("Task originale");
  });

  it("logs the ARCHITECT FORMAT INVALIDO warning to stderr on the fallback path", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const architectContent = "Testo libero senza sezione task.\n";
    const report =
      "## TASK PROPOSTI DA HORUS\n" +
      "| Titolo | Priorità | Problema | Azione |\n" +
      "|--------|----------|----------|---------|\n" +
      "| Task originale | media | bug | fix |\n";

    parseTasks(report, architectContent);

    const warnings = warnSpy.mock.calls.map((c) => c.join(" "));
    const hasInvalidFormatWarning = warnings.some(
      (w) => w.includes("ARCHITECT FORMAT INVALIDO"),
    );
    expect(hasInvalidFormatWarning).toBe(true);
  });

  it("returns architectFormatValid=false and empty tasks when architect has ## TASK VALIDATI with only free text and report has no original section", () => {
    const architectContent = "## TASK VALIDATI\nTesto libero, nessuna lista, nessuna tabella.\n";
    const report = "# Report senza sezioni\n";

    const result = parseTasks(report, architectContent);

    expect(result.architectFormatValid).toBe(false);
    expect(result.tasks).toHaveLength(0);
  });
});
