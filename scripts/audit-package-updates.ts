#!/usr/bin/env npx tsx
/**
 * audit-package-updates.ts
 *
 * Recupera automaticamente changelog, bugfix e breaking-change dai repository
 * GitHub ufficiali ogni volta che vengono aggiornati pacchetti npm.
 *
 * Usage:
 *   npx tsx scripts/audit-package-updates.ts
 *     → legge il diff HEAD~1..HEAD di package.json (auto-detect)
 *
 *   npx tsx scripts/audit-package-updates.ts --from HEAD~3 --to HEAD
 *     → range di commit personalizzato
 *
 *   npx tsx scripts/audit-package-updates.ts --packages "expo@56.0.8>56.0.9,expo-router@56.2.8>56.2.9"
 *     → lista manuale (utile se package.json non è ancora committato)
 *
 * Output:
 *   .local/package-update-notes/YYYY-MM-DD.md
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PackageDiff {
  name: string;
  from: string;
  to: string;
}

interface RepoInfo {
  owner: string;
  repo: string;
  /** path inside the repo to CHANGELOG.md */
  changelogPath: string;
  /** git ref / branch to use */
  ref?: string;
  /** custom tag prefix for GitHub Releases (default: "v") */
  releaseTagPrefix?: string;
}

interface ChangelogSection {
  version: string;
  date: string;
  content: string;
  hasBreaking: boolean;
  hasFix: boolean;
}

