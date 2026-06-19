import { db } from "../../db";
import { sql } from "drizzle-orm";
import { translationKeys } from "@shared/db";
import { generateText } from "ai";
import { runWithFallback } from "../../ai/moderation/provider";
import { isOllamaConfigured, isOllamaReachable, getOllamaModel } from "../../lib/ollama-client";

const TRANS_LANGS = ["en", "de", "es", "fr", "el", "tr"] as const;

const LANG_NAMES: Record<string, string> = {
  it: "Italian",
  en: "English",
  de: "German",
  es: "Spanish",
  fr: "French",
  el: "Greek",
  tr: "Turkish",
};

export class AiProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

export interface AiCompletionStartInfo {
  totalMissing: number;
  totalBatches: number;
}

export interface AiCompletionBatchInfo {
  batchIndex: number;
  totalBatches: number;
  keysUpdatedThisBatch: number;
  totalKeysUpdated: number;
  summary: Record<string, number>;
  provider: string;
}

export interface AiCompletionResult {
  empty: boolean;
  totalProcessed: number;
  summary: Record<string, number>;
  provider: string;
  aborted: boolean;
}

export interface AiCompletionCallbacks {
  onStart?: (info: AiCompletionStartInfo) => void;
  onBatch?: (info: AiCompletionBatchInfo) => void;
  isAborted?: () => boolean;
}

const GLOSSARY = `
Glossario BikerLink (NON tradurre questi termini):
- "BikerLink" → rimane "BikerLink"
- "zavorrina" → rimane "zavorrina" (in EN puoi usare "pillion" se già presente, ma in EL/TR usa "zavorrina")
- "biker" → rimane "biker"
- "moto" → puoi tradurre (motorcycle/Motorrad/moto/μοτοσυκλέτα/motosiklet)
- Variabili come {nickname}, {count}, {n} → rimangono invariate
- Testo con "→" in percorsi → rimane
`.trim();

