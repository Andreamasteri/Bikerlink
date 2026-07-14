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

export type AiPersonaId = "bowie" | "horus" | "ares" | "quebracho";

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
  quebracho: {
    id: "quebracho",
    name: "Quebracho",
    role: "coordinatore/regista degli agenti AI di BikerLink",
    blurb: "affabile e affettuoso, sempre pronto a partire; tiene le fila degli altri agenti",
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
    quebracho:
      "Stai parlando con un amministratore che ti ha invocato tramite Bowie. Sei il coordinatore: tieni le fila degli altri agenti (Bowie, Horus, Ares), fai il punto e proponi come muoversi. Per le funzioni dell'app rivolte all'utente l'interlocutore è Bowie; per i percorsi è Horus; per la diagnostica tecnica c'è Ares.",
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

// ── Task #4 — Comando admin: handoff Bowie → Quebracho ("chiama Quebracho") ────
//
// Analogo a parseAresInvocation. Riconosce il nome "quebracho" o il nomignolo
// "qq" (parola intera) insieme a un verbo di invocazione o a un contesto di
// coordinamento. Volutamente stretto per non dirottare menzioni di sfuggita.

export function parseQuebrachoInvocation(message: string): boolean {
  const m = (message ?? "").toLowerCase();
  const hasName = /\bquebracho\b/.test(m) || /\bqq\b/.test(m);
  if (!hasName) return false;
  return (
    /\b(chiam\w*|passa\w*|attiv\w*|interpell\w*|coinvolg\w*|sent[io]|invoc\w*|vogli\w*|fammi)\b[\s\w']*\b(quebracho|qq)\b/.test(m) ||
    /\bparl\w+\s+con\s+(quebracho|qq)\b/.test(m) ||
    /\b(quebracho|qq)\b[\s\w']*\b(coordin\w+|regist\w+|agent\w+|orchestr\w+)/.test(m)
  );
}

// ── Task #5322 — Invocazione esplicita di Horus per nome ──────────────────────
//
// Analogo a `parseAresInvocation` ma per Horus: riconosce quando l'utente chiede
// ESPLICITAMENTE di parlare con Horus ("chiama Horus", "passami Horus", "voglio
// parlare con Horus"), a prescindere dall'intento di percorso. È volutamente
// stretto: richiede il nome "horus" + un verbo di invocazione o un contesto
// percorso, per non dirottare frasi che citano Horus di sfuggita.

export function parseHorusInvocation(message: string): boolean {
  const m = (message ?? "").toLowerCase();
  if (!m.includes("horus")) return false;
  return (
    /\b(chiam\w*|passa\w*|attiv\w*|interpell\w*|coinvolg\w*|sent[io]|invoc\w*|vogli\w*|fammi)\b[\s\w']*\bhorus\b/.test(m) ||
    /\bparl\w+\s+con\s+horus\b/.test(m) ||
    /\bhorus\b[\s\w']*\b(percors\w+|itinerari\w+|navigaz\w+|strad\w+|giro|giri)/.test(m)
  );
}

// ── Task #5322 — Marcatore di congedo strutturato interno ─────────────────────
//
// Una persona non-Bowie (Horus/Ares) emette questo marcatore a FINE compito per
// segnalare al backend che il turno successivo deve tornare a Bowie. Il backend
// lo riconosce, resetta lo stato "persona attiva" e lo RIMUOVE dal testo prima
// di mostrarlo all'utente (sia nel percorso normale che in streaming SSE).
export const HANDOFF_BACK_TO_BOWIE = "[[HANDOFF_BACK_TO_BOWIE]]";

/**
 * Rimuove il marcatore di congedo dal testo completo e segnala se era presente.
 * Usato dal percorso NON-streaming (buffer completo) e per il valore di ritorno.
 */
export function stripHandoffMarker(text: string): { text: string; farewell: boolean } {
  if (!text) return { text: text ?? "", farewell: false };
  const farewell = text.includes(HANDOFF_BACK_TO_BOWIE);
  if (!farewell) return { text, farewell: false };
  const cleaned = text
    .split(HANDOFF_BACK_TO_BOWIE)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { text: cleaned, farewell: true };
}

/**
 * Filtro di streaming che rimuove il marcatore di congedo dai delta man mano che
 * arrivano, trattenendo una coda di (markerLen-1) caratteri per gestire i
 * marcatori spezzati tra due chunk. Analogo al security-filter: `push` emette il
 * testo sicuro, `flush` rilascia la coda residua a fine stream.
 */
export function createHandoffMarkerFilter() {
  const marker = HANDOFF_BACK_TO_BOWIE;
  let pending = "";
  let detected = false;

  const drainCompleteMarkers = () => {
    let idx: number;
    while ((idx = pending.indexOf(marker)) >= 0) {
      detected = true;
      pending = pending.slice(0, idx) + pending.slice(idx + marker.length);
    }
  };

  return {
    get detected(): boolean {
      return detected;
    },
    push(delta: string, emit: (safe: string) => void): void {
      pending += delta;
      drainCompleteMarkers();
      // Trattieni gli ultimi (markerLen-1) char: potrebbero essere l'inizio di un
      // marcatore ancora incompleto che si completerà nel chunk successivo.
      const safeLen = Math.max(0, pending.length - (marker.length - 1));
      if (safeLen > 0) {
        emit(pending.slice(0, safeLen));
        pending = pending.slice(safeLen);
      }
    },
    flush(emit: (safe: string) => void): void {
      drainCompleteMarkers();
      if (pending) {
        emit(pending);
        pending = "";
      }
    },
  };
}

// ── Task #5322 — Risoluzione deterministica della persona del turno ───────────
//
// Combina l'invocazione esplicita nel messaggio con lo stato "persona attiva"
// persistito (stickiness). Priorità (dalla più alta):
//   1. Invocazione esplicita di Ares (solo admin).
//   2. Invocazione esplicita di Quebracho (solo admin).
//   3. Invocazione esplicita di Horus per nome.
//   4. Intento di percorso/itinerario → Horus.
//   5. Stickiness: resta sulla persona attiva non-Bowie del turno precedente.
//   6. Default → Bowie.
export type PersonaResolutionReason =
  | "explicit-ares"
  | "explicit-quebracho"
  | "explicit-horus"
  | "route-intent"
  | "sticky"
  | "default";

export interface PersonaResolution {
  persona: AiPersonaId;
  reason: PersonaResolutionReason;
}

export function resolveTurnPersona(input: {
  message: string;
  isAdmin: boolean;
  activePersona?: AiPersonaId | null;
}): PersonaResolution {
  const { message, isAdmin } = input;
  const active = input.activePersona ?? null;

  // 1. Ares — solo admin, massima priorità (comando operativo esplicito).
  if (isAdmin && parseAresInvocation(message)) {
    return { persona: "ares", reason: "explicit-ares" };
  }
  // 2. Quebracho — solo admin (coordinatore/regista, invocazione esplicita).
  if (isAdmin && parseQuebrachoInvocation(message)) {
    return { persona: "quebracho", reason: "explicit-quebracho" };
  }
  // 3. Horus per nome.
  if (parseHorusInvocation(message)) {
    return { persona: "horus", reason: "explicit-horus" };
  }
  // 4. Intento di percorso → Horus.
  if (classifyRoutingIntent(message)) {
    return { persona: "horus", reason: "route-intent" };
  }
  // 5. Stickiness sulla persona attiva non-Bowie.
  if (active && active !== "bowie") {
    // Difesa in profondità: Ares e Quebracho restano appiccicati SOLO per gli admin.
    if ((active === "ares" || active === "quebracho") && !isAdmin) {
      return { persona: "bowie", reason: "default" };
    }
    return { persona: active, reason: "sticky" };
  }
  // 5. Default.
  return { persona: "bowie", reason: "default" };
}