// ---------------------------------------------------------------------------
// GitHub repo registry — mappatura npm-name → repo
// ---------------------------------------------------------------------------
function getRepoInfo(pkgName: string): RepoInfo | null {
  // Expo monorepo (expo/expo) — tutti i pacchetti expo-* e expo.
  // Le patch release SDK 56 sono nel branch sdk-56, non in main.
  // Il fallback a main viene gestito in fetchGitHubFile().
  if (pkgName === "expo" || pkgName.startsWith("expo-")) {
    const folder = pkgName;
    return {
      owner: "expo",
      repo: "expo",
      changelogPath: `packages/${folder}/CHANGELOG.md`,
      ref: "sdk-56", // branch con le patch più recenti per SDK 56
    };
  }

  // React / React Native
  if (pkgName === "react-native") {
    return {
      owner: "facebook",
      repo: "react-native",
      changelogPath: "CHANGELOG.md",
      ref: "main",
    };
  }
  if (pkgName === "react") {
    return { owner: "facebook", repo: "react", changelogPath: "CHANGELOG.md", ref: "main" };
  }

  // TanStack Query family
  if (
    pkgName === "@tanstack/react-query" ||
    pkgName === "@tanstack/query-async-storage-persister" ||
    pkgName === "@tanstack/react-query-persist-client"
  ) {
    return {
      owner: "TanStack",
      repo: "query",
      changelogPath: "packages/react-query/CHANGELOG.md",
      ref: "main",
    };
  }

  // Drizzle
  if (pkgName === "drizzle-orm") {
    return { owner: "drizzle-team", repo: "drizzle-orm", changelogPath: "drizzle-orm/CHANGELOG.md", ref: "main" };
  }
  if (pkgName === "drizzle-kit") {
    return { owner: "drizzle-team", repo: "drizzle-orm", changelogPath: "drizzle-kit/CHANGELOG.md", ref: "main" };
  }

  // Express
  if (pkgName === "express") {
    return { owner: "expressjs", repo: "express", changelogPath: "History.md", ref: "master" };
  }

  // Zod
  if (pkgName === "zod") {
    return { owner: "colinhacks", repo: "zod", changelogPath: "CHANGELOG.md", ref: "main" };
  }

  // TypeScript
  if (pkgName === "typescript") {
    return { owner: "microsoft", repo: "TypeScript", changelogPath: "CHANGELOG.md", ref: "main" };
  }

  // BullMQ
  if (pkgName === "bullmq") {
    return { owner: "taskforcesh", repo: "bullmq", changelogPath: "CHANGELOG.md", ref: "master" };
  }

  // ai sdk (Vercel)
  if (pkgName === "ai" || pkgName.startsWith("@ai-sdk/")) {
    const subfolder = pkgName.startsWith("@ai-sdk/") ? pkgName.replace("@ai-sdk/", "") : "ai";
    return {
      owner: "vercel",
      repo: "ai",
      changelogPath: `packages/${subfolder}/CHANGELOG.md`,
      ref: "main",
    };
  }

  // React Native community
  if (pkgName.startsWith("@react-native-community/")) {
    const sub = pkgName.replace("@react-native-community/", "");
    return {
      owner: "react-native-community",
      repo: sub,
      changelogPath: "CHANGELOG.md",
      ref: "main",
    };
  }

  // Reanimated
  if (pkgName === "react-native-reanimated") {
    return { owner: "software-mansion", repo: "react-native-reanimated", changelogPath: "CHANGELOG.md", ref: "main" };
  }

  // Sentry
  if (pkgName === "@sentry/node" || pkgName === "@sentry/react-native") {
    return { owner: "getsentry", repo: "sentry-javascript", changelogPath: "CHANGELOG.md", ref: "develop" };
  }

  // Sharp
  if (pkgName === "sharp") {
    return { owner: "lovell", repo: "sharp", changelogPath: "CHANGELOG.md", ref: "main" };
  }

  // Bull Board
  if (pkgName === "@bull-board/api" || pkgName === "@bull-board/express" || pkgName === "@bull-board/hapi" || pkgName === "@bull-board/koa" || pkgName === "@bull-board/fastify") {
    return { owner: "felixmosh", repo: "bull-board", changelogPath: "CHANGELOG.md", ref: "master" };
  }

  // React Native Async Storage (tag non-standard: @scope/pkg@x.y.z)
  if (pkgName === "@react-native-async-storage/async-storage") {
    return { owner: "react-native-async-storage", repo: "async-storage", changelogPath: "CHANGELOG.md", ref: "main", releaseTagPrefix: "@react-native-async-storage/async-storage@" };
  }

  // jscpd
  if (pkgName === "jscpd") {
    return { owner: "kucherenko", repo: "jscpd", changelogPath: "CHANGELOG.md", ref: "master" };
  }

  // Vite (vitejs/vite) — usa GitHub Releases (nessun CHANGELOG.md nel repo)
  if (pkgName === "vite") {
    return { owner: "vitejs", repo: "vite", changelogPath: "packages/vite/CHANGELOG.md", ref: "main" };
  }

  // Vitest
  if (pkgName === "vitest" || pkgName.startsWith("@vitest/")) {
    return { owner: "vitest-dev", repo: "vitest", changelogPath: "packages/vitest/CHANGELOG.md", ref: "main" };
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpsGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const reqOptions = {
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: "GET",
      headers: {
        "User-Agent": "BikerLink-package-audit/1.0",
        Accept: "application/vnd.github.v3+json",
        ...headers,
      },
    };
    const req = https.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    req.end();
  });
}

