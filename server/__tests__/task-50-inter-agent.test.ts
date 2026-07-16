// Task #50 — Test degli helper puri: selezione contestuale dei nuovi tool,
// estrazione/verifica riferimenti a file, memoria persistente di Horus, e
// preflight della revisione piani (nessun contatto col modello).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { selectToolNamesForMessage } from "../ai/assistant/tool-calling";
import {
  extractReferencedFiles,
  checkReferencedFiles,
  reviewTaskPlan,
  resolveWorkspacePath,
} from "../ai/assistant/task-review";
import { appendHorusNote, loadHorusMemory, getHorusMemoryPath } from "../ai/assistant/horus-memory";
import { createTimeoutSignal } from "../ai/assistant/inter-agent";
import { buildRememberNoteTool } from "../ai/assistant/tools";

// Set completo di tool per persona (fonte di verità per gli helper puri).
const BOWIE_TOOLS = [
  "getWeather",
  "getBikerStats",
  "getThinkCentreStatus",
  "getNearbyEvents",
  "getUserPlannedRoutes",
  "webSearch",
  "call_horus",
  "call_quebracho",
  "call_ares",
  "review_task_plan",
];
const HORUS_TOOLS = ["getWeather", "getThinkCentreStatus", "getNearbyEvents", "webSearch", "remember_note", "review_task_plan"];

const CAPS = { webSearchAvailable: true, hasUserId: true };

// ---------------------------------------------------------------------------
// Selezione contestuale dei nuovi tool
// ---------------------------------------------------------------------------

describe("Task #50 — selectToolNamesForMessage (tool inter-agente)", () => {
  it("messaggio semplice → nessun tool", () => {
    expect(selectToolNamesForMessage(BOWIE_TOOLS, "ciao come stai?", CAPS)).toEqual([]);
  });

  it("'chiedi a Horus...' → call_horus", () => {
    const r = selectToolNamesForMessage(BOWIE_TOOLS, "chiedi a Horus perché ha scelto questa strada", CAPS);
    expect(r).toContain("call_horus");
  });

  it("'cosa ne pensa Quebracho' → call_quebracho", () => {
    const r = selectToolNamesForMessage(BOWIE_TOOLS, "cosa ne pensa Quebracho di questa idea?", CAPS);
    expect(r).toContain("call_quebracho");
  });

  it("'chiama Ares' → call_ares (se il tool è disponibile per la persona)", () => {
    const r = selectToolNamesForMessage(BOWIE_TOOLS, "chiama Ares e fagli analizzare il routing", CAPS);
    expect(r).toContain("call_ares");
  });

  it("call_ares NON compare se non è tra i tool disponibili (non-admin)", () => {
    const withoutAres = BOWIE_TOOLS.filter((t) => t !== "call_ares");
    const r = selectToolNamesForMessage(withoutAres, "chiama Ares", CAPS);
    expect(r).not.toContain("call_ares");
  });

  it("'ricorda che...' → remember_note (persona Horus)", () => {
    const r = selectToolNamesForMessage(HORUS_TOOLS, "ricorda che preferisco strade panoramiche", CAPS);
    expect(r).toContain("remember_note");
  });

  it("'revisiona il piano' → review_task_plan", () => {
    const r = selectToolNamesForMessage(BOWIE_TOOLS, "revisiona il piano del task 50", CAPS);
    expect(r).toContain("review_task_plan");
  });

  it("remember_note NON compare per Bowie (non è tra i suoi tool)", () => {
    const r = selectToolNamesForMessage(BOWIE_TOOLS, "ricorda che mi piace guidare la notte", CAPS);
    expect(r).not.toContain("remember_note");
  });
});

// ---------------------------------------------------------------------------
// Estrazione e verifica dei riferimenti a file
// ---------------------------------------------------------------------------

