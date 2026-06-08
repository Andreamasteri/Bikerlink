#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { z } from "zod";

type Lang = "en" | "es" | "fr" | "de" | "el" | "tr";
const TARGET_LANGS: Lang[] = ["en", "es", "fr", "de", "el", "tr"];
const SOURCE_LANG = "it";

const LANG_NAMES: Record<Lang, string> = {
  en: "English (en-GB)",
  es: "Spanish (es-ES)",
  fr: "French (fr-FR)",
  de: "German (de-DE)",
  el: "Greek (el-GR)",
  tr: "Turkish (tr-TR)",
};

const I18N_DIR = path.join(process.cwd(), "lib", "i18n");
const STATE_FILE = path.join(I18N_DIR, ".translations-state.json");
const GLOSSARY_FILE = path.join(process.cwd(), "scripts", "i18n-glossary.json");

const MANUAL_MARKER = "// @manual";
const BATCH_SIZE = 30;
const MODEL = "gpt-4o-mini";

type Token =
  | { type: "blank" }
  | { type: "kv"; key: string; value: string; manual: boolean };

interface ParsedFile {
  header: string;
  footer: string;
  tokens: Token[];
}

interface State {
  [lang: string]: { [key: string]: string };
}

interface Glossary {
  [italianTerm: string]: Partial<Record<Lang, string>>;
}

function parseValue(raw: string): string {
  // raw is the inside of the double quotes, with TS string escapes.
  // JSON escapes are a superset of what's used here (\n, \t, \", \\, \uXXXX).
  return JSON.parse(`"${raw}"`);
}

function emitValue(v: string): string {
  // JSON.stringify produces a valid double-quoted TS string literal.
  return JSON.stringify(v);
}

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

