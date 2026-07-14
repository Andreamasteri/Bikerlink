// Task #4 — Fase di COMPOSIZIONE domanda per Quebracho (handoff → Quebracho).
// Prima di inoltrare a Quebracho (il coordinatore), Bowie sintetizza il contesto
// della conversazione in UNA richiesta unica, completa e strutturata (via Ollama
// locale). Quebracho riceve solo quella, così NON risponde "a metà" con Bowie che
// parla al posto suo. Se Ollama locale è offline/fallisce, si degrada al messaggio
// grezzo (nessun blocco, nessun fallback cloud).
import { isOllamaConfigured, isOllamaReachable, callOllamaChat } from "../../lib/ollama-client";

const QUEBRACHO_QUESTION_MAX_CHARS = 1200;

export async function composeQuebrachoQuestion(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestMessage: string,
): Promise<string> {
  const fallback = latestMessage.trim();
  try {
    if (!isOllamaConfigured || !(await isOllamaReachable("bowie"))) return fallback;
    const transcript = [...history, { role: "user" as const, content: latestMessage }]
      .slice(-12)
      .map((m) => `${m.role === "user" ? "UTENTE" : "ASSISTENTE"}: ${m.content}`)
      .join("\n");
    const prompt = `Sei Bowie e stai per passare la parola a Quebracho, il coordinatore
degli agenti AI di BikerLink. Leggi la conversazione qui sotto e formula UNA singola
richiesta per Quebracho: completa, autosufficiente e ben strutturata (includi il
contesto rilevante e cosa serve decidere/coordinare). NON rispondere tu, NON
aggiungere convenevoli: restituisci SOLO la richiesta da inoltrare a Quebracho, in
italiano, concisa.

CONVERSAZIONE:
${transcript}

RICHIESTA PER QUEBRACHO:`;
    const composed = await callOllamaChat(prompt, undefined, {
      persona: "bowie",
      temperature: 0.3,
      numPredict: 400,
    });
    const clean = (composed ?? "").trim();
    if (!clean) return fallback;
    return clean.length > QUEBRACHO_QUESTION_MAX_CHARS ? clean.slice(0, QUEBRACHO_QUESTION_MAX_CHARS) : clean;
  } catch (err) {
    console.warn("[assistant] composizione domanda Quebracho fallita, uso il messaggio grezzo:", (err as Error).message);
    return fallback;
  }
}
