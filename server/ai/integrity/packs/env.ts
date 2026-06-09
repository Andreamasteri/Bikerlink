// Task #2537 — Env family checks.
import path from "path";
import type { AppIntegrityCheck } from "../types";
import { walkFiles, readSafe, pathExists } from "../fs-helpers";

async function scanEnvUsages(root: string): Promise<Map<string, string[]>> {
  const files = await walkFiles(root, {
    extensions: [".ts", ".tsx", ".js"],
    includeDirs: ["server", "app", "lib", "hooks", "components", "shared", "scripts"],
  });
  const re = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  const out = new Map<string, string[]>();
  for (const f of files) {
    const txt = await readSafe(f.absPath);
    if (!txt) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const arr = out.get(m[1]) ?? []; arr.push(f.relPath); out.set(m[1], arr);
    }
    re.lastIndex = 0;
  }
  return out;
}

const PLATFORM_BUILTIN = new Set([
  "NODE_ENV", "PORT", "REPLIT_DEV_DOMAIN", "REPLIT_DB_URL", "REPL_ID", "REPL_SLUG", "REPL_OWNER",
  "EXPO_PUBLIC_DOMAIN", "EXPO_PACKAGER_PROXY_URL", "REACT_NATIVE_PACKAGER_HOSTNAME",
  "DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE",
  "HOME", "PATH", "USER", "PWD",
]);

const envUsedNotDocumented: AppIntegrityCheck = {
  id: "env/used-not-documented",
  family: "env",
  name: "process.env.X usato ma non documentato in replit.md",
  severity: "medium",
  cost: "medium",
  description: "Variabile letta dal codice senza menzione in replit.md (rischio config dimenticato in deploy).",
  async query(ctx) {
    const used = await scanEnvUsages(ctx.projectRoot);
    const docs = await readSafe(path.join(ctx.projectRoot, "replit.md")) ?? "";
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const [k, files] of used.entries()) {
      if (PLATFORM_BUILTIN.has(k)) continue;
      if (k.startsWith("EXPO_PUBLIC_")) continue; // public env, di solito client-only
      if (!docs.includes(k)) {
        hits.push({ pk: k, data: { variable: k, usedIn: files.slice(0, 3), totalUses: files.length } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 15) };
  },
  explainHint: "Aggiungi una sezione nel replit.md che dichiari la variabile e il suo scopo.",
};

const envDocumentedNotUsed: AppIntegrityCheck = {
  id: "env/documented-not-used",
  family: "env",
  name: "Variabile documentata in replit.md ma mai usata",
  severity: "low",
  cost: "medium",
  description: "Heuristic: nomi in MAIUSCOLO_SNAKE menzionati in replit.md ma non referenziati da `process.env.X`.",
  async query(ctx) {
    const used = await scanEnvUsages(ctx.projectRoot);
    const docs = await readSafe(path.join(ctx.projectRoot, "replit.md")) ?? "";
    const usedSet = new Set(used.keys());
    const candidateRe = /\b([A-Z][A-Z0-9_]{4,})\b/g;
    const docKeys = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = candidateRe.exec(docs))) docKeys.add(m[1]);
    // Filtra parole non env (acronimi comuni)
    const FALSE_POSITIVES = new Set([
      "TODO", "FIXME", "NOTE", "WARNING", "ERROR", "OK", "FALSE", "TRUE",
      "NULL", "UNDEFINED", "JSON", "HTML", "CSS", "JS", "TS", "TSX",
      "OTA", "API", "URL", "URI", "SQL", "DB", "GPS", "SOS", "AI", "LLM",
      "ID", "PK", "FK", "TTL", "CRUD", "REST", "HTTP", "HTTPS", "WS", "WSS",
      "CTE", "CI", "CD", "DNS", "PR", "BSD", "MIT", "NOOP", "NPM",
    ]);
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const k of docKeys) {
      if (k.length < 5) continue;
      if (FALSE_POSITIVES.has(k)) continue;
      if (!k.includes("_")) continue; // env vars typically snake_case
      if (PLATFORM_BUILTIN.has(k)) continue;
      if (usedSet.has(k)) continue;
      hits.push({ pk: k, data: { variable: k } });
    }
    return { ok: true, count: hits.length, sample: hits.slice(0, 10), details: { note: "informativo" } };
  },
};

