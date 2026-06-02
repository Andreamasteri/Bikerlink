/**
 * RAG (Retrieval-Augmented Generation) — Task #3017
 *
 * Similarity search sulla knowledge base dell'assistente usando TF-IDF semplificato
 * con cosine similarity. Non richiede modelli di embedding esterni o pg_vector.
 *
 * Flusso:
 *   1. indexKnowledge(entries) — costruisce l'indice TF-IDF in-memory
 *   2. retrieveContext(query, k) — ritorna i top-k snippet rilevanti per il prompt
 *   3. formatRagContext(snippets) — formatta i risultati per l'injection nel system prompt
 *
 * In futuro si può upgraddare a un modello di embedding reale senza cambiare l'interfaccia.
 */

import { ASSISTANT_KNOWLEDGE, type KnowledgeEntry } from "./knowledge";

// ── Tokenization ──────────────────────────────────────────────────────────────

const STOPWORDS_IT = new Set([
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
  "e", "è", "di", "a", "da", "in", "con", "su", "per", "tra", "fra",
  "ma", "se", "che", "non", "si", "o", "ho", "ha", "hai", "hanno",
  "del", "della", "dei", "degli", "delle", "al", "alla", "ai", "agli", "alle",
  "nel", "nella", "nei", "negli", "nelle", "dal", "dalla", "dai", "dagli", "dalle",
  "col", "coi", "sul", "sulla", "sui", "sugli", "sulle",
  "come", "cosa", "dove", "quando", "chi", "perché", "questo", "questa", "questi", "queste",
  "sono", "essere", "avere", "fare", "dire", "andare", "sapere", "volere", "potere",
  "the", "is", "a", "an", "of", "to", "and", "or", "in", "on", "at", "for", "with",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS_IT.has(w));
}

// ── TF-IDF index ─────────────────────────────────────────────────────────────

interface IndexedEntry {
  entry: KnowledgeEntry;
  tokens: string[];
  tf: Map<string, number>;
}

interface RagIndex {
  entries: IndexedEntry[];
  idf: Map<string, number>;
  totalDocs: number;
}

function buildTf(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  const total = tokens.length || 1;
  const tf = new Map<string, number>();
  for (const [term, count] of counts) tf.set(term, count / total);
  return tf;
}

function buildIndex(entries: KnowledgeEntry[]): RagIndex {
  const indexed: IndexedEntry[] = entries.map((entry) => {
    const text = `${entry.question} ${entry.answer}`;
    const tokens = tokenize(text);
    return { entry, tokens, tf: buildTf(tokens) };
  });

  // IDF: log(N / df) dove df = numero di documenti che contengono il termine
  const df = new Map<string, number>();
  for (const ie of indexed) {
    const unique = new Set(ie.tokens);
    for (const term of unique) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const N = indexed.length || 1;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log(N / count + 1));

  return { entries: indexed, idf, totalDocs: N };
}

function tfidfVector(ie: IndexedEntry, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, tf] of ie.tf) {
    vec.set(term, tf * (idf.get(term) ?? 0));
  }
  return vec;
}

function queryVector(query: string, idf: Map<string, number>): Map<string, number> {
  const tokens = tokenize(query);
  const tf = buildTf(tokens);
  const vec = new Map<string, number>();
  for (const [term, tfVal] of tf) {
    vec.set(term, tfVal * (idf.get(term) ?? Math.log(2))); // IDF leggero per termini nuovi
  }
  return vec;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [term, va] of a) {
    const vb = b.get(term) ?? 0;
    dot += va * vb;
    normA += va * va;
  }
  for (const [, vb] of b) normB += vb * vb;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Public API ────────────────────────────────────────────────────────────────

let _index: RagIndex | null = null;
let _indexedKeys: string = "";

/**
 * Costruisce/aggiorna l'indice TF-IDF in-memory.
 * Chiama questa funzione all'avvio e ogni volta che le FAQ cambiano.
 * È idempotente: se le entry sono le stesse, non ricrea l'indice.
 */
export function indexKnowledge(extra: KnowledgeEntry[] = []): void {
  const all = [...ASSISTANT_KNOWLEDGE, ...extra];
  const key = all.map((e) => e.id).join(",");
  if (key === _indexedKeys && _index) return;
  _index = buildIndex(all);
  _indexedKeys = key;
}

export interface RagSnippet {
  id: string;
  question: string;
  answer: string;
  score: number;
}

/**
 * Recupera i top-k snippet più rilevanti per la query.
 * Ritorna array ordinato per score decrescente (score > threshold).
 */
export function retrieveContext(
  query: string,
  opts: { k?: number; threshold?: number; extra?: KnowledgeEntry[] } = {},
): RagSnippet[] {
  const { k = 3, threshold = 0.05, extra = [] } = opts;

  if (!_index || (extra.length > 0 && _indexedKeys !== [...ASSISTANT_KNOWLEDGE, ...extra].map((e) => e.id).join(","))) {
    indexKnowledge(extra);
  }
  if (!_index || _index.entries.length === 0) return [];

  const qVec = queryVector(query, _index.idf);

  const scored = _index.entries.map((ie) => {
    const docVec = tfidfVector(ie, _index!.idf);
    return {
      entry: ie.entry,
      score: cosineSimilarity(qVec, docVec),
    };
  });

  return scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({
      id: s.entry.id,
      question: s.entry.question,
      answer: s.entry.answer,
      score: s.score,
    }));
}

/**
 * Formatta i snippet RAG per l'injection nel system prompt.
 * Ritorna stringa vuota se non ci sono snippet.
 */
export function formatRagContext(snippets: RagSnippet[]): string {
  if (snippets.length === 0) return "";
  const lines = snippets.map((s) => `Q: ${s.question}\nA: ${s.answer}`).join("\n\n");
  return `CONTESTO RILEVANTE (recuperato dalla knowledge base):\n${lines}`;
}
