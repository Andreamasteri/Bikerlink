// Task #5322 — Fase di COMPOSIZIONE domanda per Ares (solo handoff admin→Ares).
// Prima di inoltrare ad Ares, Bowie sintetizza il contesto della conversazione in
// UNA domanda tecnica unica, completa e strutturata (via Ollama locale). Ares
// riceve solo quella domanda, così NON risponde "a metà" con Bowie che parla al
// posto suo. Se Ollama locale è offline/fallisce, si degrada al messaggio grezzo
// dell'admin (nessun blocco, nessun fallback cloud).
import { isOllamaConfigured, isOllamaReachable, callOllamaChat } from "../../lib/ollama-client";

const ARES_QUESTION_MAX_CHARS = 1200;

export async function composeAresQuestion(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  latestMessage: string,
): Promise<string> {
  const fallback = latestMessage.trim();
  try {
    if (!isOllamaConfigured || !(await isOllamaReachable("bowie"))) return fallback;
    const transcript = [...history, { role: "user" as const, content: latestMessage }]
      .slice(-12)
      .map((m) => `${m.role === "user" ? "ADMIN" : "ASSISTENTE"}: ${m.content}`)
      .join("\n");
    const prompt = `Sei Bowie e stai per passare la parola ad Ares, l'AI di diagnostica tecnica.
Leggi la conversazione qui sotto e formula UNA singola domanda tecnica per Ares:
completa, autosufficiente e ben strutturata (includi il contesto rilevante e cosa
serve sapere). NON rispondere tu, NON aggiungere convenevoli: restituisci SOLO la
domanda da inoltrare ad Ares, in italiano, concisa.

CONVERSAZIONE:
${transcript}

DOMANDA PER ARES:`;
    const composed = await callOllamaChat(prompt, undefined, {
      persona: "bowie",
      temperature: 0.3,
      numPredict: 400,
    });
    const clean = (composed ?? "").trim();
    if (!clean) return fallback;
    return clean.length > ARES_QUESTION_MAX_CHARS ? clean.slice(0, ARES_QUESTION_MAX_CHARS) : clean;
  } catch (err) {
    console.warn("[assistant] composizione domanda Ares fallita, uso il messaggio grezzo:", (err as Error).message);
    return fallback;
  }
}