const KV_RE = /^(\s*)"((?:\\.|[^"\\])+)"\s*:\s*"((?:\\.|[^"\\])*)"\s*,?\s*(\/\/.*)?$/;

function parseFile(filePath: string): ParsedFile {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  // Find opening `{` line and closing `};` line.
  let openIdx = -1;
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (openIdx === -1 && /=\s*\{\s*$/.test(lines[i])) openIdx = i;
    if (/^\};\s*$/.test(lines[i])) closeIdx = i;
  }
  if (openIdx === -1 || closeIdx === -1) {
    throw new Error(`Cannot parse ${filePath}: missing { or };`);
  }
  const header = lines.slice(0, openIdx + 1).join("\n");
  const footer = lines.slice(closeIdx).join("\n");
  const body = lines.slice(openIdx + 1, closeIdx);

  const tokens: Token[] = [];
  for (const line of body) {
    if (line.trim() === "") {
      tokens.push({ type: "blank" });
      continue;
    }
    const m = line.match(KV_RE);
    if (!m) {
      // Unknown line — keep as raw blank-equivalent? Better: error loudly.
      throw new Error(`Cannot parse line in ${filePath}: ${line}`);
    }
    const key = parseValue(m[2]);
    const value = parseValue(m[3]);
    const trailing = (m[4] || "").trim();
    const manual = trailing.includes("@manual");
    tokens.push({ type: "kv", key, value, manual });
  }
  return { header, footer, tokens };
}

function buildKeyMap(parsed: ParsedFile): Map<string, { value: string; manual: boolean }> {
  const map = new Map<string, { value: string; manual: boolean }>();
  for (const t of parsed.tokens) {
    if (t.type === "kv") map.set(t.key, { value: t.value, manual: t.manual });
  }
  return map;
}

function emitFile(
  langConst: string,
  itParsed: ParsedFile,
  targetMap: Map<string, { value: string; manual: boolean }>,
): string {
  const lines: string[] = [];
  const headerForLang = itParsed.header.replace(/const it:/, `const ${langConst}:`);
  lines.push(headerForLang);
  for (const t of itParsed.tokens) {
    if (t.type === "blank") {
      lines.push("");
      continue;
    }
    const entry = targetMap.get(t.key);
    if (!entry) {
      throw new Error(`Missing translation for key "${t.key}" — bug in translation pipeline`);
    }
    const trailing = entry.manual ? "  " + MANUAL_MARKER : "";
    lines.push(`  ${JSON.stringify(t.key)}: ${emitValue(entry.value)},${trailing}`);
  }
  const footerForLang = itParsed.footer.replace(/^};/m, "};").replace(/export default it;/, `export default ${langConst};`);
  lines.push(footerForLang);
  return lines.join("\n");
}

function loadState(): State {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state: State): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function loadGlossary(): Glossary {
  if (!fs.existsSync(GLOSSARY_FILE)) return {};
  const raw = JSON.parse(fs.readFileSync(GLOSSARY_FILE, "utf8"));
  delete raw._description;
  return raw;
}

function buildGlossaryPrompt(glossary: Glossary, lang: Lang): string {
  const lines: string[] = [];
  for (const [it, langs] of Object.entries(glossary)) {
    const v = langs[lang];
    if (v) lines.push(`  "${it}" → "${v}"`);
  }
  if (lines.length === 0) return "";
  return `\nGLOSSARY (Italian → ${lang}); follow these mappings whenever the term appears:\n${lines.join("\n")}\n`;
}

async function translateBatch(
  items: { key: string; italian: string }[],
  lang: Lang,
  glossary: Glossary,
  apiKey: string,
): Promise<Record<string, string>> {
  const glossaryBlock = buildGlossaryPrompt(glossary, lang);
  const system = `You are a professional translator for BikerLink, a mobile app for motorcyclists.
Translate from Italian to ${LANG_NAMES[lang]}.

Rules:
- Keep the tone casual, friendly, and concise — this is a mobile UI.
- Preserve placeholders verbatim: {nickname}, {count}, {n}, %s, %d, etc.
- Preserve newlines (\\n), tabs, and trailing punctuation exactly.
- Match the original string length as closely as possible (mobile UI constraints).
- Keep proper nouns, brand names, and technical motorcycle terms when appropriate.
- Do NOT translate keys; translate only the Italian string values.
- Output strict JSON: {"translations": {"<key>": "<translated value>", ...}}.${glossaryBlock}`;

  const user = `Translate the following Italian strings to ${LANG_NAMES[lang]}:\n\n${JSON.stringify(
    Object.fromEntries(items.map((i) => [i.key, i.italian])),
    null,
    2,
  )}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${body}`);
  }
  const data = (await resp.json()) as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");
  let parsed: { translations?: Record<string, string> };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON from OpenAI: ${content.slice(0, 500)}`);
  }
  let translations: Record<string, string>;
  if (parsed.translations && typeof parsed.translations === "object") {
    translations = parsed.translations;
  } else if (typeof parsed === "object" && parsed !== null) {
    // Some models return the dict at root level.
    translations = parsed as unknown as Record<string, string>;
  } else {
    throw new Error(`Missing "translations" object in response`);
  }
  const out: Record<string, string> = {};
  for (const item of items) {
    const v = translations[item.key];
    if (typeof v !== "string") {
      throw new Error(`Translation for key "${item.key}" missing in OpenAI response`);
    }
    out[item.key] = v;
  }
  return out;
}

// ─── Ollama (Task #2847) ────────────────────────────────────────────────────
// Provider primario: tenta il modello locale Ollama prima di OpenAI. Stesso
// prompt strutturato; il client gestisce i retry su JSON malformato (i modelli
// 7-8B a volte rompono il JSON). Se Ollama fallisce, il chiamante ricade su OpenAI.

const ollamaTranslationsSchema = z.object({
  translations: z.record(z.string(), z.string()),
});

async function translateWithOllama(
  items: { key: string; italian: string }[],
  lang: Lang,
  glossary: Glossary,
): Promise<Record<string, string>> {
  const { callOllamaChat } = await import("../server/lib/ollama-client");
  const glossaryBlock = buildGlossaryPrompt(glossary, lang);
  const system = `You are a professional translator for BikerLink, a mobile app for motorcyclists.
Translate from Italian to ${LANG_NAMES[lang]}.

