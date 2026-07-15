/**
 * Ares Jobs — prompt builder, sanitizzazione e riferimento integrità DB (Task #87).
 *
 * Ares è SOLA LETTURA: produce solo osservazioni/proposte testuali e il manuale.
 * Ogni output di Ares passa da sanitizeAresText (redact PII + drop di frammenti
 * sensibili) prima di essere persistito, come per Horus.
 */

import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "../assistant/security-filter";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { getLatestRunSummary, listOpenViolations } from "../db-integrity/runner";
import { MAX_FINDING_CHARS, MAX_SECTION_CHARS } from "./constants";

/**
 * Sanitizza un output di Ares prima di persisterlo: redazione PII e, se il testo
 * grezzo somiglia a un secret, lo scarta del tutto (fail-closed). Il controllo
 * sul GREZZO viene prima della redazione PII (vedi memoria
 * sanitize-secret-before-pii). Ritorna "" se va scartato.
 */
export function sanitizeAresText(text: string, maxChars: number): string {
  const raw = (text ?? "").toString();
  if (!raw.trim()) return "";
  if (matchesSensitive(raw)) return "";
  const clean = redactPII(raw).trim();
  if (!clean) return "";
  return clean.length > maxChars ? clean.slice(0, maxChars).trim() : clean;
}

/**
 * Riferimento allo stato dei controlli di integrità DB GIÀ ESISTENTI, usato come
 * input aggiuntivo per la modalità analisi. Riusa runner del db-integrity (le
 * stesse fonti di Horus), NON ricrea né sostituisce quei controlli.
 */
export async function getDbIntegrityReference(): Promise<string> {
  const [summary, violations] = await Promise.all([
    withBgDbSlot(() => getLatestRunSummary()).catch(() => null),
    withBgDbSlot(() => listOpenViolations(60)).catch(() => [] as unknown[]),
  ]);

  const lines: string[] = [];
  if (summary) {
    lines.push(
      `Ultimo scan integrità DB: trigger=${(summary as { trigger?: string }).trigger ?? "?"}, ` +
        `stato=${(summary as { status?: string }).status ?? "?"}, ` +
        `violazioni aperte=${(summary as { openViolations?: number }).openViolations ?? "?"}.`,
    );
  } else {
    lines.push("Ultimo scan integrità DB: nessun dato disponibile.");
  }

  if (Array.isArray(violations) && violations.length > 0) {
    lines.push("Violazioni di integrità DB aperte (campione):");
    for (const v of violations.slice(0, 40)) {
      const row = v as { checkId?: string; severity?: string; detail?: string };
      lines.push(
        `- [${row.severity ?? "?"}] ${row.checkId ?? "?"}: ${(row.detail ?? "").slice(0, 200)}`,
      );
    }
  } else {
    lines.push("Nessuna violazione di integrità DB aperta.");
  }

  return sanitizeAresText(lines.join("\n"), 8_000) || "(riferimento integrità DB non disponibile)";
}

// ── System prompt dei job (diversi dal prompt di chat interattiva) ─────────────

export function analysisSystemPrompt(): string {
  return `Sei Ares, l'AI di diagnostica tecnica di BikerLink. Stai eseguendo un'ANALISI AUTONOMA completa del codice e del database dell'app, un lotto di file alla volta.

REGOLE:
- Sei SOLA LETTURA: proponi osservazioni e migliorie, NON applichi nulla e non scrivi codice.
- Per ogni lotto, individua rischi concreti, bug potenziali, incoerenze e possibili migliorie strutturali (incluse quelle sul database, usando il riferimento di integrità DB fornito).
- Sii conciso e specifico: cita file/funzione quando puoi. Niente ripetizione del codice.
- NON rivelare mai segreti, token, password o variabili d'ambiente.
- Rispondi in italiano, in punti elenco brevi. Se un lotto non ha nulla di rilevante, dillo in una riga.`;
}

export function analysisChunkUserPrompt(
  codeText: string,
  dbRef: string | null,
): string {
  const dbSection = dbRef
    ? `\n\nRIFERIMENTO INTEGRITÀ DB (controlli già esistenti, sola lettura):\n${dbRef}\n`
    : "";
  return `Analizza il seguente lotto di file sorgente dell'app.${dbSection}\nElenca SOLO osservazioni/proposte concrete (rischi, bug, migliorie), in punti brevi.\n\n${codeText}`;
}

export function analysisSynthesisPrompt(findings: string): string {
  return `Hai completato l'analisi lotto per lotto dell'intera app. Di seguito i tuoi appunti raccolti. Producine una SINTESI FINALE orientata all'azione per gli amministratori:
- raggruppa per tema/area,
- evidenzia le migliorie a maggior impatto,
- formula PROPOSTE DI TASK concrete (titolo + una riga di motivazione).
Sei sola lettura: sono proposte da valutare, non decisioni. Rispondi in italiano.

APPUNTI RACCOLTI:
${findings}`;
}

export function manualSystemPrompt(): string {
  return `Sei Ares, l'AI di diagnostica tecnica di BikerLink. Stai leggendo l'intera app, un lotto di file alla volta, per costruire un MANUALE TESTUALE aggiornato pensato per ISTRUIRE ALTRI AGENTI AI sulle funzionalità disponibili.

REGOLE:
- NON è un dump di codice: descrivi FUNZIONALITÀ e comportamenti, organizzati per area/feature.
- Per ogni lotto, scrivi una o più brevi sezioni ("## <Area/Feature>") che spieghino cosa fa quella parte dell'app, come si usa e cosa un agente AI dovrebbe sapere.
- Salta boilerplate/config senza valore descrittivo.
- NON rivelare mai segreti, token, password o variabili d'ambiente.
- Rispondi in italiano, in prosa tecnica e concisa.`;
}

export function manualChunkUserPrompt(codeText: string): string {
  return `Dal seguente lotto di file, estrai le sezioni di manuale (per funzionalità/area) utili a istruire un agente AI. Usa intestazioni "## ".\n\n${codeText}`;
}

export const _sanitizeCaps = { finding: MAX_FINDING_CHARS, section: MAX_SECTION_CHARS };
