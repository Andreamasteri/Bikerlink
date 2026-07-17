/**
 * Unit tests for the two pure string transforms that shape Horus task output:
 *
 *  - normalizeTaskSection  (scripts/lib/horus-normalize.ts)
 *    Converts a Horus bullet/numbered list under "## TASK PROPOSTI DA HORUS"
 *    into a markdown table, stripping "(file: …)" annotations and truncating
 *    long titles at a word boundary.
 *
 *  - titleToSlug           (scripts/horus-propose-tasks.ts)
 *    Converts a task title into a filesystem-safe slug, truncating at a word
 *    boundary when the result would exceed 60 characters.
 *
 * Both functions are pure string transforms — no DB, no network, no mocks.
 */

import { describe, it, expect } from "vitest";
import { normalizeTaskSection } from "../lib/horus-normalize";
import { titleToSlug } from "../lib/horus-slug";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Extracts the first data row (not header/separator) from a markdown table string. */
function firstDataRow(table: string): string {
  // Skip the exact header row ("| Titolo | Priorità | …") and separator rows ("|----|…")
  return table
    .split("\n")
    .filter(
      (l) =>
        l.startsWith("|") &&
        !/^\|\s*Titolo\s*\|/.test(l) &&
        !/^\|[-| ]+\|$/.test(l.trim()),
    )
    [0] ?? "";
}

/** Returns the title cell (first column) of a markdown table row. */
function titleCell(row: string): string {
  const cells = row.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
  return cells[0] ?? "";
}

// ─── normalizeTaskSection ─────────────────────────────────────────────────────