Rules:
- Keep the tone casual, friendly, and concise — this is a mobile UI.
- Preserve placeholders verbatim: {nickname}, {count}, {n}, %s, %d, etc.
- Preserve newlines (\\n), tabs, and trailing punctuation exactly.
- Match the original string length as closely as possible (mobile UI constraints).
- Keep proper nouns, brand names, and technical motorcycle terms when appropriate.
- Do NOT translate keys; translate only the Italian string values.
- Output strict JSON: {"translations": {"<key>": "<translated value>", ...}}.${glossaryBlock}`;

  const user = `Translate the following Italian strings to ${LANG_NAMES[lang]}:\n\n${JSON.stringify(
    Object.fromEntries(items.map((i) => [i.key, i.italian])),
    null,
    2,
  )}`;

  const result = await callOllamaChat(`${user}`, ollamaTranslationsSchema, {
    system,
    temperature: 0.2,
    jsonRetries: 2,
  });
  const translations = result.translations;
  const out: Record<string, string> = {};
  for (const item of items) {
    const v = translations[item.key];
    if (typeof v !== "string") {
      throw new Error(`Translation for key "${item.key}" missing in Ollama response`);
    }
    out[item.key] = v;
  }
  return out;
}

/**
 * Orchestratore per-batch: tenta Ollama (se OLLAMA_URL impostato), poi OpenAI
 * come fallback trasparente. Fallback silenzioso (solo warning) se Ollama non
 * risponde o restituisce JSON non valido.
 */
async function translateBatchSmart(
  items: { key: string; italian: string }[],
  lang: Lang,
  glossary: Glossary,
  apiKey: string | undefined,
): Promise<Record<string, string>> {
  if (process.env.OLLAMA_URL) {
    try {
      return await translateWithOllama(items, lang, glossary);
    } catch (err) {
      console.warn(
        `\n[i18n] [${lang}] Ollama non disponibile (${err instanceof Error ? err.message : String(err)}), fallback OpenAI...`,
      );
    }
  }
  if (!apiKey) {
    throw new Error("Ollama non disponibile e OPENAI_API_KEY mancante: impossibile tradurre.");
  }
  return translateBatch(items, lang, glossary, apiKey);
}

interface CliFlags {
  dryRun: boolean;
  langs: Lang[];
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false, langs: [...TARGET_LANGS] };
  let langArg: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") flags.dryRun = true;
    else if (a.startsWith("--lang=")) {
      langArg = a.slice("--lang=".length);
    } else if (a === "--lang") {
      langArg = argv[i + 1];
      i++;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  // npm-config fallback: `npm run i18n:translate:lang -- en,es` or
  // `npm run i18n:translate --lang=en` both surface via npm_config_lang.
  if (!langArg && process.env.npm_config_lang) {
    langArg = process.env.npm_config_lang;
  }
  if (langArg !== undefined) {
    if (!langArg.trim()) {
      throw new Error(`--lang requires a value, e.g. --lang=en,es,fr`);
    }
    const langs = langArg.split(",").map((s) => s.trim()).filter(Boolean) as Lang[];
    for (const l of langs) {
      if (!TARGET_LANGS.includes(l)) {
        throw new Error(`Unknown language: "${l}". Supported: ${TARGET_LANGS.join(", ")}`);
      }
    }
    flags.langs = langs;
  }
  return flags;
}

function printHelp(): void {
  console.log(`BikerLink i18n auto-translate

Usage:
  tsx scripts/translate-i18n.ts [--dry-run] [--lang=en,es,fr,...]

Flags:
  --dry-run         Report what would change without writing files or calling the API.
  --lang=<list>     Comma-separated target langs (default: ${TARGET_LANGS.join(",")}).
  -h, --help        Show this help.

Behaviour:
  - lib/i18n/it.ts is the source of truth.
  - For each target language file, missing keys and keys whose Italian source
    has changed (per-key hash snapshot) are translated. Primary provider is
    self-hosted Ollama (when OLLAMA_URL is set); on failure it falls back
    transparently to OpenAI ${MODEL}.
  - Keys flagged with "${MANUAL_MARKER}" inline comment are NEVER touched.
  - File structure (key order, blank-line section separators) mirrors it.ts.
  - State snapshot: lib/i18n/.translations-state.json
  - Glossary: scripts/i18n-glossary.json

