import fs from "fs";
import path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const EXPORTS_DIR = path.join(PROJECT_ROOT, "exports");
const JSON_PATH = path.join(EXPORTS_DIR, "bikerlink-tasks-meta.json");
const MAX_PART_BYTES = 2 * 1024 * 1024; // 2 MB

interface TaskMeta {
  taskRef: string;
  title: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  description: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").substring(0, 19) + " UTC";
}

function stateEmoji(state: string): string {
  const map: Record<string, string> = {
    MERGED: "✅",
    CANCELLED: "❌",
    IN_PROGRESS: "🔄",
    PROPOSED: "📋",
    PENDING: "⏳",
    IMPLEMENTED: "🟢",
    MERGING: "🔀",
    BLOCKED_BY_DRIFT: "🚧",
  };
  return map[state] ?? "❓";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max) + "\n\n_(troncato)_";
}

/**
 * Extracts a 2–4 line summary from the end of a long description.
 * Looks for a "Done looks like" or "Verifiche" section; otherwise uses
 * the last non-empty paragraph.
 */
function extractRisultato(desc: string): string | null {
  if (desc.length <= 500) return null;

  // Try to find a "Done looks like" / "Verifiche" / "Risultato" section
  const sectionPatterns = [
    /(?:##\s*Done looks like|##\s*Verifiche|##\s*Risultato)[^\n]*\n([\s\S]{1,600}?)(?:\n##|\n---|\n$|$)/i,
  ];
  for (const pat of sectionPatterns) {
    const m = desc.match(pat);
    if (m && m[1]) {
      const text = m[1].trim();
      if (text.length > 20) {
        // Take first 4 non-empty lines
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 4);
        return lines.join("\n");
      }
    }
  }

  // Fallback: take last non-empty paragraph (max 4 lines / 300 chars)
  const paragraphs = desc.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const last = paragraphs[paragraphs.length - 1] ?? "";
  if (last.length < 20) return null;
  const lines = last.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 4);
  return truncate(lines.join("\n"), 300);
}

function buildTaskBlock(task: TaskMeta): string {
  const lines: string[] = [];
  lines.push(`## ${task.taskRef} — ${task.title}`);
  lines.push("");
  lines.push(`| Campo | Valore |`);
  lines.push(`|-------|--------|`);
  lines.push(`| **Stato** | ${stateEmoji(task.state)} ${task.state} |`);
  lines.push(`| **Creato** | ${formatDate(task.createdAt)} |`);
  lines.push(`| **Aggiornato** | ${formatDate(task.updatedAt)} |`);
  lines.push("");

  if (task.description) {
    const desc = task.description.trim();

    lines.push("### Richiesta");
    lines.push("");
    lines.push(truncate(desc, 2000));
    lines.push("");

    const risultato = extractRisultato(desc);
    if (risultato) {
      lines.push("### Risultato");
      lines.push("");
      lines.push(risultato);
    }
  } else {
    lines.push("_Nessuna descrizione disponibile._");
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function buildHeader(partNum: number | null, totalParts: number | null, totalTasks: number): string {
  const lines: string[] = [];
  lines.push("# BikerLink — Storia dei Task");
  lines.push("");
  if (partNum !== null && totalParts !== null && totalParts > 1) {
    lines.push(`> **Parte ${partNum} di ${totalParts}** — ${totalTasks} task totali`);
  } else {
    lines.push(`> **${totalTasks} task** esportati`);
  }
  lines.push(`> Generato il: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`[export-tasks] File non trovato: ${JSON_PATH}`);
    console.error("Rigenerare prima exports/bikerlink-tasks-meta.json via code_execution.");
    process.exit(1);
  }

  const raw = fs.readFileSync(JSON_PATH, "utf-8");
  const tasks: TaskMeta[] = JSON.parse(raw);
  console.log(`[export-tasks] Caricati ${tasks.length} task da JSON`);

  // Build all blocks
  const blocks = tasks.map(buildTaskBlock);
  const totalTasks = tasks.length;

  // Calculate total size
  const allContent = blocks.join("");
  const headerSize = buildHeader(null, null, totalTasks).length;
  const totalSize = headerSize + allContent.length;

  if (totalSize <= MAX_PART_BYTES) {
    // Single file
    const content = buildHeader(null, null, totalTasks) + allContent;
    const outPath = path.join(EXPORTS_DIR, "bikerlink-tasks.md");
    fs.writeFileSync(outPath, content, "utf-8");
    const stat = fs.statSync(outPath);
    console.log(`[export-tasks] Scritto: ${outPath}`);
    console.log(`[export-tasks] Dimensione: ${(stat.size / 1024).toFixed(1)} KB`);
    console.log(`[export-tasks] Task esportati: ${totalTasks}`);
    console.log(`[export-tasks] Parti: 1`);
  } else {
    // Split into parts
    const parts: string[][] = [];
    let currentPart: string[] = [];
    let currentSize = 0;

    for (const block of blocks) {
      if (currentSize + block.length > MAX_PART_BYTES && currentPart.length > 0) {
        parts.push(currentPart);
        currentPart = [];
        currentSize = 0;
      }
      currentPart.push(block);
      currentSize += block.length;
    }
    if (currentPart.length > 0) parts.push(currentPart);

    const totalParts = parts.length;
    const writtenPaths: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      const partNum = i + 1;
      const partStr = String(partNum).padStart(2, "0");
      const content = buildHeader(partNum, totalParts, totalTasks) + parts[i].join("");
      const outPath = path.join(EXPORTS_DIR, `bikerlink-tasks-part-${partStr}.md`);
      fs.writeFileSync(outPath, content, "utf-8");
      const stat = fs.statSync(outPath);
      writtenPaths.push(outPath);
      console.log(`[export-tasks] Scritto parte ${partNum}/${totalParts}: ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`);
    }

    // Also write a small index file for the single-file endpoint
    const indexContent = buildHeader(null, totalParts, totalTasks) +
      `> Questo export è suddiviso in **${totalParts} parti**.\n\n` +
      writtenPaths.map((p, i) => `- [Parte ${i + 1}](${path.basename(p)})`).join("\n") + "\n\n---\n\n" +
      "Usa `?part=01`, `?part=02`, ecc. per scaricare le singole parti via API.\n";
    const indexPath = path.join(EXPORTS_DIR, "bikerlink-tasks.md");
    fs.writeFileSync(indexPath, indexContent, "utf-8");

    console.log(`[export-tasks] Task esportati: ${totalTasks}`);
    console.log(`[export-tasks] Parti totali: ${totalParts}`);
  }
}

main();
