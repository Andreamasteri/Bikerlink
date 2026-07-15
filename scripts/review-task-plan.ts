/**
 * BikerLink — Revisione one-shot di un task plan (Task #50)
 *
 * Via CLI diretta (indipendente dalla chat) per un admin che vuole lanciare la
 * revisione di un task plan senza passare da una conversazione. Produce la review
 * strutturata su stdout; esce con codice != 0 sui fallimenti (piano vuoto, file
 * inesistente, agente non configurato/raggiungibile, revisione già in corso).
 *
 * L'invariante resta "propone, non applica mai": nessuna scrittura, solo analisi.
 *
 * Uso:
 *   npx tsx scripts/review-task-plan.ts --file .local/tasks/task-50.md
 *   npx tsx scripts/review-task-plan.ts --content "..."
 *   npx tsx scripts/review-task-plan.ts --file <path> --agent quebracho
 *
 * Agenti disponibili: ares (default), quebracho, horus, bowie.
 */
import { fileURLToPath } from "node:url";
import { reviewTaskPlan, type ReviewAgent } from "../server/ai/assistant/task-review";

const VALID_AGENTS: ReviewAgent[] = ["ares", "quebracho", "horus", "bowie"];

interface CliArgs {
  filePath?: string;
  content?: string;
  agent: ReviewAgent;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let filePath: string | undefined;
  let content: string | undefined;
  let agent: ReviewAgent = "ares";

  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1) filePath = args[fileIdx + 1];
  const contentIdx = args.indexOf("--content");
  if (contentIdx !== -1) content = args[contentIdx + 1];
  const agentIdx = args.indexOf("--agent");
  if (agentIdx !== -1) {
    const a = args[agentIdx + 1];
    if (!VALID_AGENTS.includes(a as ReviewAgent)) {
      throw new Error(`Agente non valido: "${a}". Validi: ${VALID_AGENTS.join(", ")}`);
    }
    agent = a as ReviewAgent;
  }

  if (!filePath && content === undefined) {
    throw new Error("Uso: --file <path> | --content <testo> [--agent ares|quebracho|horus|bowie]");
  }
  return { filePath, content, agent };
}

async function main(): Promise<void> {
  let parsed: CliArgs;
  try {
    parsed = parseArgs(process.argv);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }

  const label = parsed.filePath ?? "(inline)";
  console.error(`🔍 Revisione del task plan con "${parsed.agent}": ${label}`);
  console.error("⚠  L'agente analizza e propone soltanto: nessuna modifica verrà applicata.\n");

  const result = await reviewTaskPlan({
    filePath: parsed.filePath,
    content: parsed.content,
    agent: parsed.agent,
  });

  if (!result.ok) {
    console.error(`❌ Revisione fallita: ${result.error ?? "errore sconosciuto"}`);
    process.exit(1);
  }

  if (result.missingFiles && result.missingFiles.length > 0) {
    console.error(`⚠  File citati nel piano ma NON trovati: ${result.missingFiles.join(", ")}\n`);
  }
  console.log(result.review ?? "(nessuna review prodotta)");
  console.error(`\n✅ Revisione completata (agente: ${parsed.agent}).`);
}

// Esegui solo se lanciato direttamente (non in import).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("❌ Errore fatale:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