Required env: at least one of OLLAMA_URL (primary) or OPENAI_API_KEY (fallback).
Optional: OLLAMA_TOKEN, OLLAMA_MODEL (default llama3.1:8b).
`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  const apiKey = process.env.OPENAI_API_KEY;
  const ollamaConfigured = Boolean(process.env.OLLAMA_URL);
  if (!apiKey && !ollamaConfigured && !flags.dryRun) {
    console.error("[i18n] FATAL: né OPENAI_API_KEY né OLLAMA_URL sono impostati. Aborting.");
    console.error("[i18n] Hint: re-run with --dry-run to preview changes without an API key.");
    process.exit(1);
  }
  if (ollamaConfigured) {
    console.log(`[i18n] Provider primario: Ollama (${process.env.OLLAMA_MODEL ?? "llama3.1:8b"})${apiKey ? " — fallback OpenAI" : " — nessun fallback OpenAI (OPENAI_API_KEY mancante)"}`);
  }

  const itPath = path.join(I18N_DIR, `${SOURCE_LANG}.ts`);
  if (!fs.existsSync(itPath)) {
    console.error(`[i18n] FATAL: source file not found: ${itPath}`);
    process.exit(1);
  }

  console.log(`[i18n] Source: ${itPath}`);
  console.log(`[i18n] Targets: ${flags.langs.join(", ")}`);
  console.log(`[i18n] Mode: ${flags.dryRun ? "DRY RUN (no API calls, no writes)" : "LIVE"}`);
  console.log();

  const itParsed = parseFile(itPath);
  const itMap = buildKeyMap(itParsed);
  console.log(`[i18n] Italian source: ${itMap.size} keys`);

  const glossary = loadGlossary();
  const glossaryTerms = Object.keys(glossary).length;
  console.log(`[i18n] Glossary: ${glossaryTerms} terms`);
  console.log();

  const state = loadState();
  let totalNew = 0;
  let totalChanged = 0;
  let totalManual = 0;
  let totalApiCalls = 0;

  for (const lang of flags.langs) {
    const targetPath = path.join(I18N_DIR, `${lang}.ts`);
    if (!fs.existsSync(targetPath)) {
      console.error(`[i18n] [${lang}] FATAL: target file not found: ${targetPath}`);
      process.exit(1);
    }
    const targetParsed = parseFile(targetPath);
    const targetMap = buildKeyMap(targetParsed);
    const langState = state[lang] ?? {};

    const toTranslate: { key: string; italian: string }[] = [];
    const finalMap = new Map<string, { value: string; manual: boolean }>();
    let manualCount = 0;

    for (const t of itParsed.tokens) {
      if (t.type !== "kv") continue;
      const existing = targetMap.get(t.key);
      const itHash = hash(t.value);

      if (existing?.manual) {
        manualCount++;
        finalMap.set(t.key, existing);
        continue;
      }

      const lastSeenHash = langState[t.key];
      // First-run grace: if the key already has a translation but we have no
      // recorded hash, trust the existing translation and seed the hash.
      // Only flag as "changed" when we have a recorded hash that disagrees.
      const missing = !existing || existing.value.trim() === "";
      const changed = lastSeenHash !== undefined && lastSeenHash !== itHash;
      const needsTranslate = missing || changed;

      if (!needsTranslate) {
        finalMap.set(t.key, { value: existing!.value, manual: false });
      } else {
        toTranslate.push({ key: t.key, italian: t.value });
        // Placeholder; will be filled after translation.
        finalMap.set(t.key, { value: existing?.value ?? "", manual: false });
      }
    }

    const newKeys = toTranslate.filter((t) => !targetMap.has(t.key)).length;
    const changedKeys = toTranslate.length - newKeys;
    totalNew += newKeys;
    totalChanged += changedKeys;
    totalManual += manualCount;

    console.log(
      `[i18n] [${lang}] keys=${itMap.size}  new=${newKeys}  changed=${changedKeys}  manual=${manualCount}  upToDate=${itMap.size - toTranslate.length - manualCount}`,
    );

    const seedAndPruneState = () => {
      for (const t of itParsed.tokens) {
        if (t.type !== "kv") continue;
        if (langState[t.key] === undefined) {
          langState[t.key] = hash(t.value);
        }
      }
      for (const k of Object.keys(langState)) {
        if (!itMap.has(k)) delete langState[k];
      }
      state[lang] = langState;
    };

    if (toTranslate.length === 0) {
      console.log(`[i18n] [${lang}] nothing to do.`);
      if (!flags.dryRun) seedAndPruneState();
      continue;
    }

    if (flags.dryRun) {
      console.log(`[i18n] [${lang}] DRY RUN — first ${Math.min(5, toTranslate.length)} sample(s):`);
      for (const item of toTranslate.slice(0, 5)) {
        console.log(`         "${item.key}" = "${item.italian.slice(0, 80)}"`);
      }
      continue;
    }

    // Batched translation.
    const totalBatches = Math.ceil(toTranslate.length / BATCH_SIZE);
    for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
      const batch = toTranslate.slice(i, i + BATCH_SIZE);
      const batchIdx = Math.floor(i / BATCH_SIZE) + 1;
      process.stdout.write(
        `[i18n] [${lang}] batch ${batchIdx}/${totalBatches} (${batch.length} keys)... `,
      );
      const result = await translateBatchSmart(batch, lang, glossary, apiKey);
      totalApiCalls++;
      for (const item of batch) {
        finalMap.set(item.key, { value: result[item.key], manual: false });
        langState[item.key] = hash(item.italian);
      }
      console.log("ok");
    }

    seedAndPruneState();

    const out = emitFile(lang, itParsed, finalMap);
    fs.writeFileSync(targetPath, out, "utf8");
    console.log(`[i18n] [${lang}] wrote ${targetPath} (${finalMap.size} keys)`);
  }

  if (!flags.dryRun) {
    saveState(state);
    console.log(`[i18n] state snapshot: ${STATE_FILE}`);
  }

  console.log();
  console.log(
    `[i18n] Summary: new=${totalNew} changed=${totalChanged} manual=${totalManual} apiCalls=${totalApiCalls}${flags.dryRun ? " (dry-run)" : ""}`,
  );
}

main().catch((err) => {
  console.error(`[i18n] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