export async function runAiCompletion(callbacks: AiCompletionCallbacks = {}): Promise<AiCompletionResult> {
  const allRows = await db.select().from(translationKeys).orderBy(translationKeys.key);

  const rowsWithMissing = allRows.filter((row) =>
    TRANS_LANGS.some((l) => !(row[l as keyof typeof row] as string)?.trim())
  );

  const summary: Record<string, number> = Object.fromEntries(TRANS_LANGS.map((l) => [l, 0]));

  if (rowsWithMissing.length === 0) {
    return { empty: true, totalProcessed: 0, summary, provider: "ai", aborted: false };
  }

  const BATCH_SIZE = 30;
  const totalBatches = Math.ceil(rowsWithMissing.length / BATCH_SIZE);
  let totalProcessed = 0;
  let usedProviderName = "ai";

  callbacks.onStart?.({ totalMissing: rowsWithMissing.length, totalBatches });

  const ollamaReachable = isOllamaConfigured && (await isOllamaReachable());

  let batchIndex = 0;
  for (let i = 0; i < rowsWithMissing.length; i += BATCH_SIZE) {
    if (callbacks.isAborted?.()) {
      return { empty: false, totalProcessed, summary, provider: usedProviderName, aborted: true };
    }
    batchIndex++;
    const batch = rowsWithMissing.slice(i, i + BATCH_SIZE);
    let keysUpdatedThisBatch = 0;

    const missingLangsPerRow = batch.map((row) => ({
      key: row.key,
      it: row.it ?? "",
      missing: TRANS_LANGS.filter((l) => !(row[l as keyof typeof row] as string)?.trim()),
      existing: Object.fromEntries(
        TRANS_LANGS
          .filter((l) => !!(row[l as keyof typeof row] as string)?.trim())
          .map((l) => [l, row[l as keyof typeof row] as string])
      ),
    })).filter((r) => r.missing.length > 0 && r.it.trim());

    if (missingLangsPerRow.length === 0) {
      callbacks.onBatch?.({
        batchIndex, totalBatches, keysUpdatedThisBatch: 0,
        totalKeysUpdated: totalProcessed, summary: { ...summary }, provider: usedProviderName,
      });
      continue;
    }

    const allMissingLangs = [...new Set(missingLangsPerRow.flatMap((r) => r.missing))];

    const prompt = `Sei un traduttore professionale per l'app BikerLink, una community di motociclisti italiani.

${GLOSSARY}

Traduci le seguenti stringhe dell'interfaccia utente dall'italiano verso le lingue mancanti indicate.
Rispondi SOLO con un JSON valido nel formato:
{
  "chiave": {
    "lang_code": "traduzione"
  }
}

Lingue da tradurre: ${allMissingLangs.map((l) => `${l} (${LANG_NAMES[l]})`).join(", ")}

Stringhe da tradurre:
${missingLangsPerRow.map((r) =>
  `"${r.key}": { "it": ${JSON.stringify(r.it)}, "missing": ${JSON.stringify(r.missing)} }`
).join("\n")}`;

    let responseText = "";
    try {
      if (ollamaReachable) {
        try {
          const ollamaModel = getOllamaModel();
          const result = await generateText({ model: ollamaModel, prompt, maxRetries: 1 });
          responseText = result.text.trim();
          usedProviderName = "ollama";
        } catch (ollamaErr) {
          console.warn("[translations] ai-complete: Ollama fallito, scalo a cloud:", (ollamaErr as Error).message);
          const { value: cloudText, model: resolvedModel } = await runWithFallback(
            { role: "brain", skipOllama: true },
            (m) => m.scheduler(() =>
              generateText({ model: m.model as Parameters<typeof generateText>[0]["model"], prompt, maxRetries: 1 })
                .then((r) => r.text.trim())
            ),
          );
          responseText = cloudText;
          usedProviderName = resolvedModel.providerName;
        }
      } else {
        const { value: cloudText, model: resolvedModel } = await runWithFallback(
          { role: "brain", skipOllama: true },
          (m) => m.scheduler(() =>
            generateText({ model: m.model as Parameters<typeof generateText>[0]["model"], prompt, maxRetries: 1 })
              .then((r) => r.text.trim())
          ),
        );
        responseText = cloudText;
        usedProviderName = resolvedModel.providerName;
      }
    } catch (aiErr) {
      const aiMsg = (aiErr as Error)?.message ?? "";
      if (aiMsg.includes("AI_PROVIDER_UNAVAILABLE")) {
        throw new AiProviderUnavailableError(aiMsg);
      }
      console.error("[translations] ai-complete batch error:", aiErr);
      callbacks.onBatch?.({
        batchIndex, totalBatches, keysUpdatedThisBatch: 0,
        totalKeysUpdated: totalProcessed, summary: { ...summary }, provider: usedProviderName,
      });
      continue;
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let parsed: Record<string, Record<string, string>> | null = null;
      try {
        parsed = JSON.parse(jsonMatch[0]) as Record<string, Record<string, string>>;
      } catch {
        parsed = null;
      }

      if (parsed) {
        for (const [key, translations] of Object.entries(parsed)) {
          if (!translations || typeof translations !== "object") continue;
          const allowedMissingLangs = new Set<string>(
            missingLangsPerRow.find((r) => r.key === key)?.missing ?? []
          );
          if (allowedMissingLangs.size === 0) continue;
          const updateData: Record<string, string> = {};
          for (const [lang, value] of Object.entries(translations)) {
            if (
              allowedMissingLangs.has(lang) &&
              (TRANS_LANGS as readonly string[]).includes(lang) &&
              typeof value === "string" &&
              value.trim()
            ) {
              updateData[lang] = value.trim();
              summary[lang] = (summary[lang] ?? 0) + 1;
            }
          }
          if (Object.keys(updateData).length > 0) {
            await db
              .update(translationKeys)
              .set(updateData)
              .where(sql`${translationKeys.key} = ${key}`);
            totalProcessed++;
            keysUpdatedThisBatch++;
          }
        }
      }
    }

    callbacks.onBatch?.({
      batchIndex, totalBatches, keysUpdatedThisBatch,
      totalKeysUpdated: totalProcessed, summary: { ...summary }, provider: usedProviderName,
    });
  }

  return { empty: false, totalProcessed, summary, provider: usedProviderName, aborted: false };
}

export function buildDoneMessage(result: AiCompletionResult): string {
  if (result.empty) return "Tutte le traduzioni sono già complete.";
  const summaryStr = TRANS_LANGS.map((l) => `${l.toUpperCase()}: ${result.summary[l]}`).join(", ");
  return `Completate ${result.totalProcessed} chiavi via ${result.provider}. ${summaryStr}`;
}
