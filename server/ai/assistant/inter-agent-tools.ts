/**
 * Tool inter-agente + memoria Horus + revisione piani — Task #50
 *
 * A differenza dei tool "base" in ./tools.ts, questi NON passano da `guardTool`:
 * consultano altre AI (Horus/Quebracho/Ares) o l'agente di revisione, che girano
 * su modelli pesanti self-hosted con latenze di decine di secondi. Il tetto di 8s
 * di `guardTool` li ucciderebbe sempre. Ognuno gestisce il proprio timeout
 * internamente (nei client) e ritorna un testo di cortesia in caso di errore,
 * così il modello non riceve mai uno stack trace.
 *
 * ⚠️ Questo modulo NON deve importare da ./tools.ts: tools.ts ri-esporta questi
 * simboli per retro-compatibilità, quindi un import inverso creerebbe un ciclo.
 */

import { tool } from "ai";
import { z } from "zod";
import { askHorus, askQuebracho, askAres } from "./inter-agent";
import { appendHorusNote } from "./horus-memory";
import { reviewTaskPlan, type ReviewAgent } from "./task-review";
import { searchNadir } from "../nadir";

export interface InterAgentToolContext {
  /** Sessione admin: sblocca call_ares (solo admin). */
  isAdmin: boolean;
  /** History conversazionale per comporre il contesto tecnico di Ares. */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Ultimo messaggio utente del turno. */
  latestMessage: string;
  signal?: AbortSignal;
}

/** Compone un prompt tecnico per Ares dal contesto conversazionale quando l'admin
 *  non specifica un focus esplicito (BikerLink non ha un "backlog di supervisione
 *  tecnica" formale: usiamo la conversazione corrente come voce di lavoro). */
