/**
 * JSON Repair — Task #3017
 *
 * Tenta di correggere JSON leggermente malformato prodotto da LLM locali
 * (llama3.1, ecc.) prima di propagare l'errore di parsing al chiamante.
 *
 * Casi gestiti:
 *  - Blocchi ```json ... ``` attorno al payload
 *  - Trailing comma prima di } o ]
 *  - Chiavi non quotate (solo identificatori semplici, heuristic)
 *  - Single-quote usate come delimitatori di stringa
 *  - Commenti // e /* ... * / (non standard JSON)
 */

/**
 * Tenta di riparare una stringa JSON malformata.
 * Ritorna { ok: true, value } se il repair+parse riesce,
 * { ok: false } se il JSON è irrecuperabile.
 */
export function repairJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  let s = raw.trim();

  // 1) Rimuovi blocchi ```json ... ``` o ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  // 2) Rimuovi commenti C-style /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, "");

  // 3) Rimuovi commenti // ... (solo fuori stringhe — heuristic)
  s = s.replace(/\/\/[^\n\r]*/g, "");

  // 4) Trailing comma prima di } o ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // 5) Single-quote come delimitatori di stringa (heuristic: rimpiazza 'value' con "value"
  //    solo quando non siamo già dentro una stringa doppia).
  //    Questo è un heuristic leggero — non gestisce escape complessi.
  s = s.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"');

  // 6) Chiavi non quotate: { key: value } → { "key": value }
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');

  try {
    const value = JSON.parse(s);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

/**
 * Tenta di estrarre e parsare il primo oggetto/array JSON trovato in una stringa.
 * Utile quando il modello aggiunge testo prima/dopo il JSON.
 */
export function extractAndRepairJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  // Prima tentiamo il repair diretto
  const direct = repairJson(raw);
  if (direct.ok) return direct;

  // Poi tentiamo di estrarre il primo { ... } o [ ... ] dalla stringa
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    const r = repairJson(objMatch[0]);
    if (r.ok) return r;
  }

  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    const r = repairJson(arrMatch[0]);
    if (r.ok) return r;
  }

  return { ok: false };
}
