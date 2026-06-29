// Task #5197 — Roster delle AI BikerLink (coscienza reciproca + delega).
//
// BikerLink ha TRE AI, ognuna con un ruolo distinto:
//   - Bowie  (OLLAMA_*, ThinkCentre)  — assistente in-app, ENTRY POINT.
//   - Horus  (OLLAMA_*, ThinkCentre)  — specialista percorsi/navigazione.
//   - Ares   (DIAG_OLLAMA_*, PC fisso) — AI di diagnostica tecnica, SOLO admin.
//
// Questo modulo è la SINGOLA fonte di verità per:
//   - i metadati di ogni persona (nome, ruolo, tono),
//   - il blocco "LE ALTRE AI" iniettato nei system prompt (coscienza reciproca),
//   - la classificazione dell'intento di handoff (Bowie → Horus),
//   - il riconoscimento del comando admin "chiama Ares" (Bowie → Ares).
//
// Nessun secret qui dentro: solo testo/regole. I nomi delle variabili d'ambiente
// (OLLAMA_*, DIAG_OLLAMA_*) NON sono segreti, i loro VALORI sì (mai stampati).

export type AiPersonaId = "bowie" | "horus" | "ares";

export interface AiPersona {
  id: AiPersonaId;
  /** Nome proprio mostrato all'utente. */
  name: string;
  /** Ruolo sintetico (una riga). */
  role: string;
  /** Come si presenta / tono di voce. */
  blurb: string;
  /** true se raggiungibile solo dagli amministratori. */
  adminOnly: boolean;
}

export const AI_ROSTER: Record<AiPersonaId, AiPersona> = {
  bowie: {
    id: "bowie",
    name: "Bowie",
    role: "assistente dell'app BikerLink (punto di ingresso)",
    blurb: "lo spirito del girovago: caldo, simpatico e diretto",
    adminOnly: false,
  },
  horus: {
    id: "horus",
    name: "Horus",
    role: "specialista di percorsi, itinerari e navigazione moto",
    blurb: "«io vedo tutto, io trovo tutto»: sicuro, preciso, un filo solenne",
    adminOnly: false,
  },
  ares: {
    id: "ares",
    name: "Ares",
    role: "AI di diagnostica tecnica della piattaforma",
    blurb: "diretto, tecnico, senza fronzoli",
    adminOnly: true,
  },
};

/**
 * Costruisce il blocco "LE ALTRE AI" da iniettare nel system prompt della
 * persona `selfId`. Rende ogni AI cosciente delle altre e di quando delegare.
 */
export function renderRosterBlock(selfId: AiPersonaId): string {
  const others = (Object.keys(AI_ROSTER) as AiPersonaId[])
    .filter((id) => id !== selfId)
    .map((id) => {
      const p = AI_ROSTER[id];
      const access = p.adminOnly ? " (solo amministratori)" : "";
      return `- ${p.name}: ${p.role}${access}. Tono: ${p.blurb}.`;
    })
    .join("\n");

  const rules: Record<AiPersonaId, string> = {
    bowie:
      "Quando l'utente chiede di pianificare/trovare un PERCORSO, un ITINERARIO o un giro in moto, l'app passa automaticamente la parola a Horus: non improvvisare tu il percorso, lascia che sia Horus a rispondere. Ares è uno strumento tecnico riservato agli amministratori: se un utente normale lo nomina, spiega con gentilezza che non è disponibile per lui.",
    horus:
      "Tu sei subentrato a Bowie perché l'utente ha chiesto un percorso/itinerario. Presentati brevemente la prima volta che intervieni, poi concentrati sul percorso. Per domande generiche sull'app (non di navigazione) rimanda l'utente a Bowie.",
    ares:
      "Stai parlando con un amministratore che ti ha invocato tramite Bowie. Concentrati su diagnosi tecnica, stato dei servizi e troubleshooting. Per le funzioni dell'app rivolte all'utente, l'interlocutore è Bowie; per i percorsi è Horus.",
  };

  return `LE ALTRE AI DI BIKERLINK (sei consapevole di loro):
${others}
REGOLA DI DELEGA: ${rules[selfId]}`;
}

// ── Intent: handoff Bowie → Horus (richiesta di percorso/itinerario) ──────────
//
// Classificatore euristico (keyword) deterministico: zero costo, zero latenza,
// nessuna chiamata AI extra. È volutamente CONSERVATIVO — meglio un falso
// negativo (risponde Bowie a una domanda di percorso) che un falso positivo
// (Horus dirotta una domanda generica). Le domande su statistiche/storico
// ("quante strade ho percorso", "quanti km ho fatto") NON sono handoff.

const ROUTE_NOUNS = /\b(percors\w+|giro|gir[ie]|strad\w+|curv\w+|panoramic\w+|tapp\w+|destinazion\w+|tragitt\w+)\b/;
const PLAN_VERBS = /\b(pianific\w+|organizz\w+|consigli\w+|sugger\w+|trov\w+|port\w+|accompagn\w+|guid\w+)\b/;

export function classifyRoutingIntent(message: string): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m.trim()) return false;

  // Escludi domande su statistiche/storico ("quante strade ho percorso").
  if (/\b(quant[ieo])\b/.test(m) && /\b(ho|hai|abbiamo|ho\s+fatto)\b/.test(m)) return false;

  // Nomi forti che implicano una pianificazione di viaggio.
  if (/\b(itinerari[oi]|tragitt[oi]|rotta\b|navigazione)\b/.test(m)) return true;

  // Verbo di pianificazione + sostantivo di percorso.
  if (PLAN_VERBS.test(m) && ROUTE_NOUNS.test(m)) return true;

  // Pattern "come arrivo/raggiungo a …".
  if (/\bcome\s+(ci\s+)?(arriv|raggiung|vad|and)\w*\b/.test(m)) return true;

  // "da X a/verso/fino a Y" in contesto di percorso.
  if (/\bda\s+\p{L}+.*\b(a|verso|fino\s+a)\s+\p{L}+/u.test(m) && ROUTE_NOUNS.test(m)) return true;

  // "strade panoramiche/curve/belle" — richiesta tipica di Horus.
  if (/\bstrad\w+\s+(panoramic\w+|curv\w+|bell\w+|tortuos\w+)/.test(m)) return true;

  return false;
}

// ── Comando admin: handoff Bowie → Ares ("chiama Ares", "passami Ares") ───────

export function parseAresInvocation(message: string): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m.includes("ares")) return false;
  return (
    /\b(chiam\w*|passa\w*|attiv\w*|interpell\w*|coinvolg\w*|sent[io]|invoc\w*)\b[\s\w']*\bares\b/.test(m) ||
    /\bparl\w+\s+con\s+ares\b/.test(m) ||
    /\bares\b[\s\w']*\b(diagnos\w+|tecnic\w+)/.test(m)
  );
}