function composeAresContext(history: Array<{ role: string; content: string }>, latestMessage: string): string {
  const recent = history
    .slice(-4)
    .map((t) => `${t.role === "user" ? "Utente" : "Assistente"}: ${t.content}`)
    .join("\n");
  return [
    "Attivazione di Ares per supervisione tecnica sulla questione corrente.",
    recent ? `Contesto recente della conversazione:\n${recent}` : "",
    `Richiesta corrente: ${latestMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Costruisce i tre tool inter-agente disponibili SOLO quando la persona attiva è
 *  Bowie. `call_ares` è incluso solo in sessioni admin. */
export function buildBowieInterAgentTools(ctx: InterAgentToolContext): Record<string, unknown> {
  const tools: Record<string, unknown> = {
    call_horus: tool({
      description:
        "Consulta Horus, lo specialista di percorsi, itinerari e navigazione moto, per una domanda " +
        "specifica a metà conversazione. Ritorna la sua risposta perché tu la incorpori nella tua, " +
        "senza passargli la conversazione. Usalo quando l'utente chiede il parere di Horus o la " +
        "questione riguarda routing/itinerari/percorsi.",
      inputSchema: z.object({
        prompt: z.string().min(1).describe("La domanda da porre a Horus, chiara e autosufficiente."),
      }),
      execute: async (input: { prompt: string }) => {
        const r = await askHorus(input.prompt, { signal: ctx.signal });
        return { agent: "horus", ok: r.ok, response: r.text };
      },
    }),
    call_quebracho: tool({
      description:
        "Chiede un parere a Quebracho, il coordinatore/regista degli agenti AI, a metà conversazione. " +
        "Ritorna il suo punto di vista perché tu lo incorpori nella tua risposta. Usalo quando l'utente " +
        "chiede cosa ne pensa Quebracho o vuole coinvolgerlo.",
      inputSchema: z.object({
        message: z.string().min(1).describe("Il messaggio/domanda da inoltrare a Quebracho."),
      }),
      execute: async (input: { message: string }) => {
        const r = await askQuebracho(input.message, { signal: ctx.signal });
        return { agent: "quebracho", ok: r.ok, response: r.text };
      },
    }),
  };

  if (ctx.isAdmin) {
    tools.call_ares = tool({
      description:
        "Attiva Ares, l'AI di diagnostica/supervisione tecnica (solo admin), sulla questione tecnica " +
        "corrente. Ares analizza e propone, non applica mai modifiche. Ritorna la sua analisi perché tu " +
        "la incorpori. Usalo quando un admin chiede di chiamare/attivare Ares.",
      inputSchema: z.object({
        focus: z
          .string()
          .optional()
          .describe("Aspetto tecnico specifico su cui attivare Ares; se assente usa il contesto della conversazione."),
      }),
      execute: async (input: { focus?: string }) => {
        const prompt = input.focus?.trim() || composeAresContext(ctx.history, ctx.latestMessage);
        const r = await askAres(prompt, { signal: ctx.signal });
        return { agent: "ares", ok: r.ok, response: r.text };
      },
    });
  }

  return tools;
}

/** Tool `remember_note`: solo Horus può salvare note nella memoria persistente. */
export function buildRememberNoteTool(isAdmin: boolean): Record<string, unknown> {
  // Sicurezza: la memoria di Horus è GLOBALE (condivisa fra tutte le sessioni) e
  // viene iniettata nel system prompt di ogni futura conversazione con Horus. Per
  // evitare che un utente qualsiasi avveleni il contesto di altri o vi immetta
  // PII/segreti, la SCRITTURA è riservata alle sessioni admin. In sessioni
  // non-admin il tool non viene nemmeno esposto al modello.
  if (!isAdmin) return {};
  return {
    remember_note: tool({
      description:
        "Salva una nota nella tua memoria persistente (solo Horus, solo admin). La nota verrà " +
        "ricordata automaticamente in tutte le conversazioni future. Usalo quando l'admin ti chiede " +
        "di ricordare, memorizzare, annotare o tenere a mente qualcosa. Non salvare mai segreti o PII.",
      inputSchema: z.object({
        note: z.string().min(1).describe("La nota da ricordare, chiara e autosufficiente."),
      }),
      execute: async (input: { note: string }) => {
        try {
          const saved = await appendHorusNote(input.note, new Date().toISOString());
          return { ok: true, saved };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    }),
  };
}

/** Tool `review_task_plan`: disponibile a TUTTE le persone. Instrada la revisione
 *  all'agente della persona invocante. Non modifica mai nulla.
 *  `allowFileRead` (default false lato tool) abilita la lettura di un `filePath`
 *  dal disco: va concesso SOLO in sessioni admin per evitare la divulgazione di
 *  file arbitrari. In sessioni non-admin resta ammessa solo la revisione di un
 *  testo incollato (`content`). */
export function buildReviewTaskPlanTool(
  agent: ReviewAgent,
  opts: { signal?: AbortSignal; allowFileRead?: boolean } = {},
): Record<string, unknown> {
  const { signal, allowFileRead = false } = opts;
  return {
    review_task_plan: tool({
      description:
        "Revisiona un task plan (dato un percorso file o un testo) PRIMA che venga eseguito e produci " +
        "una review strutturata in italiano (Scope, Rischi, Step mancanti, Contraddizioni, Out of scope, " +
        "Giudizio finale). Segnala i file citati nel piano che non esistono nel repository. Non modifica " +
        "mai nulla: propone soltanto. Usalo quando ti si chiede di revisionare/rivedere/analizzare un " +
        "piano o un task plan.",
      inputSchema: z.object({
        filePath: z
          .string()
          .optional()
          .describe("Percorso del file di task plan da revisionare (es. .local/tasks/task-50.md)."),
        content: z.string().optional().describe("Testo del task plan, alternativo a filePath."),
      }),
      execute: async (input: { filePath?: string; content?: string }) => {
        const r = await reviewTaskPlan({
          filePath: input.filePath,
          content: input.content,
          agent,
          signal,
          allowFileRead,
        });
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, review: r.review, missingFiles: r.missingFiles ?? [] };
      },
    }),
  };
}

/**
 * Tool `search_manual` — consulta Nadir, il MOTORE DI RICERCA SEMANTICA (Task #75).
 *
 * Agent-neutral: identico per Bowie, Horus (e, via injection pre-composizione, per
 * Quebracho — vedi agent.ts). NON è un default silenzioso: la selezione contestuale
 * lo allega SOLO quando il messaggio contiene un cue esplicito di richiamo semantico
 * (SEARCH_MANUAL_RE in tool-calling.ts). Ritorna frammenti ordinati con origine
 * (manual/conversation/comment) e punteggio di similarità.
 */
export function buildSearchManualTool(
  opts: { signal?: AbortSignal; requesterId?: string | null; includeAllUsers?: boolean } = {},
): Record<string, unknown> {
  void opts.signal; // searchNadir gestisce internamente latenza/errori
  // SICUREZZA (Task #75): l'accesso ai frammenti di conversazione (privati) è
  // scoping-ato al richiedente. Bowie/Horus per un utente normale passano il suo
  // userId (vede solo le SUE chat); in contesto admin `includeAllUsers` sblocca tutti.
  const requesterId = opts.requesterId ?? null;
  const includeAllUsers = opts.includeAllUsers ?? false;
  return {
    search_manual: tool({
      description:
        "Cerca per SIGNIFICATO (non per parole esatte) nella base di conoscenza Nadir: il manuale " +
        "scritto dagli admin, le conversazioni AI recenti e i commenti recenti degli utenti. Ritorna i " +
        "frammenti più pertinenti con la loro origine e un punteggio di similarità, perché tu li " +
        "incorpori nella risposta. Usalo quando ti si chiede cosa dice il manuale, cosa ci si era detti, " +
        "se ne avevate già parlato, o di cercare nella knowledge base.",
      inputSchema: z.object({
        query: z.string().min(1).describe("La domanda o il concetto da cercare per significato."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .nullable()
          .describe("Numero massimo di frammenti da restituire (default 5)."),
      }),
      execute: async (input: { query: string; limit: number | null }) => {
        try {
          const result = await searchNadir(input.query, input.limit ?? 5, {
            requesterId,
            includeAllUsers,
          });
          return {
            ok: true,
            model: result.model,
            fragments: result.fragments.map((f) => ({
              origin: f.origin,
              similarity: Number(f.similarity.toFixed(4)),
              text: f.text,
            })),
          };
        } catch (err) {
          return { ok: false, error: (err as Error)?.message ?? String(err) };
        }
      },
    }),
  };
}