describe("Task #50 — extractReferencedFiles", () => {
  it("estrae i percorsi tra backtick e rimuove il suffisso :riga", () => {
    const plan = [
      "## Relevant files",
      "- `server/ai/assistant/tools.ts`",
      "- `shared/db/ai-assistant.ts:329-346`",
      "- `server/lib/ollama-client.ts:120`",
    ].join("\n");
    expect(extractReferencedFiles(plan)).toEqual([
      "server/ai/assistant/tools.ts",
      "shared/db/ai-assistant.ts",
      "server/lib/ollama-client.ts",
    ]);
  });

  it("ignora i token non-percorso (prosa, comandi con spazi)", () => {
    const plan = "Esegui `npm run lint` e considera la funzione `foo` — vedi `README.md`.";
    expect(extractReferencedFiles(plan)).toEqual(["README.md"]);
  });

  it("deduplica mantenendo l'ordine di prima apparizione", () => {
    const plan = "`a/b.ts` poi `a/b.ts` di nuovo e `c/d.md`";
    expect(extractReferencedFiles(plan)).toEqual(["a/b.ts", "c/d.md"]);
  });
});

describe("Task #50 — checkReferencedFiles", () => {
  it("separa file esistenti e mancanti relativi al cwd", () => {
    const { found, missing } = checkReferencedFiles(
      ["server/ai/assistant/tools.ts", "server/does/not/exist.ts"],
      { cwd: process.cwd() },
    );
    expect(found).toContain("server/ai/assistant/tools.ts");
    expect(missing).toContain("server/does/not/exist.ts");
  });
});

// ---------------------------------------------------------------------------
// Memoria persistente di Horus
// ---------------------------------------------------------------------------

describe("Task #50 — memoria persistente di Horus", () => {
  let tmpDir: string;
  let prevEnv: string | undefined;

  beforeEach(() => {
    prevEnv = process.env.HORUS_MEMORY_FILE;
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "horus-mem-"));
    process.env.HORUS_MEMORY_FILE = path.join(tmpDir, "horus-memory.md");
  });

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.HORUS_MEMORY_FILE;
    else process.env.HORUS_MEMORY_FILE = prevEnv;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("nessun file → memoria vuota", async () => {
    expect(await loadHorusMemory()).toBe("");
  });

  it("appende una nota e la ricarica (persiste tra 'conversazioni')", async () => {
    await appendHorusNote("l'utente preferisce curve e strade panoramiche", "2026-07-15T10:00:00Z");
    const mem = await loadHorusMemory();
    expect(mem).toContain("l'utente preferisce curve e strade panoramiche");
    expect(mem).toContain("2026-07-15T10:00:00Z");
    expect(existsSync(getHorusMemoryPath())).toBe(true);
  });

  it("appende più note in sequenza mantenendole tutte", async () => {
    await appendHorusNote("nota uno", "2026-07-15T10:00:00Z");
    await appendHorusNote("nota due", "2026-07-15T10:05:00Z");
    const mem = await loadHorusMemory();
    expect(mem).toContain("nota uno");
    expect(mem).toContain("nota due");
  });

  it("nota vuota → lancia", async () => {
    await expect(appendHorusNote("   ", "2026-07-15T10:00:00Z")).rejects.toThrow();
  });

  it("nota con un segreto → rifiutata, mai scritta su disco", async () => {
    const secret = "la chiave è sk-abcdefghijklmnopqrstuvwxyz0123456789"; // pragma: allowlist secret
    await expect(appendHorusNote(secret, "2026-07-15T10:00:00Z")).rejects.toThrow(/credenziali|segret/i);
    // Nessun file creato (nessuna scrittura parziale del segreto).
    expect(await loadHorusMemory()).toBe("");
  });

  it("nota con PII (email) → salvata redatta, la PII grezza non compare", async () => {
    const saved = await appendHorusNote("scrivi a mario.rossi@example.com per i dettagli", "2026-07-15T10:00:00Z");
    expect(saved).not.toContain("mario.rossi@example.com");
    const mem = await loadHorusMemory();
    expect(mem).not.toContain("mario.rossi@example.com");
  });
});

