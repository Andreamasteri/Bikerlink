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

const depcheckUnused: AppIntegrityCheck = {
  id: "deps/unused-package",
  family: "deps",
  name: "Pacchetto dichiarato ma mai importato",
  severity: "low",
  cost: "medium",
  description: "Pacchetto in package.json.dependencies senza alcuno `import`/`require` nel codice (heuristic).",
  async query(ctx) {
    const pkg = await readPackageJson(ctx.projectRoot);
    if (!pkg) return { ok: true, count: 0, sample: [] };
    const used = await scanImportedPackages(ctx.projectRoot);
    const usedNames = new Set(used.keys());
    const orphans: { pk: string; data: Record<string, unknown> }[] = [];
    // Esclude utility che servono ad altri tool (postinstall, build, type, ecc.)
    const ALLOWED_IMPLICIT = new Set([
      "patch-package", "@babel/core", "babel-plugin-react-compiler",
      "drizzle-kit", "eslint", "eslint-config-expo", "tsx", "typescript",
      "@expo/ngrok", "@types/react", "@types/express", "@types/supertest",
      "@types/node", "@types/sharp",
    ]);
    for (const name of pkg.deps) {
      if (ALLOWED_IMPLICIT.has(name)) continue;
      // expo-* è importato spesso transitivamente; saltiamo dipendenze expo native
      if (name.startsWith("@expo/") || name.startsWith("expo-")) continue;
      if (!usedNames.has(name)) orphans.push({ pk: name, data: { package: name } });
    }
    return { ok: orphans.length === 0, count: orphans.length, sample: orphans.slice(0, 20) };
  },
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
