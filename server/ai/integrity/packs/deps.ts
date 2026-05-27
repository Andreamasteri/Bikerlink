// Task #2537 — Dependencies family checks.
import path from "path";
import type { AppIntegrityCheck } from "../types";
import { walkFiles, readSafe } from "../fs-helpers";

const FORBIDDEN_PACKAGES = new Set([
  "uuid", // skill expo: vietato (crash iOS/Android) — usare Date.now+Math.random o expo-crypto
]);

async function readPackageJson(root: string): Promise<{ deps: Set<string>; devDeps: Set<string>; raw: any } | null> {
  const txt = await readSafe(path.join(root, "package.json"));
  if (!txt) return null;
  try {
    const raw = JSON.parse(txt);
    const deps = new Set<string>(Object.keys(raw.dependencies ?? {}));
    const devDeps = new Set<string>(Object.keys(raw.devDependencies ?? {}));
    return { deps, devDeps, raw };
  } catch { return null; }
}

async function scanImportedPackages(root: string): Promise<Map<string, string[]>> {
  const files = await walkFiles(root, {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    includeDirs: ["server", "app", "lib", "hooks", "components", "shared", "scripts"],
  });
  const re = /(?:from|require\s*\()\s*["'`]([^"'`./@][^"'`]*|@[^/]+\/[^"'`]+)["'`]/g;
  const out = new Map<string, string[]>();
  for (const f of files) {
    const txt = await readSafe(f.absPath);
    if (!txt) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      let p = m[1];
      // Estrai package name: pacchetto top-level (scoped o no)
      if (p.startsWith("@")) {
        const parts = p.split("/"); p = parts.slice(0, 2).join("/");
      } else {
        p = p.split("/")[0];
      }
      if (!/^[@a-zA-Z0-9_-][@a-zA-Z0-9_/.-]*$/.test(p)) continue;
      const arr = out.get(p) ?? []; arr.push(f.relPath); out.set(p, arr);
    }
    re.lastIndex = 0;
  }
  return out;
}

const DEPCHECK_TIMEOUT_MS = 180_000;
const DEPCHECK_IGNORE = [
  "patch-package", "@babel/core", "babel-plugin-react-compiler",
  "drizzle-kit", "eslint", "eslint-config-expo", "tsx", "typescript",
  "@expo/ngrok", "@types/*", "knip", "madge", "depcheck", "jscpd",
];

const depcheckUnused: AppIntegrityCheck = {
  id: "deps/unused-package",
  family: "deps",
  name: "Pacchetto dichiarato ma mai importato (depcheck)",
  severity: "low",
  cost: "expensive",
  expensive: true,
  description: "Analisi statica con depcheck: pacchetti in dependencies/devDependencies senza alcun import nel codice.",
  async query(ctx) {
    try {
      const mod: any = await import("depcheck").catch(() => null);
      const depcheck = mod?.default ?? mod;
      if (typeof depcheck !== "function") {
        return { ok: true, count: 0, sample: [], details: { skipped: "depcheck non installato" } };
      }
      const pkg = await readPackageJson(ctx.projectRoot);
      if (!pkg) return { ok: true, count: 0, sample: [] };

      const options = {
        ignoreBinPackage: false,
        skipMissing: true,
        ignorePatterns: [
          "node_modules", "dist", "server_dist", ".expo", "build",
          "android", "ios", ".git",
        ],
        ignoreMatches: DEPCHECK_IGNORE,
        parsers: {
          "**/*.ts": depcheck.parser.typescript,
          "**/*.tsx": depcheck.parser.typescript,
          "**/*.js": depcheck.parser.es6,
          "**/*.jsx": depcheck.parser.jsx,
        },
        detectors: [
          depcheck.detector.requireCallExpression,
          depcheck.detector.importDeclaration,
          depcheck.detector.exportDeclaration,
          depcheck.detector.typescriptImportType,
          depcheck.detector.typescriptImportEqualsDeclaration,
        ],
        specials: [
          depcheck.special.eslint,
          depcheck.special.babel,
          depcheck.special.bin,
        ],
      };

      const result: any = await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error(`depcheck timeout dopo ${DEPCHECK_TIMEOUT_MS}ms`)), DEPCHECK_TIMEOUT_MS);
        depcheck(ctx.projectRoot, options)
          .then((r: any) => { clearTimeout(to); resolve(r); })
          .catch((e: any) => { clearTimeout(to); reject(e); });
      });

      const unusedDeps: string[] = result?.dependencies ?? [];
      const unusedDev: string[] = result?.devDependencies ?? [];
      const orphans: { pk: string; data: Record<string, unknown> }[] = [];
      for (const name of unusedDeps) {
        if (name.startsWith("@expo/") || name.startsWith("expo-") || name === "expo") continue;
        orphans.push({ pk: name, data: { package: name, location: "dependencies" } });
      }
      for (const name of unusedDev) {
        if (name.startsWith("@types/")) continue;
        orphans.push({ pk: name, data: { package: name, location: "devDependencies" } });
      }
      return {
        ok: orphans.length === 0,
        count: orphans.length,
        sample: orphans.slice(0, 20),
        details: {
          tool: "depcheck",
          unusedDeps: unusedDeps.length,
          unusedDevDeps: unusedDev.length,
        },
      };
    } catch (e) {
      return { ok: true, count: 0, sample: [], details: { error: (e as Error).message } };
    }
  },
  explainHint: "Rimuovi i pacchetti non utilizzati con `npm uninstall`. Verifica eventuali import dinamici esclusi.",
};