async function fetchGitHubFile(info: RepoInfo, token?: string): Promise<string | null> {
  const ref = info.ref ?? "main";
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Primary: GitHub Contents API (base64 encoded, max 1 MB)
  const contentsUrl = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/${info.changelogPath}?ref=${ref}`;
  try {
    const raw = await httpsGet(contentsUrl, headers);
    const json = JSON.parse(raw) as { content?: string; encoding?: string; message?: string };
    if (!json.message && json.content && json.encoding === "base64") {
      return Buffer.from(json.content.replace(/\n/g, ""), "base64").toString("utf-8");
    }
  } catch {
    // fall through to raw URL
  }

  // Fallback: raw.githubusercontent.com (no size limit)
  const rawUrl = `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${ref}/${info.changelogPath}`;
  try {
    return await httpsGet(rawUrl, token ? { Authorization: `Bearer ${token}` } : {});
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Changelog parser — estrae le sezioni di versione rilevanti
// ---------------------------------------------------------------------------
function parseChangelogSections(content: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  // Formato keepachangelog: ## [X.Y.Z] - YYYY-MM-DD  oppure  ## X.Y.Z — YYYY-MM-DD (Expo usa em-dash)
  const headerRe = /^##\s+\[?(\d+\.\d+\.\d+[^\]\s\—]*)\]?(?:\s+[–—\-]\s+(\d{4}-\d{2}-\d{2}))?/m;
  const lines = content.split("\n");
  let currentVersion = "";
  let currentDate = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentVersion) return;
    const body = currentLines.join("\n").trim();
    sections.push({
      version: currentVersion,
      date: currentDate,
      content: body,
      hasBreaking:
        /breaking[\s-]?change|BREAKING/i.test(body) ||
        /###\s*Breaking/i.test(body),
      hasFix: /###\s*(Bug\s*Fix|Fix|Patch)/i.test(body) || /\bfix(es|ed)?\b/i.test(body),
    });
  };

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      flush();
      currentVersion = m[1];
      currentDate = m[2] ?? "";
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();
  return sections;
}

function semverGt(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^[^0-9]*/, "").split(".").map(Number);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

function extractRelevantSections(
  sections: ChangelogSection[],
  fromVersion: string,
  toVersion: string
): ChangelogSection[] {
  return sections.filter((s) => {
    const v = s.version;
    return semverGt(v, fromVersion) && !semverGt(v, toVersion);
  });
}

// ---------------------------------------------------------------------------
// Detect changed packages from git diff
// ---------------------------------------------------------------------------
function detectChangedPackages(fromRef: string, toRef: string): PackageDiff[] {
  try {
    const oldJson = execSync(`git show ${fromRef}:package.json`, { encoding: "utf-8" });
    const newJson = execSync(`git show ${toRef}:package.json`, { encoding: "utf-8" });
    const oldPkg = JSON.parse(oldJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const newPkg = JSON.parse(newJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

    const oldDeps = { ...oldPkg.dependencies, ...oldPkg.devDependencies };
    const newDeps = { ...newPkg.dependencies, ...newPkg.devDependencies };

    const changed: PackageDiff[] = [];
    for (const [name, newVer] of Object.entries(newDeps)) {
      const oldVer = oldDeps[name];
      const cleanOld = (oldVer ?? "").replace(/^[~^>=<]/, "");
      const cleanNew = newVer.replace(/^[~^>=<]/, "");
      if (oldVer && cleanOld !== cleanNew) {
        changed.push({ name, from: cleanOld, to: cleanNew });
      }
    }
    return changed;
  } catch {
    return [];
  }
}

function parseManualPackages(spec: string): PackageDiff[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.+?)@([^>]+)>(.+)$/);
      if (!m) throw new Error(`Invalid package spec: "${s}" — expected "name@from>to"`);
      return { name: m[1], from: m[2], to: m[3] };
    });
}

// ---------------------------------------------------------------------------
// GitHub Releases API — fallback se il CHANGELOG non ha la versione
// ---------------------------------------------------------------------------
async function fetchGitHubRelease(info: RepoInfo, version: string, token?: string): Promise<string | null> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const prefix = info.releaseTagPrefix ?? "v";
  const tag = encodeURIComponent(`${prefix}${version}`);
  const url = `https://api.github.com/repos/${info.owner}/${info.repo}/releases/tags/${tag}`;
  try {
    const raw = await httpsGet(url, headers);
    const json = JSON.parse(raw) as { body?: string; message?: string };
    if (json.message) return null;
    return json.body ?? null;
  } catch {
    return null;
  }
}

/**
 * Per upgrade cross-major (from 2.x → 3.x), recupera anche le release note
 * di ogni versione .0.0 intermedia (es. 3.0.0, 4.0.0 ...).
 * Restituisce una stringa multi-sezione o null se nulla trovato.
 */