describe("Task #50 — remember_note gating admin-only", () => {
  it("sessione non-admin → il tool remember_note NON viene esposto", () => {
    const tools = buildRememberNoteTool(false);
    expect(Object.keys(tools)).not.toContain("remember_note");
  });

  it("sessione admin → il tool remember_note è disponibile", () => {
    const tools = buildRememberNoteTool(true);
    expect(Object.keys(tools)).toContain("remember_note");
  });
});

// ---------------------------------------------------------------------------
// reviewTaskPlan — preflight (nessun contatto col modello)
// ---------------------------------------------------------------------------

describe("Task #50 — reviewTaskPlan preflight", () => {
  it("piano vuoto → errore chiaro, ok=false", async () => {
    const r = await reviewTaskPlan({ content: "   ", agent: "quebracho" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/vuoto/i);
  });

  it("file inesistente → errore chiaro, ok=false", async () => {
    const r = await reviewTaskPlan({ filePath: "does/not/exist-xyz.md", agent: "quebracho" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/non trovato/i);
  });
});

// ---------------------------------------------------------------------------
// Sicurezza — sanitizzazione dei percorsi e gating della lettura da file
// ---------------------------------------------------------------------------

describe("Task #50 — resolveWorkspacePath (anti path traversal)", () => {
  it("percorso relativo dentro la root → ok", () => {
    const r = resolveWorkspacePath("server/ai/assistant/tools.ts");
    expect(r.ok).toBe(true);
  });

  it("percorso assoluto → rifiutato", () => {
    const r = resolveWorkspacePath("/etc/passwd");
    expect(r.ok).toBe(false);
  });

  it("traversal con .. → rifiutato", () => {
    const r = resolveWorkspacePath("../../../../etc/passwd");
    expect(r.ok).toBe(false);
  });
});

describe("Task #50 — reviewTaskPlan protezione lettura file", () => {
  it("percorso assoluto → errore, nessuna lettura", async () => {
    const r = await reviewTaskPlan({ filePath: "/etc/passwd", agent: "quebracho" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/non ammesso/i);
  });

  it("traversal fuori dalla root → errore, nessuna lettura", async () => {
    const r = await reviewTaskPlan({ filePath: "../../etc/passwd", agent: "quebracho" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/non ammesso/i);
  });

  it("allowFileRead=false (sessione non-admin) + filePath → rifiutato, mai letto dal disco", async () => {
    // Anche un file reale del repo non deve essere letto se allowFileRead è false.
    const r = await reviewTaskPlan({
      filePath: "server/ai/assistant/tools.ts",
      agent: "quebracho",
      allowFileRead: false,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/riservata agli amministratori/i);
  });
  // Nota: che `content` inline resti ammesso con allowFileRead=false è verificato
  // in modo deterministico in task-50-review-lock.test.ts (client mockati), qui
  // eviteremmo di contattare un agente reale eventualmente configurato via secret.
});

// ---------------------------------------------------------------------------
// Timeout inter-agente (invariante: ogni consult ha un tetto di durata)
// ---------------------------------------------------------------------------

describe("Task #50 — createTimeoutSignal", () => {
  it("aborta dopo il timeout e segnala timedOut=true", async () => {
    const t = createTimeoutSignal(undefined, 10);
    expect(t.signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 25));
    expect(t.signal.aborted).toBe(true);
    expect(t.timedOut()).toBe(true);
    t.cleanup();
  });

  it("propaga l'abort del chiamante senza marcare timedOut", () => {
    const caller = new AbortController();
    const t = createTimeoutSignal(caller.signal, 10_000);
    caller.abort();
    expect(t.signal.aborted).toBe(true);
    expect(t.timedOut()).toBe(false);
    t.cleanup();
  });

  it("cleanup non lascia il timer a scattare (nessun abort tardivo)", async () => {
    const t = createTimeoutSignal(undefined, 10);
    t.cleanup();
    await new Promise((r) => setTimeout(r, 25));
    expect(t.signal.aborted).toBe(false);
    expect(t.timedOut()).toBe(false);
  });
});