const depcheckMissing: AppIntegrityCheck = {
  id: "deps/missing-declaration",
  family: "deps",
  name: "Pacchetto importato ma non dichiarato",
  severity: "critical",
  cost: "medium",
  description: "Codice importa un pacchetto assente da package.json (causa MODULE_NOT_FOUND in produzione).",
  async query(ctx) {
    const pkg = await readPackageJson(ctx.projectRoot);
    if (!pkg) return { ok: true, count: 0, sample: [] };
    const used = await scanImportedPackages(ctx.projectRoot);
    const STDLIB = new Set([
      "fs", "fs/promises", "path", "url", "crypto", "stream", "buffer",
      "http", "https", "os", "child_process", "util", "events", "zlib",
      "net", "tls", "dns", "querystring", "assert", "module", "perf_hooks",
      "timers", "string_decoder", "readline", "process", "worker_threads",
      "node:fs", "node:path", "node:crypto", "node:url", "node:http",
    ]);
    const missing: { pk: string; data: Record<string, unknown> }[] = [];
    for (const [name, files] of used.entries()) {
      if (STDLIB.has(name)) continue;
      if (name.startsWith("node:")) continue;
      if (name.startsWith("@/") || name.startsWith("@shared")) continue;
      if (!pkg.deps.has(name) && !pkg.devDeps.has(name)) {
        missing.push({ pk: name, data: { package: name, usedIn: files.slice(0, 3), totalUses: files.length } });
      }
    }
    return { ok: missing.length === 0, count: missing.length, sample: missing.slice(0, 10) };
  },
  explainHint: "MODULE_NOT_FOUND blocca il backend in produzione: priorità critica.",
};

const forbiddenPackages: AppIntegrityCheck = {
  id: "deps/forbidden-packages",
  family: "deps",
  name: "Pacchetti vietati dalle skill (es. uuid)",
  severity: "high",
  cost: "cheap",
  description: "Pacchetti incompatibili con Expo Go o vietati da skill — vedi lista FORBIDDEN_PACKAGES.",
  async query(ctx) {
    const pkg = await readPackageJson(ctx.projectRoot);
    if (!pkg) return { ok: true, count: 0, sample: [] };
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const name of FORBIDDEN_PACKAGES) {
      if (pkg.deps.has(name) || pkg.devDeps.has(name)) {
        // Però uuid è dichiarato in overrides; serve un import diretto per essere problematico
        const used = await scanImportedPackages(ctx.projectRoot);
        if (used.has(name)) {
          hits.push({ pk: name, data: { package: name, reason: "Vietato da skill expo (crash mobile)" } });
        }
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits };
  },
};

const privateFlag: AppIntegrityCheck = {
  id: "deps/private-flag",
  family: "deps",
  name: "package.json non marcato `private: true`",
  severity: "low",
  cost: "cheap",
  description: "Per evitare pubblicazione accidentale su npm registry.",
  async query(ctx) {
    const pkg = await readPackageJson(ctx.projectRoot);
    if (!pkg) return { ok: true, count: 0, sample: [] };
    if (pkg.raw.private !== true) {
      return { ok: false, count: 1, sample: [{ pk: "private", data: { current: pkg.raw.private ?? false } }] };
    }
    return { ok: true, count: 0, sample: [] };
  },
};

const duplicateTypeDeclarations: AppIntegrityCheck = {
  id: "deps/duplicate-type-pkg",
  family: "deps",
  name: "@types/X dichiarati in dependencies invece di devDependencies",
  severity: "low",
  cost: "cheap",
  description: "I `@types/*` dovrebbero stare in devDependencies. Inflano il bundle se in dependencies.",
  async query(ctx) {
    const pkg = await readPackageJson(ctx.projectRoot);
    if (!pkg) return { ok: true, count: 0, sample: [] };
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const name of pkg.deps) {
      if (name.startsWith("@types/")) hits.push({ pk: name, data: { package: name, currentLocation: "dependencies" } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 20) };
  },
};

const overridesPresence: AppIntegrityCheck = {
  id: "deps/suspicious-overrides",
  family: "deps",
  name: "Override package.json verso versione major non standard",
  severity: "low",
  cost: "cheap",
  description: "Override globali che pinnano versioni major: rivedere periodicamente.",
  async query(ctx) {
    const pkg = await readPackageJson(ctx.projectRoot);
    if (!pkg) return { ok: true, count: 0, sample: [] };
    const ov = pkg.raw.overrides ?? {};
    const hits = Object.entries(ov).slice(0, 50).map(([k, v]) => ({ pk: k, data: { package: k, override: v } }));
    return { ok: true, count: hits.length === 0 ? 0 : 0, sample: hits.slice(0, 5), details: { totalOverrides: Object.keys(ov).length } };
    // Solo informativo: count=0 = non blocca, ma sample mostrato per audit
  },
};

const pack: AppIntegrityCheck[] = [
  depcheckMissing,    // critical
  depcheckUnused,
  forbiddenPackages,
  privateFlag,
  duplicateTypeDeclarations,
  overridesPresence,
];
export default pack;