const secretLogged: AppIntegrityCheck = {
  id: "env/secret-logged",
  family: "env",
  name: "Possibile log di un secret",
  severity: "critical",
  cost: "cheap",
  description: "`console.log`/`logger.*` con riferimento a `process.env.X` (rischio leak secret nei log).",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, {
      extensions: [".ts", ".tsx"],
      includeDirs: ["server", "app", "lib", "scripts"],
    });
    const re = /(?:console\.(?:log|info|warn|error)|logger\.(?:info|warn|error|debug|trace))\s*\([^)]{0,300}process\.env\./g;
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      const matches = txt.match(re);
      if (matches && matches.length > 0) {
        hits.push({ pk: f.relPath, data: { file: f.relPath, occurrences: matches.length, example: matches[0].slice(0, 200) } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
  explainHint: "I secret nei log finiscono nei file di rotazione e nei sistemi di observability — vietato.",
};

const envMissingForProvider: AppIntegrityCheck = {
  id: "env/missing-for-provider",
  family: "env",
  name: "Provider AI dichiarato ma env mancante in runtime",
  severity: "high",
  cost: "cheap",
  description: "Se `@ai-sdk/openai` è importato ma `OPENAI_API_KEY` non è set, le chiamate AI falliranno in produzione.",
  async query(ctx) {
    const used = await scanEnvUsages(ctx.projectRoot);
    const pkgTxt = await readSafe(path.join(ctx.projectRoot, "package.json"));
    const pkg = pkgTxt ? JSON.parse(pkgTxt) : { dependencies: {} };
    const deps = new Set<string>(Object.keys(pkg.dependencies ?? {}));
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const providers: Array<[string, string]> = [
      ["@ai-sdk/openai", "OPENAI_API_KEY"],
      ["@ai-sdk/google", "GOOGLE_GENERATIVE_AI_API_KEY"],
      ["@sentry/node", "SENTRY_DSN"],
    ];
    for (const [pkgName, envName] of providers) {
      if (deps.has(pkgName) && !used.has(envName)) {
        hits.push({ pk: envName, data: { provider: pkgName, missingEnv: envName } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits };
  },
};

const dotEnvTracked: AppIntegrityCheck = {
  id: "env/dotenv-tracked",
  family: "env",
  name: "File .env tracciati nel repo",
  severity: "critical",
  cost: "cheap",
  description: "Presenza di `.env`, `.env.local`, `.env.production` nel filesystem non-gitignored.",
  async query(ctx) {
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of [".env", ".env.local", ".env.production", ".env.development"]) {
      if (await pathExists(path.join(ctx.projectRoot, f))) {
        hits.push({ pk: f, data: { file: f, message: "Verifica che sia in .gitignore e non contenga secrets" } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits };
  },
};

const envCaseInconsistent: AppIntegrityCheck = {
  id: "env/case-inconsistent",
  family: "env",
  name: "Variabile env con casing inconsistente",
  severity: "medium",
  cost: "medium",
  description: "Heuristic: stessa variabile letta in due file con casing diverso (es. `OPENAI_API_KEY` vs `OpenAi_Api_Key`).",
  async query(ctx) {
    const used = await scanEnvUsages(ctx.projectRoot);
    const lowerMap = new Map<string, string[]>();
    for (const k of used.keys()) {
      const lo = k.toLowerCase();
      const arr = lowerMap.get(lo) ?? []; arr.push(k); lowerMap.set(lo, arr);
    }
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const [lo, variants] of lowerMap.entries()) {
      if (variants.length > 1) hits.push({ pk: lo, data: { variants } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const pack: AppIntegrityCheck[] = [
  secretLogged,           // critical
  envUsedNotDocumented,
  envDocumentedNotUsed,
  envMissingForProvider,
  dotEnvTracked,          // critical
  envCaseInconsistent,
];
export default pack;
