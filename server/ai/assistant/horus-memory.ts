// Task #50 — Memoria persistente di Horus.
//
// Horus (specialista percorsi/navigazione) è l'UNICO agente che può salvare note
// permanenti tramite il tool `remember_note`. Le note vivono in un file di testo
// su disco locale (`inbox/horus-memory.md`, coerente con il catalogo di
// riferimento dell'ecosistema agenti) e vengono ricaricate come contesto di
// sistema aggiuntivo in OGNI conversazione futura in cui Horus è la persona
// attiva — così Horus "ricorda" tra sessioni diverse. Bowie/Ares NON
// vedono questa memoria.
//
// Non contiene segreti: solo testo di appunti. Il file è best-effort (in
// produzione il filesystem può essere effimero fra i deploy): un errore di I/O
// non deve mai far fallire il turno dell'assistente.
import { promises as fs } from "node:fs";
import path from "node:path";
import { matchesSensitive } from "./security-filter";
import { redactPII } from "../moderation/redact";

// Tetto anti-crescita: la memoria è un indice di appunti, non un log. Se supera
// questa soglia teniamo solo la coda (le note più recenti). Evita che il file
// gonfi il layer del repl (vedi memoria `repl-layer-size`).
const MAX_MEMORY_BYTES = 32_768;

/** Percorso corrente del file di memoria (letto lazy: sovrascrivibile via env per
 *  i test, così non si scrive mai nella repo reale). */
export function getHorusMemoryPath(): string {
  return process.env.HORUS_MEMORY_FILE?.trim() || path.join(process.cwd(), "inbox", "horus-memory.md");
}

/**
 * Appende una nota alla memoria persistente di Horus, con timestamp. Ritorna il
 * testo salvato (normalizzato) o lancia solo se l'input è vuoto — gli errori di
 * I/O vengono propagati al chiamante che li tratta come esito non-ok del tool.
 */
export async function appendHorusNote(note: string, nowIso: string): Promise<string> {
  const clean = (note ?? "").trim();
  if (!clean) throw new Error("nota vuota");

  // Sicurezza: la memoria di Horus è GLOBALE e viene iniettata in ogni futura
  // conversazione con Horus. Non deve MAI persistere segreti o PII.
  // 1) Rifiuta i segreti sul testo GREZZO (prima della redazione PII, che
  //    potrebbe spezzare un token e lasciar trapelare un frammento — vedi
  //    memoria `sanitize-secret-before-pii`).
  if (matchesSensitive(clean)) {
    throw new Error("La nota contiene credenziali o segreti e non è stata salvata.");
  }
  // 2) Redazione PII (email/telefoni/URL/IBAN/CF/coordinate precise) prima di
  //    scrivere su disco.
  const redacted = redactPII(clean).replace(/\s+/g, " ").trim();
  if (!redacted) throw new Error("nota vuota dopo la sanitizzazione");

  const memoryFile = getHorusMemoryPath();
  await fs.mkdir(path.dirname(memoryFile), { recursive: true });

  const existing = await loadHorusMemory();
  const header = existing ? "" : "# Memoria persistente di Horus\n\n";
  const entry = `- [${nowIso}] ${redacted}\n`;
  let next = `${header}${existing ? `${existing}\n` : ""}${entry}`;

  // Prune dalla testa (note più vecchie) se supera il tetto, preservando l'header.
  if (Buffer.byteLength(next, "utf8") > MAX_MEMORY_BYTES) {
    const lines = next.split("\n").filter((l) => l.startsWith("- ["));
    const kept: string[] = [];
    let bytes = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(lines[i] + "\n", "utf8");
      if (bytes + lineBytes > MAX_MEMORY_BYTES - 64) break;
      kept.unshift(lines[i]);
      bytes += lineBytes;
    }
    next = `# Memoria persistente di Horus\n\n${kept.join("\n")}\n`;
  }

  await fs.writeFile(memoryFile, next, "utf8");
  return redacted;
}

/**
 * Carica il contenuto della memoria di Horus (stringa vuota se il file non
 * esiste o non è leggibile). Mai lancia: la mancanza di memoria non è un errore.
 */
export async function loadHorusMemory(): Promise<string> {
  try {
    const content = await fs.readFile(getHorusMemoryPath(), "utf8");
    return content.trim();
  } catch {
    return "";
  }
}
