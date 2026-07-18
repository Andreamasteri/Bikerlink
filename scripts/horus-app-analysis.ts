// LARGE-FILE-ALLOW: script analisi profonda Horus monolitico (pipeline multi-fase completa, split non praticabile)
/**
 * BikerLink — Analisi profonda codebase con Horus (multi-fase)
 *
 * A differenza di log-analysis-horus.ts (triage reattivo su sintomi), questo script
 * analizza strutturalmente il codebase BikerLink: legge file sorgente completi, esegue
 * 9 scan automatici, confronta dev↔prod, audita route/auth, env vars, migration, test
 * coverage e la catena AI provider — senza indovinare.
 *
 * Flusso multi-fase:
 *   Phase 1 (Pivot)     → Horus decide le 3-5 aree più urgenti da un bundle compatto
 *   Phase 2 (Deep Dive) → Un bundle dedicato per area con file sorgente completi
 *   Phase 3 (Sintesi)   → Report finale con le 6 sezioni obbligatorie + task table
 *
 * Uso:
 *   npx tsx scripts/horus-app-analysis.ts
 *   npx tsx scripts/horus-app-analysis.ts --area auth
 *   npx tsx scripts/horus-app-analysis.ts --dry-run
 *   npx tsx scripts/horus-app-analysis.ts --single-phase
 *   npx tsx scripts/horus-app-analysis.ts --no-propose
 *   HORUS_LOG_DIR=/tmp npx tsx scripts/horus-app-analysis.ts
 *
 * Secret/env:
 *   HORUS_OLLAMA_URL    — URL base Horus (obbligatorio)
 *   HORUS_OLLAMA_MODEL  — modello (default "qwen3:4b")
 *   HORUS_OLLAMA_TOKEN  — Bearer token opzionale
 *   HORUS_LOG_DIR       — directory output (default logs/)
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { cfAccessHeaders } from "../server/lib/cf-access";
import { AGENT_MODEL_DEFAULTS } from "../server/lib/agent-constants";
import { stripThinkBlock } from "../server/lib/ollama-think-strip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Costanti ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = AGENT_MODEL_DEFAULTS.horus;
const REQUEST_TIMEOUT_MS = 300_000;
const DEFAULT_TAIL_LINES = 500;

// Task #585 — HORUS_THINK=0 disabilita il ragionamento (default: think:true).
// Stessa logica di horus-patch-scan.core.ts (Task #574).
// Override CLI: impostare HORUS_THINK=0 prima di lanciare lo script per usare
// think:false (veloce, nessun reasoning). num_predict ridotto a 600 se think:false.
const HORUS_THINK_ENABLED = process.env.HORUS_THINK !== "0";

const KNOWN_AREAS = ["auth", "routing", "ai", "telemetry", "storage", "boot", "scheduler"] as const;
type Area = (typeof KNOWN_AREAS)[number];

// ─── CLI args ─────────────────────────────────────────────────────────────────

const IS_DRY_RUN = process.argv.includes("--dry-run");
const ONLY_DB = process.argv.includes("--only-db");
const ONLY_CODE = process.argv.includes("--only-code");
const NO_PROPOSE = process.argv.includes("--no-propose");
const SINGLE_PHASE = process.argv.includes("--single-phase");

function parseTailArg(): number {
  const i = process.argv.indexOf("--tail");
  if (i !== -1 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TAIL_LINES;
}

function parseAreaArg(): Area | null {
  const i = process.argv.indexOf("--area");
  if (i !== -1 && process.argv[i + 1]) {
    const a = process.argv[i + 1] as Area;
    if (KNOWN_AREAS.includes(a)) return a;
    console.warn(`⚠️  Area non riconosciuta: "${a}". Valori validi: ${KNOWN_AREAS.join(", ")}`);
  }
  return null;
}

const tail = parseTailArg();
const forcedArea = parseAreaArg();

// ─── Helpers generali ─────────────────────────────────────────────────────────

function fmtSection(title: string, body: string): string {
  return `\n===== ${title} =====\n${body}\n`;
}

function readFileFull(relOrAbs: string): string {
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  try {
    if (!fs.existsSync(abs)) return `[FILE NON TROVATO: ${relOrAbs}]`;
    const content = fs.readFileSync(abs, "utf8");
    const lines = content.split("\n");
    if (lines.length <= 600) return content;
    // Oltre 600 righe: prime 300 + ultime 100
    return (
      lines.slice(0, 300).join("\n") +
      `\n\n[... ${lines.length - 400} righe omesse per brevità ...]\n\n` +
      lines.slice(-100).join("\n")
    );
  } catch (err) {
    return `[ERRORE LETTURA: ${(err as Error).message}]`;
  }
}

function runRg(args: string[]): string {
  try {
    const result = spawnSync("rg", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
    if (result.error) return `[RG ERRORE: ${result.error.message}]`;
    const out = (result.stdout || "").trim();
    return out || "(nessun risultato)";
  } catch (err) {
    return `[RG FALLITO: ${(err as Error).message}]`;
  }
}

function runShell(cmd: string): string {
  try {
    const result = spawnSync("bash", ["-c", cmd], { cwd: ROOT, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
    if (result.error) return `[SHELL ERRORE: ${result.error.message}]`;
    const out = (result.stdout || "").trim();
    return out || "(nessun risultato)";
  } catch (err) {
    return `[SHELL FALLITO: ${(err as Error).message}]`;
  }
}

function rowsToText(rows: unknown[]): string {
  if (!rows || rows.length === 0) return "(nessuna riga)";
  return rows.map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`).join("\n");
}

// ─── Helper: normalizza sezione task (lista → tabella) ────────────────────────

function normalizeTaskSection(report: string): string {
  const TASK_HEADER = "## TASK PROPOSTI DA HORUS";
  const idx = report.indexOf(TASK_HEADER);
  if (idx === -1) return report;

  const before = report.slice(0, idx + TASK_HEADER.length);
  const after = report.slice(idx + TASK_HEADER.length);

  // Se c'è già una tabella (almeno una riga con pipe), lascia invariato
  if (/^\s*\|/m.test(after.split(/\n##/)[0])) return report;

  const sectionBody = after.split(/\n##/)[0];
  const restAfterSection = after.slice(sectionBody.length);

  const listItemRe = /^(?:\d+\.|[-*])\s+(.+)$/;
  const rows: string[] = [];
  for (const line of sectionBody.split("\n")) {
    const m = listItemRe.exec(line.trim());
    if (m) {
      const titolo = m[1].slice(0, 80).replace(/\|/g, "—");
      rows.push(`| ${titolo} | media | generale | vedi analisi | ${titolo} |`);
    }
  }

  if (rows.length === 0) return report;

  const table =
    "\n| Titolo | Priorità | Area | Problema | Azione |\n" +
    "|--------|----------|------|---------|--------|\n" +
    rows.join("\n") +
    "\n";

  return before + table + (restAfterSection ? restAfterSection : "");
}

// ─── callHorus ────────────────────────────────────────────────────────────────

async function callHorus(
  baseUrl: string,
  model: string,
  token: string | undefined,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  Object.assign(headers, cfAccessHeaders());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        // Task #585 — think controllato da HORUS_THINK_ENABLED (env HORUS_THINK=0 → false).
        // Default: true. num_predict ridotto a 600 se think:false (nessun reasoning).
        // Il blocco <think>…</think> viene strippato da stripThinkBlock() più sotto.
        options: { temperature: 0.2, think: HORUS_THINK_ENABLED, num_predict: HORUS_THINK_ENABLED ? 800 : 600 },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 500)}` : ""}`);
    }

    interface OllamaResponse {
      message?: { role: string; content: string };
      error?: string;
    }

    const data = (await res.json()) as OllamaResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    const raw = data.message?.content?.trim();
    if (!raw) throw new Error("Risposta vuota dal modello.");
    return normalizeTaskSection(stripThinkBlock(raw));
  } finally {
    clearTimeout(timer);
  }
}

// ─── fetchExistingTaskTitles ──────────────────────────────────────────────────

async function fetchExistingTaskTitles(): Promise<string[]> {
  try {
    const rows = await db.execute(sql`
      SELECT title FROM project_tasks
      WHERE state NOT IN ('CANCELLED', 'MERGED')
      ORDER BY created_at DESC
    `);
    return (rows.rows as Array<{ title: string }>).map((r) => r.title ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCAN AUTOMATICI (9 scan, eseguiti prima di qualsiasi chiamata Horus)
// ═══════════════════════════════════════════════════════════════════════════════

function scan1RouteAuth(): string {
  try {
    const raw = runRg([
      "-n",
      "--no-heading",
      "router\\.(get|post|put|delete|patch|use)\\(",
      "server/routes",
      "--include=*.ts",
    ]);
    if (raw.startsWith("[")) return raw;

    const AUTH_PATTERNS = /requireAuth|_requireAdmin|requireConsoleRole|X-Agent-Token|X-Hub-Gate-Token|X-Whisper-Token/;
    const PUBLIC_ALLOWLIST = ["/client-error", "/startup-beacon", "/health", "/api-version", "/ping"];
    const PUBLIC_COMMENT = /\/\/\s*(public|intenzionale)/i;

    const lines = raw.split("\n").filter(Boolean);
    const rows: string[] = [];

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):.*(router\.(get|post|put|delete|patch|use)\(['"`]([^'"`]+))/);
      if (!match) continue;
      const [, file, lineNo, , method, routePath] = match;
      const shortFile = file.replace(/^server\/routes\//, "");

      // Leggi alcune righe di contesto per cercare guard
      const fileAbs = path.join(ROOT, file);
      let status = "SOSPETTA";
      try {
        const content = fs.readFileSync(fileAbs, "utf8");
        const lineIdx = parseInt(lineNo, 10) - 1;
        const contextLines = content.split("\n").slice(Math.max(0, lineIdx - 5), lineIdx + 10).join("\n");
        if (AUTH_PATTERNS.test(contextLines)) {
          status = "PROTETTA";
        } else if (PUBLIC_ALLOWLIST.some((p) => routePath.includes(p)) || PUBLIC_COMMENT.test(contextLines)) {
          status = "PUBBLICA_INTENZIONALE";
        }
      } catch {
        // fallback: resta SOSPETTA
      }

      rows.push(`| ${shortFile} | ${method?.toUpperCase() ?? "?"} | ${routePath} | ${status} |`);
    }

    const header = "| File | Metodo | Path | Stato |\n|------|--------|------|-------|\n";
    return header + (rows.length > 0 ? rows.join("\n") : "(nessuna route trovata)");
  } catch (err) {
    return `[SCAN 1 FALLITO: ${(err as Error).message}]`;
  }
}

function scan2EnvVars(): string {
  try {
    const raw = runRg([
      "--only-matching",
      "--no-filename",
      "--no-heading",
      "process\\.env\\.(\\w+)",
      "server/",
      "scripts/",
      "--include=*.ts",
      "-r",
      "$1",
    ]);
    if (raw.startsWith("[")) return raw;

    const vars = [...new Set(raw.split("\n").filter(Boolean))].sort();
    const rows = vars.map((v) => {
      let tipo = "DOCUMENTATO";
      // Cerca uso con ! (non-null assertion) o senza fallback
      const usageRaw = runRg([
        "-n",
        "--no-heading",
        "--max-count=1",
        `process\\.env\\.${v}!`,
        "server/",
        "scripts/",
        "--include=*.ts",
      ]);
      if (!usageRaw.startsWith("[") && usageRaw !== "(nessun risultato)") {
        tipo = "CON_OPERATORE_!";
      }
      return `| ${v} | server/ o scripts/ | ${tipo} | - |`;
    });

    const header = "| Variabile | File | Tipo | Rischio |\n|-----------|------|------|----------|\n";
    return header + (rows.length > 0 ? rows.join("\n") : "(nessuna variabile trovata)");
  } catch (err) {
    return `[SCAN 2 FALLITO: ${(err as Error).message}]`;
  }
}

function scan3MigrationRisk(): string {
  try {
    const listResult = runShell("ls -t migrations/*.sql 2>/dev/null | head -20");
    if (!listResult || listResult.startsWith("[")) return "[SCAN 3: nessuna migration trovata]";

    const files = listResult.split("\n").filter(Boolean);
    const rows: string[] = [];

    for (const f of files) {
      const abs = path.join(ROOT, f);
      try {
        const content = fs.readFileSync(abs, "utf8");
        const issues: string[] = [];
        if (/DROP TABLE(?!\s+IF EXISTS)/i.test(content)) issues.push("DROP TABLE senza IF EXISTS");
        if (/ALTER TABLE\s+(users|ride_telemetry|app_crash_logs|ai_call_logs)/i.test(content))
          issues.push("ALTER su tabella critica");
        if (/UPDATE\s+\w+\s+SET(?!.*WHERE)/is.test(content)) issues.push("UPDATE senza WHERE");
        if (/CREATE INDEX(?!\s+IF NOT EXISTS)/i.test(content)) issues.push("CREATE INDEX senza IF NOT EXISTS");

        const shortF = path.basename(f);
        if (issues.length > 0) {
          rows.push(`| ${shortF} | ${issues.join("; ")} | ATTENZIONE |`);
        }
      } catch {
        // skip
      }
    }

    // Controlla prefix duplicati
    const prefixes = files.map((f) => path.basename(f).split("_")[0]);
    const dupPrefixes = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
    if (dupPrefixes.length > 0) {
      rows.push(`| (multipli) | Prefix duplicati: ${[...new Set(dupPrefixes)].join(", ")} | CRITICO |`);
    }

    const header = "| File | Pattern | Rischio |\n|------|---------|----------|\n";
    return header + (rows.length > 0 ? rows.join("\n") : "(nessun pattern di rischio trovato nelle ultime 20 migration)");
  } catch (err) {
    return `[SCAN 3 FALLITO: ${(err as Error).message}]`;
  }
}

function scan4TestCoverage(): string {
  try {
    const areas = ["server/ai", "server/routes", "server/boot-*.ts"];
    const sourceFiles: string[] = [];

    for (const pattern of areas) {
      const result = runShell(`find ${ROOT}/${pattern.replace("*.ts", "")} -name "*.ts" 2>/dev/null | grep -v test | grep -v ".part" | grep -v "__tests__" | head -30`);
      if (!result.startsWith("[")) {
        sourceFiles.push(...result.split("\n").filter(Boolean));
      }
    }

    // boot files
    const bootFiles = runShell(`ls ${ROOT}/server/boot-*.ts 2>/dev/null`);
    if (!bootFiles.startsWith("[")) sourceFiles.push(...bootFiles.split("\n").filter(Boolean));

    const testDir = path.join(ROOT, "server/__tests__");
    const rows: string[] = [];

    for (const sf of [...new Set(sourceFiles)]) {
      const base = path.basename(sf, ".ts");
      let status = "SCOPERTO";
      if (fs.existsSync(testDir)) {
        const testFile = runShell(`find ${testDir} -name "${base}.test.ts" -o -name "${base}.spec.ts" 2>/dev/null | head -1`);
        if (!testFile.startsWith("[") && testFile.trim()) {
          status = "COPERTO";
        }
      }
      if (status === "SCOPERTO") {
        const rel = sf.replace(ROOT + "/", "");
        const criticita = rel.includes("server/ai/") || rel.includes("server/boot") ? "ALTA" : "MEDIA";
        rows.push(`| ${rel} | ${status} | ${criticita} |`);
      }
    }

    const header = "| File | Copertura | Criticità |\n|------|-----------|------------|\n";
    return header + (rows.length > 0 ? rows.slice(0, 40).join("\n") : "(tutti i file hanno test corrispondenti)");
  } catch (err) {
    return `[SCAN 4 FALLITO: ${(err as Error).message}]`;
  }
}

function scan5SchedulerFragility(): string {
  try {
    const schedulerFile = readFileFull("server/boot-phase5-schedulers.ts");
    const watchdogFiles = runShell(`ls ${ROOT}/server/ai/watchdog/*.ts 2>/dev/null`);
    const rows: string[] = [];

    // Cerca setInterval/arm( senza try/catch nelle vicinanze
    const allContent = schedulerFile + "\n" + (watchdogFiles.startsWith("[") ? "" : (() => {
      return watchdogFiles.split("\n").filter(Boolean).map((f) => {
        try { return fs.readFileSync(f, "utf8"); } catch { return ""; }
      }).join("\n");
    })());

    const intervalRe = /(?:setInterval|arm)\s*\(([^,]+),\s*[\d_]+/g;
    let m: RegExpExecArray | null;
    while ((m = intervalRe.exec(allContent)) !== null) {
      const cb = m[1].trim();
      const ctx = allContent.slice(Math.max(0, m.index - 200), m.index + 500);
      const missing: string[] = [];
      if (!/try\s*\{/.test(ctx)) missing.push("try/catch");
      if (!/withBgDbSlot|withDbRetry/.test(ctx)) missing.push("withBgDbSlot/withDbRetry");
      if (missing.length > 0) {
        rows.push(`| ${cb.slice(0, 40)} | - | ${missing.join(", ")} | MEDIO |`);
      }
    }

    const header = "| Job | Intervallo | Missing Guard | Rischio |\n|-----|-----------|--------------|----------|\n";
    return header + (rows.length > 0 ? rows.slice(0, 20).join("\n") : "(tutti i job schedulati sembrano avere guard)");
  } catch (err) {
    return `[SCAN 5 FALLITO: ${(err as Error).message}]`;
  }
}

function scan6AiProviderTimeout(): string {
  try {
    const files = runRg([
      "--include=*.ts",
      "-l",
      "generateObject|generateText|streamText|callHorus|callOllama",
      "server/",
    ]);
    if (files.startsWith("[")) return files;

    const fileList = files.split("\n").filter(Boolean);
    const rows: string[] = [];

    for (const f of fileList) {
      const abs = path.join(ROOT, f);
      try {
        const content = fs.readFileSync(abs, "utf8");
        const hasTimeout = /abortSignal|maxRetries|timeout\s*:|REQUEST_TIMEOUT/.test(content);
        if (!hasTimeout) {
          const shortF = f.replace("server/", "");
          rows.push(`| ${shortF} | generateObject/Text/stream | MANCANTE | MEDIO |`);
        }
      } catch {
        // skip
      }
    }

    const header = "| File | Funzione | Timeout | Rischio |\n|------|----------|---------|----------|\n";
    return header + (rows.length > 0 ? rows.join("\n") : "(tutti i file AI hanno timeout/abortSignal)");
  } catch (err) {
    return `[SCAN 6 FALLITO: ${(err as Error).message}]`;
  }
}

function scan7SchemaVsRoutes(): string {
  try {
    const rawTablesUsed = runRg([
      "--only-matching",
      "--no-heading",
      "--no-filename",
      "(?:FROM|INTO|UPDATE)\\s+(\\w+)",
      "server/routes/",
      "--include=*.ts",
      "-r",
      "$1",
    ]);

    const rawTablesSchema = runRg([
      "--only-matching",
      "--no-heading",
      "--no-filename",
      "pgTable\\(['\"]([^'\"]+)['\"]",
      "shared/db/",
      "server/db/",
      "--include=*.ts",
      "-r",
      "$1",
    ]);

    const usedTables = new Set(
      rawTablesUsed.startsWith("[") ? [] : rawTablesUsed.split("\n").map((t) => t.trim().toLowerCase()).filter(Boolean),
    );
    const schemaTables = new Set(
      rawTablesSchema.startsWith("[") ? [] : rawTablesSchema.split("\n").map((t) => t.trim().toLowerCase()).filter(Boolean),
    );

    const KNOWN_NON_SCHEMA = new Set(["spatial_ref_sys", "pg_stat", "information_schema"]);
    const rows: string[] = [];

    for (const t of usedTables) {
      if (KNOWN_NON_SCHEMA.has(t)) continue;
      if (!schemaTables.has(t)) {
        rows.push(`| ${t} | server/routes/ | NON TROVATA nello schema Drizzle | VERIFICA |`);
      }
    }

    const header = "| Tabella | Usata in | Definita in schema | Rischio |\n|---------|---------|---------------------|----------|\n";
    return header + (rows.length > 0 ? rows.join("\n") : "(tutte le tabelle usate nelle route sembrano definite nello schema)");
  } catch (err) {
    return `[SCAN 7 FALLITO: ${(err as Error).message}]`;
  }
}

function scan8SilentCatch(): string {
  try {
    const emptyCatch = runRg([
      "-n",
      "--no-heading",
      "--include=*.ts",
      "catch\\s*\\(\\w+\\)\\s*\\{\\s*\\}",
      "server/",
      "shared/",
    ]);
    const unhandledThen = runShell(
      `rg '\\.then\\(' server/ --include='*.ts' -l | xargs rg -L '\\.catch\\(' 2>/dev/null | head -20`,
    );
    const unsafeJsonParse = runRg(["-n", "--no-heading", "--include=*.ts", "JSON\\.parse\\(", "server/", "-m", "30"]);

    return (
      "### Catch vuoti:\n" +
      (emptyCatch.startsWith("[") ? emptyCatch : emptyCatch || "(nessuno)") +
      "\n\n### File .then() senza .catch():\n" +
      (unhandledThen.startsWith("[") ? unhandledThen : unhandledThen || "(nessuno)") +
      "\n\n### JSON.parse() senza try/catch (prime 30):\n" +
      (unsafeJsonParse.startsWith("[") ? unsafeJsonParse : unsafeJsonParse || "(nessuno)")
    );
  } catch (err) {
    return `[SCAN 8 FALLITO: ${(err as Error).message}]`;
  }
}

function scan9HardcodedValues(): string {
  try {
    const localhost = runRg([
      "-n",
      "--no-heading",
      "--include=*.ts",
      "(localhost|127\\.0\\.0\\.1|http://)",
      "server/",
      "--glob=!*.test.ts",
      "-m",
      "30",
    ]);
    const bigTimeouts = runRg([
      "-n",
      "--no-heading",
      "--include=*.ts",
      "setTimeout\\(.*[0-9]{5,}",
      "server/",
      "-m",
      "20",
    ]);
    const passwords = runRg([
      "-n",
      "--no-heading",
      "--include=*.ts",
      "'secret'|\"secret\"|'password'|\"password\"",
      "server/",
      "--glob=!*.test.ts",
      "-m",
      "20",
    ]);

    return (
      "### localhost/127.0.0.1/http:// hardcoded:\n" +
      (localhost.startsWith("[") ? localhost : localhost || "(nessuno)") +
      "\n\n### setTimeout con valore ≥10s hardcoded:\n" +
      (bigTimeouts.startsWith("[") ? bigTimeouts : bigTimeouts || "(nessuno)") +
      "\n\n### 'secret'/'password' literal in codice non-test:\n" +
      (passwords.startsWith("[") ? passwords : passwords || "(nessuno)")
    );
  } catch (err) {
    return `[SCAN 9 FALLITO: ${(err as Error).message}]`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB QUERIES — dev
// ═══════════════════════════════════════════════════════════════════════════════

async function dbQuery(query: ReturnType<typeof sql>): Promise<{ rows: unknown[] }> {
  try {
    return await db.execute(query);
  } catch {
    return { rows: [] };
  }
}

async function collectDbDev(tailLines: number): Promise<string> {
  const sections: string[] = [];

  try {
    const aiDist = await dbQuery(sql`
      SELECT provider, model, degraded, COUNT(*) as cnt,
             ROUND(AVG(latency_ms)::numeric,0) as avg_ms,
             MAX(latency_ms) as max_ms,
             COUNT(*) FILTER (WHERE latency_ms > 10000) as slow_cnt
      FROM ai_call_logs
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY provider, model, degraded ORDER BY cnt DESC
    `);
    sections.push(fmtSection("AI CALL LOGS — distribuzione 7gg", rowsToText(aiDist.rows)));

    const aiRecent = await dbQuery(sql`
      SELECT provider, model, latency_ms, degraded, created_at
      FROM ai_call_logs ORDER BY created_at DESC LIMIT ${tailLines}
    `);
    sections.push(fmtSection(`AI CALL LOGS — ultimi ${tailLines}`, rowsToText(aiRecent.rows)));

    const watchdog = await dbQuery(sql`
      SELECT kind, scope, status, LEFT(summary,300) as summary, created_at
      FROM ai_watchdog_log
      WHERE created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC LIMIT 100
    `);
    sections.push(fmtSection("AI WATCHDOG LOG — ultimi 100 (7gg)", rowsToText(watchdog.rows)));

    const settings = await dbQuery(sql`
      SELECT key, value, LEFT(value_json::text,200) as value_json, updated_at
      FROM app_settings ORDER BY key
    `);
    sections.push(fmtSection("APP SETTINGS — tutte le chiavi", rowsToText(settings.rows)));

    const usersAnomaly = await dbQuery(sql`
      SELECT id, hidden, last_lat IS NULL as no_coords, banned, created_at, updated_at
      FROM users
      WHERE (hidden = false AND last_lat IS NULL) OR banned = true
      LIMIT 50
    `);
    sections.push(fmtSection("USERS — anomalie (hidden=false+no_coords, banned)", rowsToText(usersAnomaly.rows)));

    const crashTrend = await dbQuery(sql`
      SELECT crash_type, platform,
             COUNT(*) FILTER (WHERE reported_at > NOW()-INTERVAL '7 days') as cnt_7d,
             COUNT(*) FILTER (WHERE reported_at > NOW()-INTERVAL '30 days') as cnt_30d
      FROM app_crash_logs GROUP BY crash_type, platform ORDER BY cnt_7d DESC LIMIT 30
    `);
    sections.push(fmtSection("CRASH LOGS — trend 7gg vs 30gg", rowsToText(crashTrend.rows)));

    const signals = await dbQuery(sql`
      SELECT source, metric, severity, value, unit, created_at
      FROM system_signals WHERE severity IN ('high','critical')
        AND created_at > NOW() - INTERVAL '3 days'
      ORDER BY created_at DESC
    `);
    sections.push(fmtSection("SYSTEM SIGNALS — high/critical 3gg", rowsToText(signals.rows)));

    const telemetryAnomaly = await dbQuery(sql`
      SELECT session_id, total_distance_km, duration_seconds, created_at
      FROM telemetry_session_stats
      WHERE (total_distance_km = 0 AND duration_seconds > 60) OR total_distance_km < 0
      ORDER BY created_at DESC LIMIT 20
    `);
    sections.push(fmtSection("TELEMETRY — anomalie (dist=0 con dur>60s, dist<0)", rowsToText(telemetryAnomaly.rows)));

    const unusedIndexes = await dbQuery(sql`
      SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0 AND indexrelname NOT LIKE 'pg_%'
      ORDER BY idx_tup_read ASC LIMIT 30
    `);
    sections.push(fmtSection("INDICI — mai usati (candidate da rimuovere)", rowsToText(unusedIndexes.rows)));

    const fkOrphans = await dbQuery(sql`
      SELECT conrelid::regclass AS "table", conname, confrelid::regclass AS ref_table
      FROM pg_constraint WHERE contype = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = confrelid)
      LIMIT 20
    `);
    sections.push(fmtSection("FK ORFANE", rowsToText(fkOrphans.rows)));

    const pool = await dbQuery(sql`
      SELECT application_name, state, COUNT(*) as cnt,
             MAX(EXTRACT(EPOCH FROM (NOW() - state_change))) as max_age_s
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY application_name, state ORDER BY cnt DESC
    `);
    sections.push(fmtSection("POOL — connessioni per application_name", rowsToText(pool.rows)));

    const bloat = await dbQuery(sql`
      SELECT relname, n_dead_tup, n_live_tup,
             ROUND(n_dead_tup::numeric / NULLIF(n_live_tup,0) * 100, 1) as dead_pct
      FROM pg_stat_user_tables
      WHERE n_dead_tup > 1000
      ORDER BY dead_pct DESC LIMIT 20
    `);
    sections.push(fmtSection("TABELLE — bloat stimato (vacuum candidati)", rowsToText(bloat.rows)));

    const migrations = await dbQuery(sql`
      SELECT filename, executed_at FROM migration_log
      ORDER BY executed_at DESC LIMIT 10
    `).catch(() => ({ rows: [] }));
    sections.push(fmtSection(
      "MIGRATION LOG — ultime 10",
      migrations.rows.length > 0 ? rowsToText(migrations.rows) : "(tabella migration_log non disponibile)",
    ));
  } catch (err) {
    sections.push(`[DB DEV QUERY GENERALE FALLITA: ${(err as Error).message}]`);
  }

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB QUERIES — produzione
// ═══════════════════════════════════════════════════════════════════════════════

async function collectDbProd(): Promise<string> {
  // executeSql è disponibile solo in CodeExecution Replit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const executeSqlFn = (globalThis as Record<string, any>)["executeSql"];
  if (typeof executeSqlFn === "undefined") {
    return "[DB PRODUZIONE: executeSql non disponibile — eseguire dalla CodeExecution Replit per i dati prod]";
  }

  const sections: string[] = [];
  const run = async (q: string, label: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (executeSqlFn as any)({ sqlQuery: q, environment: "production" });
      sections.push(fmtSection(`PROD — ${label}`, result.output || "(nessun output)"));
    } catch (err) {
      sections.push(fmtSection(`PROD — ${label}`, `[ERRORE: ${(err as Error).message}]`));
    }
  };

  await run(
    `SELECT provider, model, degraded, COUNT(*) as cnt,
            ROUND(AVG(latency_ms)::numeric,0) as avg_ms
     FROM ai_call_logs
     WHERE created_at > NOW() - INTERVAL '7 days'
     GROUP BY provider, model, degraded ORDER BY cnt DESC`,
    "AI call logs 7gg",
  );

  await run(
    `SELECT key, value, LEFT(value_json::text,100) as value_json FROM app_settings ORDER BY key`,
    "App settings",
  );

  await run(
    `SELECT crash_type, platform,
            COUNT(*) FILTER (WHERE reported_at > NOW()-INTERVAL '7 days') as cnt_7d,
            COUNT(*) FILTER (WHERE reported_at > NOW()-INTERVAL '30 days') as cnt_30d
     FROM app_crash_logs GROUP BY crash_type, platform ORDER BY cnt_7d DESC LIMIT 20`,
    "Crash trend",
  );

  await run(
    `SELECT source, metric, severity, value, unit, created_at
     FROM system_signals WHERE severity IN ('high','critical')
       AND created_at > NOW() - INTERVAL '3 days'
     ORDER BY created_at DESC`,
    "System signals high/critical",
  );

  await run(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
    "Tabelle in prod",
  );

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODE SCAN PER AREA
// ═══════════════════════════════════════════════════════════════════════════════

const AREA_FILES: Record<Area, string[]> = {
  auth: ["server/routes/auth.ts", "server/middleware/"],
  routing: [
    "server/graphhopper-client.ts",
    "server/ai/route-provider-config.ts",
    "server/ai/route-provider-stats.ts",
  ],
  ai: [
    "server/ai/moderation/provider.ts",
    "server/ai/fallback-switch.ts",
    "server/ai/coordinator/",
    "server/ai/watchdog/scheduler.ts",
  ],
  telemetry: ["shared/tracking-fusion.ts", "shared/tracking-fusion.part2.ts"],
  storage: ["server/storage/"],
  boot: [
    "server/boot-sequence.ts",
    "server/boot-phase3-db-init.ts",
    "server/boot-phase5-schedulers.ts",
  ],
  scheduler: ["server/boot-phase5-schedulers.ts", "server/ai/watchdog/"],
};

const AREA_SCANS: Record<Area, number[]> = {
  auth: [1, 2],
  routing: [3, 7],
  ai: [6, 8],
  telemetry: [7, 8],
  storage: [8, 9],
  boot: [5, 8],
  scheduler: [5, 8],
};

function readAreaFiles(area: Area): string {
  const patterns = AREA_FILES[area];
  const sections: string[] = [];

  for (const pattern of patterns) {
    const abs = path.join(ROOT, pattern);
    if (pattern.endsWith("/")) {
      // È una directory: leggi tutti i .ts
      try {
        if (!fs.existsSync(abs)) {
          sections.push(fmtSection(`DIR: ${pattern}`, "[DIRECTORY NON TROVATA]"));
          continue;
        }
        const files = fs.readdirSync(abs).filter((f) => f.endsWith(".ts") && !f.includes(".part"));
        for (const f of files) {
          sections.push(fmtSection(`FILE: ${pattern}${f}`, readFileFull(path.join(abs, f))));
        }
      } catch (err) {
        sections.push(fmtSection(`DIR: ${pattern}`, `[ERRORE: ${(err as Error).message}]`));
      }
    } else {
      sections.push(fmtSection(`FILE: ${pattern}`, readFileFull(pattern)));
    }
  }

  // Per area telemetria: cerca file tracking in routes
  if (area === "telemetry") {
    const trackingRoutes = runRg(["-l", "--include=*.ts", "ride_telemetry|tracking", "server/routes/"]);
    if (!trackingRoutes.startsWith("[")) {
      for (const f of trackingRoutes.split("\n").filter(Boolean).slice(0, 3)) {
        sections.push(fmtSection(`FILE: ${f}`, readFileFull(f)));
      }
    }
  }

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

interface ScanResults {
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  s6: string;
  s7: string;
  s8: string;
  s9: string;
}

function buildPhase1Bundle(dbDev: string, scans: ScanResults): string {
  // Bundle compatto per Phase 1 (pivot): Horus decide le aree più urgenti
  const aiLogsSection = dbDev.split("=====")[0] || dbDev.slice(0, 3000);

  return [
    "# DATI SOMMARI PER PIVOT — BikerLink App Analysis",
    "",
    fmtSection("AI CALL LOGS (sommario)", aiLogsSection.slice(0, 2000)),
    fmtSection("SCAN 1 — Route Auth Audit (sospette)", scans.s1.slice(0, 2000)),
    fmtSection("SCAN 6 — AI Provider Timeout mancanti", scans.s6.slice(0, 1000)),
    fmtSection("SCAN 3 — Migration Risk", scans.s3.slice(0, 1000)),
    fmtSection("SCAN 5 — Scheduler senza guard", scans.s5.slice(0, 1000)),
  ].join("\n");
}

function buildAreaBundle(area: Area, dbDev: string, scans: ScanResults): string {
  const scanNums = AREA_SCANS[area];
  const scanMap: Record<number, string> = {
    1: scans.s1,
    2: scans.s2,
    3: scans.s3,
    4: scans.s4,
    5: scans.s5,
    6: scans.s6,
    7: scans.s7,
    8: scans.s8,
    9: scans.s9,
  };

  const parts: string[] = [
    `# BUNDLE AREA ${area.toUpperCase()} — BikerLink App Analysis`,
    "",
    readAreaFiles(area),
    "",
  ];

  for (const n of scanNums) {
    parts.push(fmtSection(`SCAN ${n}`, scanMap[n] || "(scan non disponibile)"));
  }

  // Aggiungi subset DB rilevante per l'area
  if (area === "ai") {
    const aiSection = dbDev.split("=====").find((s) => s.includes("AI CALL")) || "";
    parts.push(fmtSection("DB — AI call logs (area)", aiSection.slice(0, 3000)));
  }
  if (area === "scheduler") {
    const signalsSection = dbDev.split("=====").find((s) => s.includes("SYSTEM SIGNALS")) || "";
    parts.push(fmtSection("DB — System signals (area)", signalsSection.slice(0, 2000)));
  }

  return parts.join("\n");
}

function buildSinglePhaseBundle(dbDev: string, dbProd: string, scans: ScanResults, areas: Area[]): string {
  const parts: string[] = [
    "# BUNDLE ANALISI COMPLETA — BikerLink App Analysis",
    "",
    fmtSection("DB DEV", dbDev.slice(0, 8000)),
    fmtSection("DB PROD", dbProd.slice(0, 4000)),
    fmtSection("SCAN 1 — Route Auth Audit", scans.s1.slice(0, 2000)),
    fmtSection("SCAN 2 — Env Var Audit", scans.s2.slice(0, 2000)),
    fmtSection("SCAN 3 — Migration Risk", scans.s3),
    fmtSection("SCAN 4 — Test Coverage Gap", scans.s4.slice(0, 2000)),
    fmtSection("SCAN 5 — Scheduler Fragility", scans.s5),
    fmtSection("SCAN 6 — AI Provider Timeout", scans.s6),
    fmtSection("SCAN 7 — Schema vs Routes", scans.s7),
    fmtSection("SCAN 8 — Catch Silenzioso", scans.s8.slice(0, 2000)),
    fmtSection("SCAN 9 — Hardcoded Values", scans.s9.slice(0, 2000)),
  ];

  for (const area of areas) {
    parts.push(fmtSection(`CODICE AREA ${area.toUpperCase()}`, readAreaFiles(area).slice(0, 4000)));
  }

  return parts.join("\n");
}

function buildPhase3Bundle(dbDev: string, dbProd: string, scans: ScanResults, areaReports: Record<string, string>): string {
  const parts: string[] = [
    "# BUNDLE SINTESI TRASVERSALE — BikerLink App Analysis",
    "",
  ];

  // Report di area da Phase 2
  for (const [area, report] of Object.entries(areaReports)) {
    parts.push(fmtSection(`REPORT AREA ${area.toUpperCase()} (da Phase 2)`, report.slice(0, 5000)));
  }

  // Tutti i 9 scan
  parts.push(
    fmtSection("SCAN 1 — Route Auth Audit", scans.s1),
    fmtSection("SCAN 2 — Env Var Audit", scans.s2.slice(0, 2000)),
    fmtSection("SCAN 3 — Migration Risk", scans.s3),
    fmtSection("SCAN 4 — Test Coverage Gap", scans.s4.slice(0, 2000)),
    fmtSection("SCAN 5 — Scheduler Fragility", scans.s5),
    fmtSection("SCAN 6 — AI Provider Timeout", scans.s6),
    fmtSection("SCAN 7 — Schema vs Routes", scans.s7),
    fmtSection("SCAN 8 — Catch Silenzioso", scans.s8.slice(0, 2000)),
    fmtSection("SCAN 9 — Hardcoded Values", scans.s9.slice(0, 2000)),
    fmtSection("DB DEV — completo", dbDev.slice(0, 6000)),
    fmtSection("DB PROD", dbProd.slice(0, 3000)),
  );

  return parts.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT_PIVOT = `
Sei Horus, analizzatore tecnico di BikerLink. Hai ricevuto un bundle sommario con dati AI, crash, segnali e scan automatici.

Il tuo compito è identificare le 3-5 AREE DI CODICE che richiedono l'analisi più urgente.

Per ciascuna area, spiega in 2 righe perché è prioritaria (cosa hai visto nei dati che ti preoccupa).

Poi elenca le aree selezionate in QUESTO FORMATO ESATTO, una per riga:
AREA_1: auth
AREA_2: ai
AREA_3: boot
(e così via)

I nomi delle aree devono essere ESATTAMENTE uno tra: auth, routing, ai, telemetry, storage, boot, scheduler

Non inventare: se i dati non mostrano evidenza di problemi, seleziona le aree con più dipendenze critiche.
`.trim();

const SYSTEM_PROMPT_AREA = (area: string) => `
Sei Horus, analizzatore tecnico di BikerLink. Hai ricevuto il codice completo dell'area "${area}" con file sorgente e scan automatici.

Analizza metodicamente ogni file presentato. Per ogni problema trovato:
1. Cita il path esatto del file e il numero di riga
2. Descrivi il problema concretamente (non speculativamente)
3. Classifica come: ANOMALIA / SICUREZZA / CROSS-LINK_ROTTO / HARDENING_MANCANTE

Produci SOLO la sezione:
## PROBLEMI_${area.toUpperCase()}
[elenco puntato con path, riga, tipo, descrizione]

Se non hai evidenza di un problema, scrivi "nessuna evidenza nei dati disponibili" per quella categoria.
Non inventare problemi. Non speculare senza evidenza nel codice.
`.trim();

const SYSTEM_PROMPT_APP_SYNTHESIS = `
Sei Horus, analizzatore tecnico senior di BikerLink. Hai i report di analisi per area (Phase 2) e tutti i 9 scan automatici e i dati DB.

Il tuo compito è produrre il report finale di analisi profonda del codebase BikerLink.

REGOLE FONDAMENTALI:
1. Non inventare: se i dati non mostrano evidenza, scrivi "nessuna evidenza nei dati disponibili"
2. Cita sempre path file esatto e numero di riga per ogni problema trovato
3. Integra i problemi trovati nelle Phase 2 con i cross-cutting issue trasversali
4. Cerca pattern che attraversano più aree (un problema auth + ai è più grave di uno isolato)
5. La tabella task usa 5 colonne: Titolo | Priorità | Area | Problema | Azione — max 12 task
6. Priorità: alta=crash/sicurezza/dati_corrotti, media=degradazione_utente/fallback_mancante, bassa=hardening/test_mancante

FORMATO OBBLIGATORIO (le sezioni devono apparire nell'ordine esatto):

## ANOMALIE TROVATE
[elenco puntato con path:riga, tipo ANOMALIA, descrizione concreta]

## SICUREZZA
[elenco puntato con path:riga, tipo SICUREZZA, descrizione concreta]
Se nessuna: "nessuna evidenza di vulnerabilità nei dati disponibili"

## CROSS-LINK ROTTI O MANCANTI
[connessioni tra moduli mancanti o rotte]

## DRIFT DEV↔PROD
[differenze osservate tra DB dev e prod]
Se dati prod non disponibili: indicalo esplicitamente

## COPERTURA TEST MANCANTE
[file critici senza test (da scan 4), ordinati per criticità]

## TASK PROPOSTI DA HORUS
| Titolo | Priorità | Area | Problema | Azione |
|--------|----------|------|---------|--------|
[max 12 righe, ordinati per priorità decrescente]
`.trim();

const ARCHITECT_PROMPT = `
Sei Horus in ruolo di architect senior. Hai il report di analisi profonda del codebase BikerLink e il backlog task esistente.

Il tuo compito è:
1. Verificare che i task proposti siano concreti, verificabili e non duplicati del backlog
2. Scartare task vaghi ("migliorare", "refactorare", "aggiungere test generico") senza path/riga specifici
3. Scartare task già presenti nel backlog (confronto semantico)
4. Per i task validi, confermare la priorità e l'area

Produci:

## TASK VALIDATI (pronti per proposta formale)
| Titolo | Priorità | Motivazione |
|--------|----------|-------------|

## TASK SCARTATI
- [titolo]: [duplicato di "X" / troppo vago / già risolto]
`.trim();

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const baseUrl = process.env.HORUS_OLLAMA_URL?.trim() || process.env.OLLAMA_URL?.trim();
  const model = process.env.HORUS_OLLAMA_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.HORUS_OLLAMA_TOKEN?.trim() || process.env.OLLAMA_TOKEN?.trim() || undefined;

  console.log("════════════════════════════════════════════════════════════");
  console.log("  [Horus] BikerLink — Analisi profonda codebase (multi-fase)");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Modello  : ${model}`);
  console.log(`  Tail     : ${tail} righe log AI`);
  console.log(`  Modalità : ${SINGLE_PHASE ? "single-phase" : "multi-fase (Phase 1→2→3)"}`);
  if (forcedArea) console.log(`  Area     : ${forcedArea} (forzata)`);
  if (IS_DRY_RUN) console.log("  Dry-run  : sì (nessuna chiamata a Horus)");
  if (ONLY_DB) console.log("  Only-db  : sì (code scan saltati)");
  if (ONLY_CODE) console.log("  Only-code: sì (query DB saltate)");
  if (NO_PROPOSE) console.log("  Proposta : disabilitata (--no-propose)");
  console.log("");

  if (!baseUrl && !IS_DRY_RUN) {
    console.error(
      "\n❌ HORUS_OLLAMA_URL non impostato.\n" +
        "   Imposta il secret HORUS_OLLAMA_URL con l'URL di Horus (ThinkCentre) via Cloudflare Tunnel\n" +
        "   (es. https://tc.biker-link.net) e riprova.\n",
    );
    process.exitCode = 1;
    return;
  }

  // ── Timestamp e output dir ──
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDirPrimary = process.env.HORUS_LOG_DIR
    ? path.resolve(process.env.HORUS_LOG_DIR)
    : path.join(ROOT, "logs");
  let outDir = outDirPrimary;

  // ── Salvataggio helper con doppio fallback ──
  function saveFile(filename: string, content: string): string {
    let outPath = path.join(outDir, filename);
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outPath, content, "utf8");
    } catch (err) {
      const fallbackDir = "/tmp";
      const fallbackPath = path.join(fallbackDir, filename);
      console.warn(`⚠️  Impossibile salvare in ${outDir}: ${(err as Error).message}`);
      try {
        fs.writeFileSync(fallbackPath, content, "utf8");
        outDir = fallbackDir;
        outPath = fallbackPath;
        console.warn(`📂 Salvato in fallback: ${outPath}`);
      } catch (err2) {
        console.warn(`❌ Fallback /tmp fallito: ${(err2 as Error).message}`);
      }
    }
    return outPath;
  }

  // ── Phase 0: 9 Scan automatici ──
  console.log("  ⏳ Esecuzione 9 scan automatici...");
  let scans: ScanResults;
  if (ONLY_DB) {
    scans = { s1: "[saltato --only-db]", s2: "[saltato]", s3: "[saltato]", s4: "[saltato]", s5: "[saltato]", s6: "[saltato]", s7: "[saltato]", s8: "[saltato]", s9: "[saltato]" };
  } else {
    console.log("    Scan 1 — Route Auth Audit...");
    const s1 = scan1RouteAuth();
    console.log("    Scan 2 — Env Var Audit...");
    const s2 = scan2EnvVars();
    console.log("    Scan 3 — Migration Risk...");
    const s3 = scan3MigrationRisk();
    console.log("    Scan 4 — Test Coverage Gap...");
    const s4 = scan4TestCoverage();
    console.log("    Scan 5 — Scheduler Fragility...");
    const s5 = scan5SchedulerFragility();
    console.log("    Scan 6 — AI Provider Timeout...");
    const s6 = scan6AiProviderTimeout();
    console.log("    Scan 7 — Schema vs Routes...");
    const s7 = scan7SchemaVsRoutes();
    console.log("    Scan 8 — Catch Silenzioso...");
    const s8 = scan8SilentCatch();
    console.log("    Scan 9 — Hardcoded Values...");
    const s9 = scan9HardcodedValues();
    scans = { s1, s2, s3, s4, s5, s6, s7, s8, s9 };
    console.log("  ✅ Scan completati.\n");
  }

  // ── Phase 0b: Query DB ──
  let dbDev = "";
  let dbProd = "";
  if (!ONLY_CODE) {
    console.log("  ⏳ Query DB dev...");
    dbDev = await collectDbDev(tail);
    console.log("  ⏳ Query DB prod...");
    dbProd = await collectDbProd();
    console.log("  ✅ DB queries completate.\n");
  } else {
    dbDev = "[saltato --only-code]";
    dbProd = "[saltato --only-code]";
  }

  // ── DRY RUN ──
  if (IS_DRY_RUN) {
    const bundle = SINGLE_PHASE
      ? buildSinglePhaseBundle(dbDev, dbProd, scans, forcedArea ? [forcedArea] : [...KNOWN_AREAS])
      : buildPhase1Bundle(dbDev, scans);
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  BUNDLE (dry-run — Horus NON viene chiamato)");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(bundle.slice(0, 8000));
    console.log(`\n  Bundle: ${bundle.length} caratteri, ~${Math.round(bundle.length / 4)} token stimati`);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODALITÀ SINGLE-PHASE
  // ─────────────────────────────────────────────────────────────────────────────
  if (SINGLE_PHASE) {
    const areas = forcedArea ? [forcedArea] : [...KNOWN_AREAS];
    const bundle = buildSinglePhaseBundle(dbDev, dbProd, scans, areas);

    console.log(`  ⏳ Invio a Horus — single-phase (timeout ${REQUEST_TIMEOUT_MS / 1000}s)...\n`);
    let report: string;
    try {
      report = await callHorus(baseUrl!, model, token, SYSTEM_PROMPT_APP_SYNTHESIS, bundle);
    } catch (err) {
      const e = err as Error;
      console.error(`\n❌ Analisi non riuscita: ${e.message}`);
      process.exitCode = 1;
      return;
    }

    const mainFilename = `horus-analysis-${ts}.md`;
    const header = `# Analisi Profonda BikerLink — ${new Date().toISOString()}\n\n- Istanza: Horus (ThinkCentre)\n- Modello: \`${model}\`\n- Modalità: single-phase\n\n---\n\n`;

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  REPORT ANALISI PROFONDA (single-phase)");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(report);
    console.log("\n════════════════════════════════════════════════════════════");

    const outPath = saveFile(mainFilename, header + report + "\n");
    console.log(`  💾 Report salvato in: ${outPath}`);

    await runArchitectAndPropose(baseUrl!, model, token, report, outPath, ts);
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MODALITÀ MULTI-FASE
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Phase 1: Pivot ──
  console.log(`  ⏳ Phase 1 — Pivot (Horus identifica le aree prioritarie, timeout ${REQUEST_TIMEOUT_MS / 1000}s)...\n`);
  const phase1Bundle = buildPhase1Bundle(dbDev, scans);
  let pivotResponse: string;
  try {
    pivotResponse = await callHorus(baseUrl!, model, token, SYSTEM_PROMPT_PIVOT, phase1Bundle);
  } catch (err) {
    const e = err as Error;
    console.error(`\n❌ Phase 1 non riuscita: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  console.log("\n  📍 PHASE 1 — PIVOT RESPONSE:");
  console.log(pivotResponse);
  console.log("");

  // Estrai le aree dalla risposta
  let selectedAreas: Area[] = [];
  if (forcedArea) {
    selectedAreas = [forcedArea];
    console.log(`  ℹ️  Area forzata: ${forcedArea}`);
  } else {
    const areaMatches = pivotResponse.matchAll(/AREA_\d+:\s*(\w+)/gi);
    for (const m of areaMatches) {
      const a = m[1].toLowerCase() as Area;
      if (KNOWN_AREAS.includes(a) && !selectedAreas.includes(a)) {
        selectedAreas.push(a);
      }
    }
    // Fallback: prendi le prime 3 aree se il parsing non ha trovato nulla
    if (selectedAreas.length === 0) {
      selectedAreas = ["ai", "auth", "boot"];
      console.log("  ⚠️  Nessuna area estratta dalla risposta Phase 1 — uso fallback: ai, auth, boot");
    }
    selectedAreas = selectedAreas.slice(0, 3);
  }

  console.log(`  🎯 Aree selezionate per Phase 2: ${selectedAreas.join(", ")}\n`);

  // ── Phase 2: Deep Dive per area ──
  const areaReports: Record<string, string> = {};

  for (const area of selectedAreas) {
    console.log(`  ⏳ Phase 2 — Deep Dive area "${area}" (timeout ${REQUEST_TIMEOUT_MS / 1000}s)...\n`);
    const areaBundle = buildAreaBundle(area, dbDev, scans);

    let areaReport: string;
    try {
      areaReport = await callHorus(baseUrl!, model, token, SYSTEM_PROMPT_AREA(area), areaBundle);
    } catch (err) {
      const e = err as Error;
      console.warn(`  ⚠️  Phase 2 area "${area}" non riuscita: ${e.message} — continuo con le altre aree`);
      areaReport = `[ANALISI AREA ${area.toUpperCase()} NON DISPONIBILE: ${e.message}]`;
    }

    areaReports[area] = areaReport;

    const areaFilename = `horus-analysis-${ts}-area-${area}.md`;
    console.log(`\n  📋 PHASE 2 — REPORT AREA ${area.toUpperCase()}:`);
    console.log(areaReport);
    const areaOutPath = saveFile(areaFilename, `# Analisi Area ${area.toUpperCase()} — ${new Date().toISOString()}\n\n${areaReport}\n`);
    console.log(`\n  💾 Salvato: ${areaOutPath}\n`);
  }

  // ── Phase 3: Sintesi trasversale ──
  console.log(`  ⏳ Phase 3 — Sintesi trasversale (timeout ${REQUEST_TIMEOUT_MS / 1000}s)...\n`);
  const phase3Bundle = buildPhase3Bundle(dbDev, dbProd, scans, areaReports);

  let finalReport: string;
  try {
    finalReport = await callHorus(baseUrl!, model, token, SYSTEM_PROMPT_APP_SYNTHESIS, phase3Bundle);
  } catch (err) {
    const e = err as Error;
    console.error(`\n❌ Phase 3 (sintesi) non riuscita: ${e.message}`);
    // Compila un report parziale dai report di area
    finalReport = Object.entries(areaReports)
      .map(([area, rep]) => `## PROBLEMI_${area.toUpperCase()}\n${rep}`)
      .join("\n\n") +
      "\n\n## TASK PROPOSTI DA HORUS\n| Titolo | Priorità | Area | Problema | Azione |\n|--------|----------|------|---------|--------|\n| Verificare Phase 3 | alta | generale | Sintesi non riuscita | Rieseguire con --single-phase |\n";
    console.warn("  ⚠️  Usando report parziale dai report di area.");
  }

  const mainFilename = `horus-analysis-${ts}.md`;
  const header =
    `# Analisi Profonda BikerLink — ${new Date().toISOString()}\n\n` +
    `- Istanza: Horus (ThinkCentre)\n` +
    `- Modello: \`${model}\`\n` +
    `- Modalità: multi-fase (Phase 1→2→3)\n` +
    `- Aree analizzate: ${selectedAreas.join(", ")}\n\n` +
    `---\n\n`;

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  REPORT FINALE — ANALISI PROFONDA BIKERLINK");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(finalReport);
  console.log("\n════════════════════════════════════════════════════════════");

  const outPath = saveFile(mainFilename, header + finalReport + "\n");
  console.log(`  💾 Report principale salvato in: ${outPath}`);

  await runArchitectAndPropose(baseUrl!, model, token, finalReport, outPath, ts);
}

// ─── Revisione architect + proposta task ──────────────────────────────────────

async function runArchitectAndPropose(
  baseUrl: string,
  model: string,
  token: string | undefined,
  report: string,
  outPath: string,
  _ts: string,
): Promise<void> {
  const outDir = path.dirname(outPath);

  function saveFile(filename: string, content: string): string {
    const filePath = path.join(outDir, filename);
    try {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
    } catch (err) {
      const fallbackPath = path.join("/tmp", filename);
      console.warn(`⚠️  Impossibile salvare ${filename}: ${(err as Error).message}`);
      try {
        fs.writeFileSync(fallbackPath, content, "utf8");
        console.warn(`📂 Salvato in fallback: ${fallbackPath}`);
        return fallbackPath;
      } catch (err2) {
        console.warn(`❌ Fallback /tmp fallito: ${(err2 as Error).message}`);
      }
    }
    return filePath;
  }

  // ── Revisione architect ──
  console.log("\n  ⏳ Revisione architect in corso...\n");
  let architectReview = "";
  try {
    const existingTitles = await fetchExistingTaskTitles();
    const existingList =
      existingTitles.length > 0
        ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "(backlog non disponibile)";

    const architectInput =
      `## REPORT HORUS — ANALISI PROFONDA\n\n${report}\n\n` +
      `## TASK GIÀ NEL BACKLOG (non proporre duplicati)\n\n${existingList}`;

    architectReview = await callHorus(baseUrl, model, token, ARCHITECT_PROMPT, architectInput);

    console.log("\n  📐 REVISIONE ARCHITECT");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(architectReview);

    const reviewFilename = path.basename(outPath).replace(".md", "-architect.md");
    const reviewPath = saveFile(reviewFilename, `# Revisione Architect\n\n${architectReview}\n`);
    console.log(`\n  💾 Revisione salvata in: ${reviewPath}`);
  } catch (err) {
    console.warn(`\n⚠️  Revisione architect non riuscita: ${(err as Error).message}`);
    console.warn("   I task verranno proposti dal report principale.\n");
  }

  // ── Proposta formale task ──
  if (NO_PROPOSE) {
    console.log("\n  ⏭️  Proposta task saltata (--no-propose).\n");
    return;
  }

  console.log("\n  ⏳ Preparazione proposta task...\n");
  const proposeScript = path.join(__dirname, "horus-propose-tasks.ts");
  const proposeArgs = ["tsx", proposeScript, "--report", outPath];
  if (architectReview) proposeArgs.push("--has-architect-review");

  const result = spawnSync("npx", proposeArgs, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    console.warn("\n⚠️  Proposta task completata con avvisi (vedi output sopra).\n");
  }
}

main().catch((err) => {
  console.error("[horus-app-analysis] Errore inatteso:", err);
  process.exitCode = 1;
});
