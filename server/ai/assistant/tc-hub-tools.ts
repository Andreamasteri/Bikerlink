/**
 * Tool AI verso l'ai-hub del ThinkCentre — Task #153
 *
 * Espone agli agenti (Bowie, Horus) i tool di file sharing e monitor VRAM
 * dell'ai-hub, condiviso con BikerBlog e servito su `{AI_HUB_URL}` (nginx →
 * 127.0.0.1:4405 sul TC). Tutti i file vivono in `~/agent-shared/` sul TC.
 *
 * Come i tool inter-agente (./inter-agent-tools.ts), questi NON passano da
 * `guardTool` di ./tools.ts: il client (server/lib/ai-hub-client.ts) impone già
 * il proprio timeout (8s) e non lancia mai — ogni errore rientra come
 * `{ ok: false, error }`. Se l'hub è irraggiungibile (isHubAvailable() === false)
 * i tool rispondono con un messaggio esplicito senza nemmeno tentare la rete.
 *
 * Scoping per persona (deciso in agent.ts, non qui):
 *   - read_file / list_files  → tutti gli agenti con tool-calling nativo (Bowie, Horus)
 *   - save_file               → solo Horus (Bowie non deve scrivere file arbitrari)
 *   - check_vram_usage        → solo Horus (uso amministrativo, pre-load modelli)
 */

import { tool } from "ai";
import { z } from "zod";
import { hubGet, hubPost, isHubAvailable } from "../../lib/ai-hub-client";

const HUB_UNAVAILABLE = { ok: false as const, error: "TC ai-hub non disponibile" };

/**
 * Difesa in profondità contro il path traversal lato client: l'ai-hub confina
 * comunque le operazioni alla root `~/agent-shared/`, ma qui rifiutiamo subito
 * i path che tentano di uscirne, così il modello riceve un errore chiaro senza
 * un round-trip inutile.
 */
function isSafeRelativePath(path: string): boolean {
  const p = (path ?? "").trim();
  if (p.startsWith("/") || p.includes("..") || p.includes("\0")) return false;
  return true;
}

/**
 * Tool di file sharing verso l'ai-hub. `includeWrite` aggiunge `save_file`
 * (riservato agli agenti autorizzati a scrivere). `read_file` e `list_files`
 * sono sempre inclusi.
 */
export function buildHubFileTools(opts: { includeWrite: boolean }): Record<string, unknown> {
  const tools: Record<string, unknown> = {
    read_file: tool({
      description:
        "Legge un file dalla cartella condivisa del TC (~/agent-shared/), accessibile a tutti gli " +
        "agenti AI di BikerLink e BikerBlog. Usa path relativi (es. 'nadir/note.md').",
      inputSchema: z.object({
        path: z.string().min(1).describe("Path relativo del file da leggere."),
      }),
      execute: async (input: { path: string }) => {
        if (!isHubAvailable()) return HUB_UNAVAILABLE;
        if (!isSafeRelativePath(input.path)) return { ok: false, error: "Path non valido (nessun path traversal)." };
        return hubGet("/files/read", { path: input.path });
      },
    }),
    list_files: tool({
      description:
        "Elenca i file in una directory della cartella condivisa del TC (~/agent-shared/). " +
        "Path relativo opzionale (default: root della cartella condivisa).",
      inputSchema: z.object({
        path: z.string().nullable().describe("Path relativo della directory (default: root)."),
      }),
      execute: async (input: { path: string | null }) => {
        if (!isHubAvailable()) return HUB_UNAVAILABLE;
        const path = input.path ?? "";
        if (path && !isSafeRelativePath(path)) return { ok: false, error: "Path non valido (nessun path traversal)." };
        return hubGet("/files/list", { path });
      },
    }),
  };

  if (opts.includeWrite) {
    tools.save_file = tool({
      description:
        "Salva un file nella cartella condivisa del TC (~/agent-shared/), visibile a tutti gli agenti " +
        "AI di entrambi i progetti. Usa path relativi (es. 'nadir/note.md', 'docs/analisi.md'). " +
        "Accesso limitato alla root condivisa, nessun path traversal.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Path relativo nella cartella condivisa."),
        content: z.string().describe("Contenuto testuale del file."),
      }),
      execute: async (input: { path: string; content: string }) => {
        if (!isHubAvailable()) return HUB_UNAVAILABLE;
        if (!isSafeRelativePath(input.path)) return { ok: false, error: "Path non valido (nessun path traversal)." };
        return hubPost("/files/write", { path: input.path, content: input.content });
      },
    });
  }

  return tools;
}

/** Tool `check_vram_usage` — monitor VRAM GPU del TC via ai-hub (GET /vram). */
export function buildCheckVramTool(): Record<string, unknown> {
  return {
    check_vram_usage: tool({
      description:
        "Legge l'utilizzo attuale e il picco 24h della VRAM GPU del ThinkCentre. " +
        "Utile prima di caricare un modello pesante.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!isHubAvailable()) return HUB_UNAVAILABLE;
        return hubGet("/vram");
      },
    }),
  };
}
