#!/usr/bin/env tsx
import * as fs from "node:fs";
import * as path from "node:path";
import { 
  hash, 
  parseFile, 
  buildKeyMap, 
  emitFile, 
  loadState, 
  saveState, 
  loadGlossary, 
  translateBatchSmart, 
  parseArgs, 
  I18N_DIR, 
  SOURCE_LANG 
} from "./translate-i18n.part2";

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  const apiKey = process.env.OPENAI_API_KEY;
  const ollamaConfigured = Boolean(process.env.BOWIE_OLLAMA_URL);
  if (!apiKey && !ollamaConfigured && !flags.dryRun) {
    console.error("[i18n] FATAL: né OPENAI_API_KEY né BOWIE_OLLAMA_URL sono impostati. Aborting.");
    process.exit(1);
  }
  if (ollamaConfigured) {
    console.log(`[i18n] Provider primario: Ollama (${process.env.BOWIE_OLLAMA_MODEL ?? "qwen3:1.7b"})${apiKey ? " — fallback OpenAI" : " — nessun fallback OpenAI (OPENAI_API_KEY mancante)"}`);
  }

  const itPath = path.join(I18N_DIR, `${SOURCE_LANG}.ts`);
  if (!fs.existsSync(itPath)) {
    console.error(`[i18n] FATAL: source file not found: ${itPath}`);
    process.exit(1);
  }

  console.log(`[i18n] Source: ${itPath}`);
  console.log(`[i18n] Targets: ${flags.langs.join(", ")}`);
  console.log(`[i18n] Mode: ${flags.dryRun ? "DRY RUN" : "LIVE"}`);

  const itParsed = parseFile(itPath);
  const itMap = buildKeyMap(itParsed);
  console.log(`[i18n] Italian source: ${itMap.size} keys`);

  const glossary = loadGlossary();
  const state = loadState();
  const BATCH_SIZE = 30;

  for (const lang of flags.langs) {
    const targetPath = path.join(I18N_DIR, `${lang}.ts`);
    if (!fs.existsSync(targetPath)) continue;
    const targetParsed = parseFile(targetPath);
    const targetMap = buildKeyMap(targetParsed);
    const langState = state[lang] ?? {};

    const toTranslate: { key: string; italian: string }[] = [];
    const finalMap = new Map<string, { value: string; manual: boolean }>();

    for (const t of itParsed.tokens) {
      if (t.type !== "kv") continue;
      const existing = targetMap.get(t.key);
      const itHash = hash(t.value);
      if (existing?.manual) {
        finalMap.set(t.key, existing);
        continue;
      }
      const lastSeenHash = langState[t.key];
      const needsTranslate = !existing || (lastSeenHash !== undefined && lastSeenHash !== itHash);
      if (!needsTranslate) {
        finalMap.set(t.key, { value: existing!.value, manual: false });
      } else {
        toTranslate.push({ key: t.key, italian: t.value });
        finalMap.set(t.key, { value: existing?.value ?? "", manual: false });
      }
    }

    if (toTranslate.length === 0) {
      console.log(`[i18n] [${lang}] nothing to do.`);
      continue;
    }

    if (!flags.dryRun) {
      const totalBatches = Math.ceil(toTranslate.length / BATCH_SIZE);
      for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
        const batch = toTranslate.slice(i, i + BATCH_SIZE);
        const result = await translateBatchSmart(batch, lang, glossary, apiKey);
        for (const item of batch) {
          finalMap.set(item.key, { value: result[item.key], manual: false });
          langState[item.key] = hash(item.italian);
        }
        console.log(`[i18n] [${lang}] batch ${Math.floor(i/BATCH_SIZE)+1}/${totalBatches} ok`);
      }
      state[lang] = langState;
      fs.writeFileSync(targetPath, emitFile(lang, itParsed, finalMap), "utf8");
    }
  }

  if (!flags.dryRun) saveState(state);
}

main().catch(err => {
  console.error(`[i18n] FATAL: ${err.message}`);
  process.exit(1);
});