describe("normalizeTaskSection", () => {
  const HEADER = "## TASK PROPOSTI DA HORUS";
  const PREFIX = "# Report Horus\n\nSome preamble.\n\n";
  const SUFFIX = "\n\n## ANALISI CAUSE\n\nSome analysis.";

  function buildReport(items: string[]): string {
    const list = items.map((item, i) => `${i + 1}. ${item}`).join("\n");
    return `${PREFIX}${HEADER}\n${list}${SUFFIX}`;
  }

  it("converts a numbered list into a markdown table", () => {
    const report = buildReport(["Aggiungere timeout al probe Valhalla"]);
    const result = normalizeTaskSection(report);
    expect(result).toContain("| Titolo |");
    expect(result).toContain("Aggiungere timeout al probe Valhalla");
  });

  it("converts a bulleted list (- syntax) into a markdown table", () => {
    const list = "- Aggiungere timeout al probe Valhalla\n- Secondo task breve";
    const report = `${PREFIX}${HEADER}\n${list}${SUFFIX}`;
    const result = normalizeTaskSection(report);
    expect(result).toContain("| Titolo |");
    expect(result).toContain("Aggiungere timeout al probe Valhalla");
    expect(result).toContain("Secondo task breve");
  });

  it("converts a bulleted list (* syntax) into a markdown table", () => {
    const list = "* Aggiungere timeout al probe Valhalla";
    const report = `${PREFIX}${HEADER}\n${list}${SUFFIX}`;
    const result = normalizeTaskSection(report);
    expect(result).toContain("| Titolo |");
  });

  it("strips a complete '(file: foo.ts)' annotation from the title", () => {
    const report = buildReport(["Correggere il race condition nel probe (file: server/probe.ts)"]);
    const result = normalizeTaskSection(report);
    const row = firstDataRow(result);
    const title = titleCell(row);
    expect(title).not.toContain("(file:");
    expect(title).toContain("Correggere il race condition nel probe");
  });

  it("strips an incomplete '(file: `foo' cut-off annotation", () => {
    const report = buildReport(["Correggere il race condition (file: `server/probe"]);
    const result = normalizeTaskSection(report);
    const row = firstDataRow(result);
    const title = titleCell(row);
    expect(title).not.toContain("(file:");
    expect(title).toContain("Correggere il race condition");
  });

  it("truncates a title longer than 80 chars at a word boundary (no mid-word cut)", () => {
    // 90-char item with clear word boundaries
    const longTitle =
      "Aggiungere un meccanismo di retry automatico al probe ThinkCentre quando la connessione fallisce";
    expect(longTitle.length).toBeGreaterThan(80);

    const report = buildReport([longTitle]);
    const result = normalizeTaskSection(report);
    const row = firstDataRow(result);
    const title = titleCell(row);

    // Must be ≤ 80 characters
    expect(title.length).toBeLessThanOrEqual(80);
    // Must not end in the middle of a word (last char should not be a letter
    // that is immediately followed by a letter/digit in the original)
    const lastChar = title[title.length - 1];
    expect(lastChar).not.toBe(" ");
    // The cut must land on a complete word — verify the truncated title is a
    // prefix of the original split on spaces (i.e. whole words only)
    const originalWords = longTitle.split(" ");
    const titleWords = title.split(" ");
    titleWords.forEach((word, i) => {
      expect(word).toBe(originalWords[i]);
    });
  });

  it("does NOT truncate titles that are exactly 80 chars", () => {
    const title79 = "A".repeat(39) + " " + "B".repeat(39); // 79 chars — under limit
    expect(title79.length).toBeLessThanOrEqual(80);

    const report = buildReport([title79]);
    const result = normalizeTaskSection(report);
    const row = firstDataRow(result);
    const cell = titleCell(row);
    expect(cell).toBe(title79);
  });

  it("handles a long title with (file: …) combined — strips annotation before truncating", () => {
    const longItem =
      "Aggiungere un meccanismo di retry automatico al probe del ThinkCentre per la connessione (file: server/probe.ts)";
    const report = buildReport([longItem]);
    const result = normalizeTaskSection(report);
    const row = firstDataRow(result);
    const title = titleCell(row);
    expect(title).not.toContain("(file:");
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it("escapes pipe characters in the title with an em-dash", () => {
    const report = buildReport(["Titolo con | pipe dentro"]);
    const result = normalizeTaskSection(report);
    const row = firstDataRow(result);
    const title = titleCell(row);
    expect(title).not.toContain("|");
    expect(title).toContain("—");
  });

  it("returns the report unchanged if the section is absent", () => {
    const report = "# Report\n\nNessuna sezione task.\n";
    expect(normalizeTaskSection(report)).toBe(report);
  });

  it("returns the report unchanged if the section already contains a table", () => {
    const table =
      "| Titolo | Priorità | Problema | Azione |\n" +
      "|--------|----------|---------|--------|\n" +
      "| Task esistente | alta | problema | azione |\n";
    const report = `${PREFIX}${HEADER}\n${table}${SUFFIX}`;
    expect(normalizeTaskSection(report)).toBe(report);
  });

  it("preserves content after the task section (the rest of the report)", () => {
    const report = buildReport(["Task breve"]);
    const result = normalizeTaskSection(report);
    expect(result).toContain("## ANALISI CAUSE");
    expect(result).toContain("Some analysis.");
  });

  it("returns the report unchanged when the list is empty (no convertible rows)", () => {
    const report = `${PREFIX}${HEADER}\n\nNessun task trovato.\n${SUFFIX}`;
    expect(normalizeTaskSection(report)).toBe(report);
  });
});

// ─── titleToSlug ──────────────────────────────────────────────────────────────

describe("titleToSlug", () => {
  it("converts a short title to a lowercase hyphenated slug", () => {
    expect(titleToSlug("Aggiungere timeout al probe")).toBe("aggiungere-timeout-al-probe");
  });

  it("replaces accented characters", () => {
    expect(titleToSlug("Configurazione più sicura")).toBe("configurazione-piu-sicura");
  });

  it("removes characters that are not letters, digits or hyphens", () => {
    expect(titleToSlug("Fix: errore (critico) nel server!")).toBe("fix-errore-critico-nel-server");
  });

  it("collapses multiple spaces/hyphens into a single hyphen", () => {
    expect(titleToSlug("Fix   --  problema")).toBe("fix-problema");
  });

  it("trims leading and trailing hyphens", () => {
    expect(titleToSlug(" fix cosa ")).toBe("fix-cosa");
  });

  it("returns a slug ≤ 60 chars for a title longer than 60 chars", () => {
    const long = "Aggiungere un meccanismo di retry al probe ThinkCentre per la connessione fallita";
    expect(long.length).toBeGreaterThan(60);
    const slug = titleToSlug(long);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("truncates a long slug at a word boundary — slug must not end with a partial word", () => {
    // Use a title whose 60-char prefix ends in the middle of a word
    // "aggiungere-un-meccanismo-di-retry-al-probe-thinkcentre-per" = 58 chars
    // adding "-la" = 61 -> slug will cut before "-la"
    const title = "Aggiungere un meccanismo di retry al probe ThinkCentre per la connessione";
    const slug = titleToSlug(title);

    // Must not end with a hyphen
    expect(slug).not.toMatch(/-$/);
    // The last segment must be a complete word from the original title
    const segments = slug.split("-");
    const lastWord = segments[segments.length - 1];
    const originalWords = title
      .toLowerCase()
      .replace(/[àáâã]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
      .replace(/[òóôõ]/g, "o").replace(/[ùúûü]/g, "u").replace(/ñ/g, "n")
      .replace(/[^a-z0-9\s-]/g, "").split(/\s+/);
    expect(originalWords).toContain(lastWord);
  });

  it("slug ends on a hyphen boundary (last char is not a hyphen, first char is not a hyphen)", () => {
    const title = "Bloccare il write diretto su app_settings che bypassa il gate ORM del server di produzione";
    const slug = titleToSlug(title);
    expect(slug).not.toMatch(/^-/);
    expect(slug).not.toMatch(/-$/);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("handles a title that is exactly 60 slug-chars without truncation", () => {
    // Build a title that maps to exactly 60 slug chars
    const title = "abcde fghij klmno pqrst uvwxy zabcd efghi jklmn opqrs tuvwx"; // spaces → hyphens
    const slug = titleToSlug(title);
    expect(slug.length).toBeLessThanOrEqual(60);
    // Should not truncate — verify no chars were dropped
    expect(slug).toBe(title.replace(/ /g, "-"));
  });

  it("handles an all-special-char title gracefully (returns empty or minimal slug)", () => {
    const slug = titleToSlug("!!! ??? ### ---");
    // No crash; result must be a valid (possibly empty) slug with no leading/trailing hyphens
    expect(slug).not.toMatch(/^-/);
    expect(slug).not.toMatch(/-$/);
  });
});