async function fetchIntermediateMajorReleases(
  info: RepoInfo,
  fromVersion: string,
  toVersion: string,
  token?: string
): Promise<string | null> {
  const fromMajor = parseInt(fromVersion.split(".")[0], 10);
  const toMajor = parseInt(toVersion.split(".")[0], 10);
  if (isNaN(fromMajor) || isNaN(toMajor) || fromMajor >= toMajor) return null;

  const notes: string[] = [];
  for (let major = fromMajor + 1; major <= toMajor; major++) {
    const majorVer = `${major}.0.0`;
    if (majorVer === toVersion) continue; // già recuperata dal caller
    const note = await fetchGitHubRelease(info, majorVer, token);
    if (note) notes.push(`## v${majorVer} (major release)\n\n${note}`);
  }
  return notes.length > 0 ? notes.join("\n\n---\n\n") : null;
}

// ---------------------------------------------------------------------------
// Report generator
// ---------------------------------------------------------------------------
function formatReport(
  results: Array<{
    pkg: PackageDiff;
    sections: ChangelogSection[];
    releaseNote?: string | null;
    error?: string;
    noRepo?: boolean;
  }>,
  runDate: string
): string {
  const lines: string[] = [
    `# Package Update Audit — ${runDate}`,
    "",
    `Generato automaticamente da \`scripts/audit-package-updates.ts\``,
    "",
  ];

  // Summary table
  const anyBreaking = results.some((r) => r.sections.some((s) => s.hasBreaking));
  lines.push("## Riepilogo");
  lines.push("");
  lines.push("| Pacchetto | Da | A | Breaking | Fix | Note |");
  lines.push("|-----------|----|----|:--------:|:---:|------|");

  for (const r of results) {
    const breaking = r.sections.some((s) => s.hasBreaking) ? "⚠️ SÌ" : "—";
    const fix = r.sections.some((s) => s.hasFix) ? "✓" : "—";
    const note = r.noRepo
      ? "nessun repo nel registry"
      : r.error
      ? `errore: ${r.error}`
      : r.sections.length === 0
      ? "sezioni non trovate nel CHANGELOG"
      : `${r.sections.length} versioni`;
    lines.push(`| \`${r.pkg.name}\` | ${r.pkg.from} | ${r.pkg.to} | ${breaking} | ${fix} | ${note} |`);
  }

  if (anyBreaking) {
    lines.push("");
    lines.push("> ⚠️ **Attenzione: breaking changes rilevati.** Controlla le sezioni evidenziate sotto.");
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Detail sections
  lines.push("## Dettaglio per pacchetto");
  lines.push("");

  for (const r of results) {
    lines.push(`### \`${r.pkg.name}\` — ${r.pkg.from} → ${r.pkg.to}`);
    lines.push("");

    if (r.noRepo) {
      lines.push("_Repo GitHub non nel registry. Verifica manualmente su [npmjs.com](https://www.npmjs.com/package/" + r.pkg.name + ")_");
      lines.push("");
      continue;
    }

    if (r.error) {
      lines.push(`_Errore nel recupero changelog: ${r.error}_`);
      lines.push("");
      continue;
    }

    if (r.sections.length === 0) {
      if (r.releaseNote) {
        lines.push("_Sezione CHANGELOG non trovata, ma GitHub Release disponibile:_");
        lines.push("");
        lines.push(r.releaseNote.trim());
      } else {
        lines.push("_Nessuna entry trovata nel CHANGELOG per questa versione._");
      }
      lines.push("");
      continue;
    }

    for (const sec of r.sections) {
      const dateStr = sec.date ? ` — ${sec.date}` : "";
      const flags = [
        sec.hasBreaking ? "⚠️ BREAKING" : "",
        sec.hasFix ? "🔧 fix" : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`#### v${sec.version}${dateStr} ${flags}`);
      lines.push("");
      lines.push(sec.content.trim());
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("_Fine report_");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const token = process.env.GITHUB_TOKEN;

  let packages: PackageDiff[] = [];

  const manualIdx = args.indexOf("--packages");
  const fromIdx = args.indexOf("--from");
  const toIdx = args.indexOf("--to");

  if (manualIdx !== -1) {
    packages = parseManualPackages(args[manualIdx + 1]);
  } else {
    const fromRef = fromIdx !== -1 ? args[fromIdx + 1] : "HEAD~1";
    const toRef = toIdx !== -1 ? args[toIdx + 1] : "HEAD";
    packages = detectChangedPackages(fromRef, toRef);
  }

  if (packages.length === 0) {
    console.log("✓ Nessun pacchetto modificato rilevato nel range specificato.");
    process.exit(0);
  }

  console.log(`\n🔍 Analizzando ${packages.length} pacchetti aggiornati...\n`);
  for (const p of packages) {
    console.log(`  ${p.name}: ${p.from} → ${p.to}`);
  }
  console.log("");

  const results: Array<{
    pkg: PackageDiff;
    sections: ChangelogSection[];
    releaseNote?: string | null;
    error?: string;
    noRepo?: boolean;
  }> = [];

  for (const pkg of packages) {
    process.stdout.write(`  📦 ${pkg.name} ... `);
    const info = getRepoInfo(pkg.name);

    if (!info) {
      console.log("repo non nel registry");
      results.push({ pkg, sections: [], noRepo: true });
      continue;
    }

    try {
      const content = await fetchGitHubFile(info, token);

      // No CHANGELOG file — try GitHub Releases directly
      if (!content) {
        const [releaseNote, intermediateNotes] = await Promise.all([
          fetchGitHubRelease(info, pkg.to, token),
          fetchIntermediateMajorReleases(info, pkg.from, pkg.to, token),
        ]);
        const combined = [intermediateNotes, releaseNote].filter(Boolean).join("\n\n---\n\n") || null;
        if (combined) {
          const hasMajorNotes = !!intermediateNotes;
          console.log(`⬜ nessun CHANGELOG, release note trovata${hasMajorNotes ? " (+ major releases)" : ""}`);
          results.push({ pkg, sections: [], releaseNote: combined });
        } else {
          console.log("errore: CHANGELOG non trovato e nessuna release note");
          results.push({ pkg, sections: [], error: "CHANGELOG non trovato e nessuna release note disponibile" });
        }
        continue;
      }

      const allSections = parseChangelogSections(content);
      const relevant = extractRelevantSections(allSections, pkg.from, pkg.to);

      let releaseNote: string | null = null;
      if (relevant.length === 0) {
        const [toRelease, intermediateNotes] = await Promise.all([
          fetchGitHubRelease(info, pkg.to, token),
          fetchIntermediateMajorReleases(info, pkg.from, pkg.to, token),
        ]);
        releaseNote = [intermediateNotes, toRelease].filter(Boolean).join("\n\n---\n\n") || null;
      }

      const flags = [
        relevant.some((s) => s.hasBreaking) ? "⚠️ BREAKING" : "",
        relevant.some((s) => s.hasFix) ? "🔧 fix" : "",
        relevant.length === 0 ? "⬜ nessuna entry" : `${relevant.length} sezioni`,
      ]
        .filter(Boolean)
        .join(" ");
      console.log(flags);

      results.push({ pkg, sections: relevant, releaseNote });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`errore: ${msg}`);
      results.push({ pkg, sections: [], error: msg });
    }
  }

  const now = new Date();
  const runDate = now.toISOString().split("T")[0];
  const report = formatReport(results, runDate);

  const outDir = path.join(process.cwd(), ".local/package-update-notes");
  fs.mkdirSync(outDir, { recursive: true });

  // Aggiunge timestamp se esiste già un file di oggi
  let fileName = `${runDate}.md`;
  if (fs.existsSync(path.join(outDir, fileName))) {
    const ts = now.toISOString().replace(/[:.]/g, "-").split("T")[1].split("-").slice(0, 3).join("");
    fileName = `${runDate}-${ts}.md`;
  }

  const outPath = path.join(outDir, fileName);
  fs.writeFileSync(outPath, report, "utf-8");

  console.log(`\n✅ Report salvato in: ${outPath.replace(process.cwd() + "/", "")}`);

  const breaking = results.filter((r) => r.sections.some((s) => s.hasBreaking));
  if (breaking.length > 0) {
    console.log(`\n⚠️  Breaking changes in: ${breaking.map((r) => r.pkg.name).join(", ")}`);
    console.log("   Consulta il report prima di deployare.");
    process.exit(2); // exit 2 = warning (non blocca CI ma segnala)
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
