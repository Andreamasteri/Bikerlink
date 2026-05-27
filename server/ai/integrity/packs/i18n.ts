// Task #2537 — i18n family checks.
// Confronta lib/i18n/{it,en,...}.ts vs uso di t('key') nel codice.
import path from "path";
import fs from "fs/promises";
import type { AppIntegrityCheck, AutoFixResult } from "../types";
import { walkFiles, readSafe } from "../fs-helpers";

const LANGS = ["it", "en", "de", "es", "fr", "el", "tr"];

async function readLangFile(root: string, lang: string): Promise<Record<string, string>> {
  const p = path.join(root, "lib", "i18n", `${lang}.ts`);
  const txt = await readSafe(p);
  if (!txt) return {};
  const out: Record<string, string> = {};
  const re = /["']([^"']+)["']\s*:\s*["']([\s\S]*?)["']\s*,?$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt))) {
    if (m[1].length < 200) out[m[1]] = m[2];
  }
  return out;
}

async function scanUsedKeys(root: string): Promise<Map<string, string[]>> {
  const files = await walkFiles(root, { extensions: [".ts", ".tsx"], includeDirs: ["app", "components", "hooks", "lib"] });
  const re = /(?:^|[^A-Za-z0-9_])t\s*\(\s*["'`]([^"'`]{1,160})["'`]/g;
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

const keyUsedNotDefined: AppIntegrityCheck = {
  id: "i18n/key-used-not-defined",
  family: "i18n",
  name: "Chiave i18n usata ma mancante in IT",
  severity: "high",
  cost: "medium",
  description: "`t('key')` chiamato nel codice senza traduzione IT corrispondente (fallback finale).",
  async query(ctx) {
    const used = await scanUsedKeys(ctx.projectRoot);
    const it = await readLangFile(ctx.projectRoot, "it");
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const [k, files] of used.entries()) {
      if (!(k in it)) {
        hits.push({ pk: k, data: { key: k, usedIn: files.slice(0, 3), occurrences: files.length } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
  autofix: {
    kind: "i18n/add-missing-key-as-todo",
    safe: true,
    operation: "modify-file",
    targetPaths: ["lib/i18n/it.ts"],
    async run(ctx): Promise<AutoFixResult> {
      const used = await scanUsedKeys(ctx.projectRoot);
      const it = await readLangFile(ctx.projectRoot, "it");
      const missing = Array.from(used.keys()).filter((k) => !(k in it));
      if (!missing.length) return { applied: false, affected: 0, summary: "nessuna chiave mancante" };
      const filePath = path.join(ctx.projectRoot, "lib/i18n/it.ts");
      const current = await readSafe(filePath);
      if (!current) return { applied: false, affected: 0, summary: "lib/i18n/it.ts non leggibile" };
      const lastBrace = current.lastIndexOf("}");
      if (lastBrace < 0) return { applied: false, affected: 0, summary: "Impossibile trovare chiusura object" };
      const additions = missing.map((k) => `  "${k.replace(/"/g, '\\"')}": "__TODO__:${k.replace(/"/g, '\\"')}",`).join("\n");
      const next = current.slice(0, lastBrace) + "\n" + additions + "\n" + current.slice(lastBrace);
      if (ctx.dryRun) return { applied: false, affected: missing.length, summary: `dry-run: ${missing.length} chiavi da aggiungere` };
      await fs.writeFile(filePath, next, "utf8");
      return { applied: true, affected: missing.length, summary: `Aggiunte ${missing.length} chiavi placeholder __TODO__: a it.ts` };
    },
  },
};

const keyDefinedNotUsed: AppIntegrityCheck = {
  id: "i18n/key-defined-not-used",
  family: "i18n",
  name: "Chiave i18n definita ma mai usata",
  severity: "low",
  cost: "medium",
  description: "Chiave presente in `lib/i18n/it.ts` mai chiamata da `t(...)`.",
  async query(ctx) {
    const used = await scanUsedKeys(ctx.projectRoot);
    const it = await readLangFile(ctx.projectRoot, "it");
    const unused: { pk: string; data: Record<string, unknown> }[] = [];
    for (const k of Object.keys(it)) {
      if (!used.has(k)) unused.push({ pk: k, data: { key: k } });
    }
    return { ok: unused.length === 0, count: unused.length, sample: unused.slice(0, 20) };
  },
};

const placeholderTodo: AppIntegrityCheck = {
  id: "i18n/placeholder-todo-residual",
  family: "i18n",
  name: "Placeholder `__TODO__:` residuo in traduzioni",
  severity: "medium",
  cost: "cheap",
  description: "Valori `__TODO__:...` lasciati nei file lingua (aggiunti da autofix ma mai tradotti).",
  async query(ctx) {
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const lang of LANGS) {
      const dict = await readLangFile(ctx.projectRoot, lang);
      const bad = Object.entries(dict).filter(([, v]) => v.startsWith("__TODO__:"));
      for (const [k] of bad.slice(0, 5)) hits.push({ pk: `${lang}:${k}`, data: { lang, key: k } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 20) };
  },
};

const localesOutOfSync: AppIntegrityCheck = {
  id: "i18n/locales-out-of-sync",
  family: "i18n",
  name: "Lingue secondarie disallineate con IT",
  severity: "medium",
  cost: "cheap",
  description: "Per ogni lingua ≠ IT, conta le chiavi presenti in IT ma assenti nella lingua.",
  async query(ctx) {
    const it = await readLangFile(ctx.projectRoot, "it");
    const itKeys = new Set(Object.keys(it));
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const lang of LANGS.filter((l) => l !== "it")) {
      const dict = await readLangFile(ctx.projectRoot, lang);
      const missing = Array.from(itKeys).filter((k) => !(k in dict));
      if (missing.length) hits.push({ pk: lang, data: { lang, missingCount: missing.length, sample: missing.slice(0, 5) } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits };
  },
};

const duplicateKeys: AppIntegrityCheck = {
  id: "i18n/duplicate-keys",
  family: "i18n",
  name: "Chiave duplicata in stesso file lingua",
  severity: "high",
  cost: "cheap",
  description: "Stessa chiave dichiarata più volte (il secondo valore sovrascrive il primo silenziosamente).",
  async query(ctx) {
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const lang of LANGS) {
      const p = path.join(ctx.projectRoot, "lib", "i18n", `${lang}.ts`);
      const txt = await readSafe(p);
      if (!txt) continue;
      const seen = new Map<string, number>();
      const re = /["']([^"']+)["']\s*:\s*["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
      const dups = Array.from(seen.entries()).filter(([, n]) => n > 1);
      for (const [k, n] of dups.slice(0, 5)) hits.push({ pk: `${lang}:${k}`, data: { lang, key: k, occurrences: n } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 20) };
  },
};

const emptyTranslation: AppIntegrityCheck = {
  id: "i18n/empty-translation",
  family: "i18n",
  name: "Traduzione vuota (stringa vuota)",
  severity: "medium",
  cost: "cheap",
  description: "Chiave con valore stringa vuota in qualunque lingua.",
  async query(ctx) {
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const lang of LANGS) {
      const dict = await readLangFile(ctx.projectRoot, lang);
      const empties = Object.entries(dict).filter(([, v]) => v === "");
      for (const [k] of empties.slice(0, 5)) hits.push({ pk: `${lang}:${k}`, data: { lang, key: k } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 20) };
  },
};

const pack: AppIntegrityCheck[] = [
  keyUsedNotDefined, keyDefinedNotUsed, placeholderTodo,
  localesOutOfSync, duplicateKeys, emptyTranslation,
];
export default pack;
