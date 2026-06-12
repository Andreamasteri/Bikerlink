/**
 * BikerLink AI Stack Schema — Generator
 * Genera ENTRAMBI docs/ai-schema.html e docs/ai-schema.pdf dallo stesso
 * contenuto TypeScript strutturato. Nessun testo duplicato tra i due output.
 * Eseguibile con: npx tsx scripts/generate-ai-schema-pdf.ts
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const ROOT      = path.resolve(".");
const HTML_PATH = path.join(ROOT, "docs", "ai-schema.html");
const PDF_PATH  = path.join(ROOT, "docs", "ai-schema.pdf");

// ─────────────────────────────────────────────────────────────────────────────
// SHARED DATA — single source of truth for both HTML and PDF
// ─────────────────────────────────────────────────────────────────────────────

interface CascadeNode {
  label: string;
  model: string;
  badge: string;
  cssClass: "n-ollama" | "n-groq" | "n-gemini" | "n-openai";
  badgeCss: "badge-local" | "badge-free" | "badge-paid";
  // PDF colors
  bgFill: string; border: string; textColor: string;
}

/** Catena Universale — Ollama-first (Task #3872) */
const CASCADE_A: CascadeNode[] = [
  { label: "① Ollama", model: "llama3.1:8b\n(ThinkCentre)", badge: "Self-hosted",
    cssClass: "n-ollama", badgeCss: "badge-local",
    bgFill: "#FFF3E0", border: "#E65100", textColor: "#BF360C" },
  { label: "② Groq",  model: "openai/gpt-oss-20b\n(brain + router)", badge: "Free Tier",
    cssClass: "n-groq", badgeCss: "badge-free",
    bgFill: "#E8F5E9", border: "#2E7D32", textColor: "#1B5E20" },
  { label: "③ Gemini", model: "gemini-2.5-flash (brain)\ngemini-2.5-flash-lite (router)", badge: "Free Tier",
    cssClass: "n-gemini", badgeCss: "badge-free",
    bgFill: "#E3F0FB", border: "#1565C0", textColor: "#0D47A1" },
  { label: "④ OpenAI", model: "gpt-5.1", badge: "Pay-per-use",
    cssClass: "n-openai", badgeCss: "badge-paid",
    bgFill: "#F3E5F5", border: "#7B1FA2", textColor: "#4A148C" },
];

/** Catena Route AI — configurabile via DB/env */
const CASCADE_B: CascadeNode[] = [
  { label: "① Ollama", model: "llama3.1:8b\n(ThinkCentre)", badge: "Primary",
    cssClass: "n-ollama", badgeCss: "badge-local",
    bgFill: "#FFF3E0", border: "#E65100", textColor: "#BF360C" },
  { label: "② Groq",  model: "llama-3.3-70b\n(parse model)", badge: "Free Tier",
    cssClass: "n-groq", badgeCss: "badge-free",
    bgFill: "#E8F5E9", border: "#2E7D32", textColor: "#1B5E20" },
  { label: "③ Gemini", model: "gemini-2.0-flash", badge: "Free Tier",
    cssClass: "n-gemini", badgeCss: "badge-free",
    bgFill: "#E3F0FB", border: "#1565C0", textColor: "#0D47A1" },
  { label: "④ OpenAI", model: "gpt-4o-mini\n(route)", badge: "Pay-per-use",
    cssClass: "n-openai", badgeCss: "badge-paid",
    bgFill: "#F3E5F5", border: "#7B1FA2", textColor: "#4A148C" },
];

interface Feature {
  name: string; file: string; provider: string;
  model: string; fallback: string; note: string;
}

const FEATURES: Feature[] = [
  {
    name: "Triage moderazione",
    file: "server/ai/moderation/triage.ts",
    provider: "Ollama (first)",
    model: "llama3.1:8b (Ollama) → openai/gpt-oss-20b (Groq, brain) → gemini-2.5-flash → gpt-5.1",
    fallback: "Rule-based se budget esaurito; cascade automatica se provider KO",
    note: "Role: brain; generateObject; schema Zod; retry ×2; log ai_call_logs",
  },
  {
    name: "AI Assistant (chat utente)",
    file: "server/ai/assistant/agent.ts",
    provider: "Ollama (first)",
    model: "llama3.1:8b (Ollama) → openai/gpt-oss-20b (Groq, router) → gemini-2.5-flash-lite → gpt-5.1",
    fallback: "Cascade universale Ollama-first; ollamaBackstop ora ridondante (Task #3872)",
    note: "Streaming SSE; RAG 3-snippet; memoria DB; tool call Ollama (maxSteps:3)",
  },
  {
    name: "Route AI Parse (JSON)",
    file: "server/routes/planned-routes/waypoints.ts\n+waypoints.next.ts\nserver/ai/route-provider-config.ts",
    provider: "Ollama (primary)",
    model: "llama3.1:8b (Ollama) → Groq parse model → gemini-2.0-flash → gpt-4o-mini",
    fallback: "Chain configurabile DB/env; probe raggiungibilità Ollama; schema Zod + balanced-JSON",
    note: "Timeout GEMINI_TIMEOUT_MS (30s); POI via Overpass; stats per provider",
  },
  {
    name: "Route AI Stream (SSE)",
    file: "server/routes/planned-routes/waypoints.ts\n+waypoints.next.ts\nserver/ai/route-provider-config.ts",
    provider: "Ollama (primary)",
    model: "llama3.1:8b (Ollama) → Groq → Gemini → OpenAI",
    fallback: "Buffering Ollama: emette solo se JSON valido; ricade su cloud se non valido",
    note: "Evento SSE done con parsed; validazione tryParseRoute progressiva",
  },
  {
    name: "Engine Selector AI",
    file: "server/routing/ai-engine-decider.ts",
    provider: "Ollama (fase 1)",
    model: "Fase 1: llama3.1:8b (Ollama, ½ budget)\nFase 2: openai/gpt-oss-20b → gemini-2.5-flash-lite → gpt-5.1 (skipOllama:true)",
    fallback: "Timeout 800ms totale; Fase 1=400ms Ollama; Fase 2=cloud residuo; scade → rule-based",
    note: "Sceglie GH vs Valhalla; input: bbox quality + health + ora; confidence<0.6 → doppia route",
  },
  {
    name: "DB Integrity Watchdog",
    file: "server/ai/db-integrity/scheduler.ts\n+worker.ts\nserver/ai/watchdog/proposer.ts",
    provider: "Ollama → Groq",
    model: "llama3.1:8b (Ollama, step 0) → openai/gpt-oss-20b (Groq, step 1) → chain cloud (step 2)",
    fallback: "3-step manual: Ollama → Groq specifico → chain cloud (skipOllama:true); cooldown 30min",
    note: "Scan notturno 03:00 + domenica 04:00 (expensive); cron croner; BullMQ",
  },
  {
    name: "Embeddings (generazione)",
    file: "server/embeddings/client.ts",
    provider: "OpenAI",
    model: "text-embedding-3-large (dim=1536)",
    fallback: "HF locale Xenova/multilingual-e5-small (384→1536, 4× concat + L2)",
    note: "Timeout 15s; retry ×3; tag model in DB: openai: vs local:",
  },
  {
    name: "Coordinate/geocode AI prompt",
    file: "server/routes/planned-routes/waypoints.ts",
    provider: "Non AI",
    model: "Nominatim (OSM self-hosted)",
    fallback: "Overpass per POI search",
    note: "Downstream dall'AI Parse; no provider AI diretto",
  },
];

interface Card {
  title: string; icon: string;
  file: string;
  lines: string[];
}

const CARDS: Card[] = [
  {
    title: "Budget Mensile", icon: "💰",
    file: "server/ai/moderation/budget.ts",
    lines: [
      "Limite default: $55/mese",
      "Alert push a 80% utilizzo",
      "Freeze chat al 100%; triage → rule-based",
      "Scopes: chat, triage, digest, anomaly",
      "Tabella: ai_usage_budget (per mese)",
      "Costo via estimateCostUsd() (prezzi per modello)",
    ],
  },
  {
    title: "Circuit Breaker + Cooldown", icon: "🔁",
    file: "server/ai/moderation/provider.ts",
    lines: [
      "Errore generico: 60s cooldown (in-memory)",
      "Errore quota/rate limit: 6h (persistito DB)",
      "Pattern: quota, rate_limit, RESOURCE_EXHAUSTED",
      "Cap RPD: Groq 1.000, Gemini 1.500, OpenAI ∞",
      "Groq TPD soft-cap: 160k token/giorno",
      "Ripristino via initProviderHealth() al boot",
    ],
  },
  {
    title: "Rate Limiter RPM (Bottleneck)", icon: "⏱",
    file: "server/lib/throttle.ts",
    lines: [
      "Ogni provider ha uno scheduler dedicato",
      "Groq: 30 RPM (free tier)",
      "Gemini: limiter RPM configurato",
      "Ollama: pass-through (nessun limite)",
      "OGNI chiamata AI DEVE passare da m.scheduler()",
    ],
  },
  {
    title: "AiCoordinator — Event Bus", icon: "🎛",
    file: "server/ai/coordinator/index.ts",
    lines: [
      "Singleton: getCoordinator()",
      "emit → ai_events + Redis pub/sub",
      "subscribe → Redis + fallback in-process",
      "recordDecision → ai_decisions",
      "evaluateConflict → ai_conflicts + policy",
      "Admin bypass: aiName='admin' non bloccato",
    ],
  },
  {
    title: "Kill Switch / Pause", icon: "🔴",
    file: "server/ai/coordinator/index.ts",
    lines: [
      "Pausa per-AI o globale (aiName='*')",
      "Stato Redis con TTL; fallback in-memory",
      "pauseAi(), resumeAi(), listPaused()",
      "Emit silenzioso se AI in pausa",
      "COORDINATOR_DISABLED=1 disabilita tutto",
    ],
  },
  {
    title: "Memoria Conversazionale + RAG", icon: "🧠",
    file: "server/ai/assistant/agent.ts",
    lines: [
      "Tabella: ai_conversation_turns",
      "Ultimi N turni per contesto (MEMORY_TURNS_LIMIT)",
      "RAG: top-3 snippet da knowledge base",
      "Pruning asincrono (fire-and-forget)",
      "Tool calling: attivo solo su Ollama (maxSteps:3)",
    ],
  },
  {
    title: "Logging AI Usage", icon: "📊",
    file: "server/lib/ai-logger.ts",
    lines: [
      "Log: provider, model, tokensIn/Out, latencyMs",
      "Log: costUsd, degraded, error",
      "Tabella: ai_call_logs (assistant + triage)",
      "Groq token tracking → soft-cap TPD",
      "Fire-and-forget (non bloccante)",
    ],
  },
  {
    title: "Watchdog AI Proposer", icon: "🔄",
    file: "server/ai/watchdog/proposer.ts",
    lines: [
      "Routing 3-step: (0) Ollama, (1) Groq specifico, (2) chain cloud",
      "Cooldown 30min se problema high/critical persistente",
      "Scan: notturno 03:00, domenicale 04:00 (expensive)",
      "Cleanup quarantena ogni 6h via croner",
      "Anomalie via BullMQ worker",
    ],
  },
  {
    title: "AI Routing Engine Selector", icon: "🗺",
    file: "server/routing/ai-engine-decider.ts",
    lines: [
      "Attivo se maps_routing_engine = 'ai'",
      "Sceglie: GraphHopper vs Valhalla",
      "Fase 1: Ollama (½ budget 800ms); Fase 2: cloud (skipOllama:true)",
      "Timeout hard 800ms → ricade su rule-based",
      "Confidence < 0.6 → doppia route + confronto",
    ],
  },
];

interface EnvRow { varname: string; provider: string; note: string; }

const ENV_ROWS: EnvRow[] = [
  { varname: "GROQ_API_KEY", provider: "Groq (primario)",
    note: "Free tier — 30 RPM, 1.000 RPD, TPD soft-cap 160k token. Override: GROQ_RPD_LIMIT, GROQ_TPD_LIMIT" },
  { varname: "GEMINI_API_KEY / GOOGLE_API_KEY", provider: "Gemini (fallback)",
    note: "Free tier Google AI Studio — 1.500 RPD. Override: GEMINI_RPD_LIMIT. Flash-lite su router, Flash su brain" },
  { varname: "OPENAI_API_KEY", provider: "OpenAI + Embeddings",
    note: "Pay-per-use. Nessun cap RPD di default (Infinity). Attiva anche text-embedding-3-large" },
  { varname: "OLLAMA_URL", provider: "Ollama (self-hosted)",
    note: "ThinkCentre LAN/Cloudflare. Se assente, Ollama disabilitato. Modello: OLLAMA_MODEL (default llama3.1:8b)" },
  { varname: "COORDINATOR_DISABLED", provider: "AiCoordinator",
    note: "Se =1, tutto il layer coordinator è disabilitato (emit/subscribe no-op)" },
  { varname: "GEMINI_TIMEOUT_MS", provider: "Route AI Parse/Stream",
    note: "Timeout globale AI route planning (default 30.000ms)" },
  { varname: "VALHALLA_URL", provider: "AI Engine Selector",
    note: "Se assente, il selector AI sceglie sempre GraphHopper con confidence alta" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HTML GENERATOR — produces docs/ai-schema.html from shared data
// ─────────────────────────────────────────────────────────────────────────────

function cascadeNodeHtml(n: CascadeNode): string {
  return `  <div class="cascade-node ${n.cssClass}">
    <div class="label">${n.label}</div>
    <div class="sub mono">${n.model.replace(/\n/g, "<br>")}</div>
    <span class="badge ${n.badgeCss}">${n.badge}</span>
  </div>`;
}

function cascadeHtml(nodes: CascadeNode[]): string {
  const parts: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    parts.push(cascadeNodeHtml(nodes[i]));
    if (i < nodes.length - 1) {
      parts.push(`  <div class="arrow-wrap"><span class="arrow">→</span><span class="arrow-label">fallback</span></div>`);
    }
  }
  return `<div class="cascade">\n${parts.join("\n")}\n</div>`;
}

function featureRowHtml(f: Feature, alt: boolean): string {
  const trClass = alt ? ' style="background:var(--alt-row)"' : "";
  return `    <tr${trClass}>
      <td class="bold">${f.name}</td>
      <td class="mono dim">${f.file.replace(/\n/g, "<br>")}</td>
      <td>${f.provider}</td>
      <td class="mono">${f.model.replace(/\n/g, "<br>")}</td>
      <td>${f.fallback}</td>
      <td>${f.note}</td>
    </tr>`;
}

function cardHtml(c: Card): string {
  const items = c.lines.map((l) => `        <li>${l}</li>`).join("\n");
  return `  <div class="card no-break">
    <div class="card-title">${c.icon} ${c.title}</div>
    <div class="card-body">
      File: <span class="mono">${c.file}</span><br>
      <ul>
${items}
      </ul>
    </div>
  </div>`;
}

function envRowHtml(r: EnvRow, alt: boolean): string {
  const trClass = alt ? ' style="background:var(--alt-row)"' : "";
  return `    <tr${trClass}>
      <td class="mono">${r.varname}</td>
      <td>${r.provider}</td>
      <td>${r.note}</td>
    </tr>`;
}

function buildHtml(): string {
  const genDate = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

  const cascadeAHtml = cascadeHtml(CASCADE_A);
  const cascadeBHtml = cascadeHtml(CASCADE_B);
  const featureRowsHtml = FEATURES.map((f, i) => featureRowHtml(f, i % 2 === 1)).join("\n");
  const cardsHtml = CARDS.map(cardHtml).join("\n");
  const envRowsHtml = ENV_ROWS.map((r, i) => envRowHtml(r, i % 2 === 1)).join("\n");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BikerLink — Schema AI Stack</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --orange:  #E8541A;
    --dark:    #1A1A2E;
    --grey:    #4A4A6A;
    --light:   #F5F5F7;
    --border:  #D0D0E0;
    --green:   #1B5E35;
    --green-light: #E8F5E9;
    --blue:    #1A5FA8;
    --blue-light: #E3F0FB;
    --red:     #C62828;
    --red-light: #FFEBEE;
    --amber:   #E65100;
    --amber-light: #FFF3E0;
    --purple:  #6A1B9A;
    --purple-light: #F3E5F5;
    --white:   #ffffff;
    --alt-row: #EEF0F8;
  }

  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.5pt; color: var(--dark); background: #e8eaf0; padding: 10mm; }

  .page { width: 210mm; min-height: 297mm; background: var(--white); margin: 0 auto 10mm; padding: 13mm 14mm 12mm; box-shadow: 0 2px 16px rgba(0,0,0,.18); }

  @page { size: A4; margin: 13mm 14mm 12mm; }

  @media print {
    body { background: none; padding: 0; }
    .page { box-shadow: none; margin: 0; padding: 0; width: 100%; min-height: 0; }
    .page-break { page-break-before: always; }
    .no-break { page-break-inside: avoid; }
  }

  header { background: var(--dark); color: var(--white); border-radius: 5px; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  header h1 { font-size: 14pt; font-weight: 700; letter-spacing: -.3px; }
  header h1 span { color: var(--orange); }
  .header-meta { text-align: right; font-size: 7pt; opacity: .85; line-height: 1.5; }
  .header-meta strong { display: block; font-size: 8.5pt; color: var(--orange); }

  h2 { font-size: 10.5pt; font-weight: 700; color: var(--dark); border-left: 4px solid var(--orange); padding-left: 8px; margin: 14px 0 6px; }
  h3 { font-size: 9pt; font-weight: 700; color: var(--grey); margin: 10px 0 4px; }

  .cascade { display: flex; align-items: center; gap: 0; margin: 8px 0 10px; flex-wrap: wrap; }
  .cascade-node { border-radius: 6px; padding: 7px 10px; text-align: center; min-width: 90px; }
  .cascade-node .label { font-size: 8pt; font-weight: 700; }
  .cascade-node .sub  { font-size: 6.5pt; opacity: .85; margin-top: 2px; }
  .cascade-node .badge { font-size: 5.5pt; border-radius: 3px; padding: 1px 4px; margin-top: 3px; display: inline-block; }
  .n-groq   { background: #E8F5E9; border: 1.5px solid #2E7D32; color: #1B5E20; }
  .n-gemini { background: #E3F0FB; border: 1.5px solid #1565C0; color: #0D47A1; }
  .n-openai { background: #F3E5F5; border: 1.5px solid #7B1FA2; color: #4A148C; }
  .n-ollama { background: #FFF3E0; border: 1.5px solid #E65100; color: #BF360C; }
  .badge-free   { background: #C8E6C9; color: #1B5E20; }
  .badge-paid   { background: #E1BEE7; color: #4A148C; }
  .badge-local  { background: #FFE0B2; color: #BF360C; }

  .arrow { font-size: 14pt; color: var(--grey); padding: 0 4px; line-height: 1; }
  .arrow-label { font-size: 6pt; color: var(--grey); text-align: center; display: block; margin-top: 2px; }
  .arrow-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; }

  table { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin: 4px 0 10px; }
  thead tr { background: var(--dark); color: var(--white); }
  thead th { padding: 5px 6px; text-align: left; font-weight: 600; font-size: 7pt; }
  tbody td { padding: 4px 6px; vertical-align: top; line-height: 1.35; border-bottom: 1px solid var(--border); }
  tbody tr:last-child td { border-bottom: none; }

  .tag { display: inline-block; border-radius: 3px; padding: 1px 5px; font-size: 6.5pt; font-weight: 600; white-space: nowrap; }
  .tag-groq   { background: #C8E6C9; color: #1B5E20; }
  .tag-gemini { background: #BBDEFB; color: #0D47A1; }
  .tag-openai { background: #E1BEE7; color: #4A148C; }
  .tag-ollama { background: #FFE0B2; color: #BF360C; }
  .tag-local  { background: #FFF3E0; color: #E65100; }
  .tag-rule   { background: #ECEFF1; color: #37474F; }
  .tag-chain  { background: #E8EAF6; color: #283593; }

  .infobox { border-radius: 5px; padding: 7px 10px; margin: 6px 0; font-size: 7.5pt; line-height: 1.45; }
  .infobox-green  { background: var(--green-light); border-left: 3px solid var(--green); }
  .infobox-blue   { background: var(--blue-light);  border-left: 3px solid var(--blue); }
  .infobox-orange { background: var(--amber-light);  border-left: 3px solid var(--amber); }
  .infobox strong { font-weight: 700; }

  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 6px 0 10px; }
  .card { border: 1px solid var(--border); border-radius: 5px; padding: 7px 9px; background: var(--light); }
  .card-title { font-size: 7.5pt; font-weight: 700; color: var(--dark); margin-bottom: 3px; border-bottom: 1px solid var(--border); padding-bottom: 3px; }
  .card-body { font-size: 7pt; color: var(--grey); line-height: 1.4; }
  .card-body ul { padding-left: 12px; }
  .card-body li { margin: 1px 0; }

  .embed-stack { display: flex; gap: 8px; margin: 6px 0 10px; }
  .embed-box { flex: 1; border-radius: 5px; padding: 8px 10px; font-size: 7.5pt; }
  .embed-primary  { background: var(--purple-light); border: 1.5px solid var(--purple); }
  .embed-fallback { background: var(--amber-light);  border: 1.5px solid var(--amber); }
  .embed-box strong { display: block; font-size: 8pt; margin-bottom: 3px; }

  footer { margin-top: 12px; padding-top: 6px; border-top: 1px solid var(--border); font-size: 6.5pt; color: var(--grey); display: flex; justify-content: space-between; }

  .mono { font-family: 'Consolas', 'Courier New', monospace; }
  .dim  { opacity: .65; }
  .bold { font-weight: 700; }
  p     { margin: 4px 0; line-height: 1.4; }
</style>
</head>
<body>

<!-- PAGE 1 -->
<div class="page">

<header>
  <h1>Biker<span>Link</span> — Schema AI Stack</h1>
  <div class="header-meta">
    <strong>Documento tecnico riservato</strong>
    Revisione: ${genDate}<br>
    Classificazione: Interno · Team &amp; Investitori
  </div>
</header>

<h2>1. Panoramica — Catene di Esecuzione</h2>
<p>Dal <strong>Task #3872</strong>, <code>runWithFallback</code> usa la cascade <strong>Ollama-first</strong> per tutte le chiamate AI (a meno che il caller non passi <code>skipOllama:true</code>). Se Ollama è offline/lento, la chain scende automaticamente al provider cloud successivo.</p>

<h3>Catena Universale — Ollama-first &nbsp;<span class="tag tag-chain">server/ai/moderation/provider.ts</span> &nbsp;<span class="dim" style="font-size:6.5pt">— Task #3872</span></h3>

${cascadeAHtml}

<h3>Catena Route AI (pianificazione percorso) &nbsp;<span class="tag tag-chain">server/ai/route-provider-config.ts</span> &nbsp;<span class="dim" style="font-size:6.5pt">— configurabile via DB / env ROUTE_AI_PROVIDERS</span></h3>

${cascadeBHtml}

<div class="infobox infobox-blue">
  <strong>Cascade universale (Task #3872):</strong> Ollama viene tentato per PRIMO in ogni <code>runWithFallback</code> se configurato; se offline la chain prosegue su Groq → Gemini → OpenAI.
  &nbsp;&nbsp;
  <strong>Engine Selector AI:</strong> 2 fasi — Fase 1 Ollama (½ del budget 800ms), Fase 2 chain cloud (<code>skipOllama:true</code>) col budget residuo.
  &nbsp;&nbsp;
  <strong>Chat co-pilot moderazione</strong> (<code>moderation/chat.ts</code>): <code>skipOllama:true</code> per tool calling multi-step — cloud-only.
  &nbsp;&nbsp;
  <strong>DB Integrity Watchdog:</strong> 3-step manual — (0) Ollama, (1) Groq modello specifico, (2) chain cloud standard; cooldown 30min.
  &nbsp;&nbsp;
  <strong>Catena Route AI:</strong> chain separata, stessa priorità Ollama-first, configurabile via DB <code>ai_route_provider_chain</code> / env <code>ROUTE_AI_PROVIDERS</code>.
</div>

<h2>2. Feature AI — Dettaglio per Modulo</h2>

<table class="no-break">
  <thead>
    <tr>
      <th style="width:15%">Feature</th>
      <th style="width:18%">File / Modulo</th>
      <th style="width:14%">Provider primario</th>
      <th style="width:20%">Modello</th>
      <th style="width:18%">Fallback</th>
      <th style="width:15%">Note</th>
    </tr>
  </thead>
  <tbody>
${featureRowsHtml}
  </tbody>
</table>

<footer>
  <span>BikerLink AI Stack Schema — Documento riservato</span>
  <span>${genDate}</span>
  <span>Pagina 1 / 2</span>
</footer>
</div>

<!-- PAGE 2 -->
<div class="page page-break">

<header>
  <h1>Biker<span>Link</span> — Schema AI Stack</h1>
  <div class="header-meta">
    <strong>Meccanismi Trasversali &amp; Embedding</strong>
    Revisione: ${genDate}
  </div>
</header>

<h2>3. Meccanismi Trasversali</h2>

<div class="cards">
${cardsHtml}
</div>

<h2>4. Stack Embeddings</h2>

<div class="embed-stack">
  <div class="embed-box embed-primary">
    <strong>🥇 Provider primario — OpenAI</strong>
    Modello: <span class="mono">text-embedding-3-large</span><br>
    Dimensioni: <strong>1536</strong> (providerOptions: dimensions=1536 su dim nativa 3072)<br>
    Tag DB: <span class="mono">openai:text-embedding-3-large</span><br>
    Timeout: 15s · Retry: ×3 su 429 / 5xx<br>
    Attivo quando: <span class="mono">OPENAI_API_KEY</span> presente
  </div>
  <div class="embed-box embed-fallback">
    <strong>🔁 Fallback locale — HuggingFace Transformers</strong>
    Modello: <span class="mono">Xenova/multilingual-e5-small</span> (quantized)<br>
    Dim nativa: <strong>384</strong> → proiettata a <strong>1536</strong> via 4× concat + L2-normalize<br>
    Tag DB: <span class="mono">local:Xenova/multilingual-e5-small</span><br>
    Caricamento pigro (lazy): init solo alla prima chiamata<br>
    Attivo quando: OPENAI_API_KEY assente o quota/errore persistente
  </div>
</div>

<div class="infobox infobox-orange">
  <strong>⚠️ Cross-provider similarity:</strong> La similarità coseno tra vettori OpenAI e vettori locali NON è significativa. Il matcher filtra per campo <span class="mono">model</span> quando serve confronto omogeneo. Le righe <span class="mono">local:</span> sono confrontabili solo tra loro.
</div>

<h2>5. Variabili d'Ambiente — Riepilogo</h2>

<table>
  <thead>
    <tr>
      <th style="width:28%">Variabile</th>
      <th style="width:20%">Provider / Feature</th>
      <th style="width:52%">Note</th>
    </tr>
  </thead>
  <tbody>
${envRowsHtml}
  </tbody>
</table>

<div class="infobox infobox-green">
  <strong>✅ Livello di resilienza:</strong> Il sistema funziona con un solo provider configurato. Con solo <span class="mono">GROQ_API_KEY</span> tutte le feature AI sono attive (eccetto embeddings OpenAI). Con zero chiavi cloud ma <span class="mono">OLLAMA_URL</span> configurato, l'AI assistant è operativo in modalità degradata. Con zero provider, il server parte comunque e il triage usa il fallback rule-based deterministico.
</div>

<footer>
  <span>BikerLink AI Stack Schema — Documento riservato</span>
  <span>${genDate}</span>
  <span>Pagina 2 / 2</span>
</footer>
</div>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATOR — pdfkit, reads from shared data constants above
// ─────────────────────────────────────────────────────────────────────────────

// ── Layout constants ─────────────────────────────────────────────────────────
const PAGE_W   = 595.28;  // A4 pt
const PAGE_H   = 841.89;
const MARGIN   = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  dark:        "#1A1A2E",
  orange:      "#E8541A",
  white:       "#FFFFFF",
  grey:        "#4A4A6A",
  lightGrey:   "#F5F5F7",
  border:      "#D0D0E0",
  altRow:      "#EEF0F8",
  green:       "#1B5E35",
  greenLight:  "#E8F5E9",
  blue:        "#1A5FA8",
  blueLight:   "#E3F0FB",
  amber:       "#E65100",
  amberLight:  "#FFF3E0",
  purple:      "#6A1B9A",
  purpleLight: "#F3E5F5",
};

function makeDoc(): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,   // allows retroactive footer page numbers
    info: { Title: "BikerLink AI Stack Schema", Author: "BikerLink" },
  });
}

function pageHeader(doc: PDFKit.PDFDocument, subtitle: string): void {
  const h = 34;
  doc.rect(MARGIN, MARGIN, CONTENT_W, h).fill(C.dark);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.white);
  doc.text("Biker", MARGIN + 10, MARGIN + 8, { continued: true });
  doc.fillColor(C.orange).text("Link", { continued: true });
  doc.fillColor(C.white).text(" — Schema AI Stack", { lineGap: 0 });
  doc.font("Helvetica").fontSize(7).fillColor(C.white).opacity(0.8);
  doc.text(subtitle, MARGIN + 10, MARGIN + 22, { width: CONTENT_W - 100, lineGap: 0 });
  doc.opacity(1);
  doc.y = MARGIN + h + 8;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  const y = doc.y;
  doc.rect(MARGIN, y, 3, 13).fill(C.orange);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.dark);
  doc.text(title, MARGIN + 8, y + 1, { width: CONTENT_W - 8 });
  doc.y += 4;
}

function tableRow(
  doc: PDFKit.PDFDocument,
  cols: Array<{ text: string; width: number; bold?: boolean; mono?: boolean; small?: boolean }>,
  y: number,
  isHeader: boolean,
  isAlt: boolean,
): number {
  const rowH = Math.max(
    ...cols.map((c) => {
      const f = c.bold || isHeader ? "Helvetica-Bold" : "Helvetica";
      const sz = isHeader ? 7 : 7.5;
      doc.font(f).fontSize(sz);
      return doc.heightOfString(c.text, { width: c.width - 8 }) + 8;
    }),
    18,
  );

  if (y + rowH > PAGE_H - MARGIN - 50 && !isHeader) {
    doc.addPage();
    pageHeader(doc, "Feature AI — continua");
    y = doc.y;
  }

  const bg = isHeader ? C.dark : isAlt ? C.altRow : C.white;
  doc.rect(MARGIN, y, CONTENT_W, rowH).fill(bg);

  let x = MARGIN;
  for (const col of cols) {
    const fgColor = isHeader ? C.white : C.dark;
    const font = col.bold || isHeader ? "Helvetica-Bold" : "Helvetica";
    const size = isHeader ? 7 : col.small ? 7 : 7.5;
    doc.font(font).fontSize(size).fillColor(fgColor);
    doc.text(col.text, x + 4, y + 4, { width: col.width - 8, lineGap: 1 });
    x += col.width;
  }

  doc.moveTo(MARGIN, y + rowH).lineTo(PAGE_W - MARGIN, y + rowH)
    .strokeColor(C.border).lineWidth(0.4).stroke();
  return y + rowH;
}

function infoBox(doc: PDFKit.PDFDocument, text: string, bgColor: string, borderColor: string): void {
  const startY = doc.y;
  doc.font("Helvetica").fontSize(8);
  const textH = doc.heightOfString(text, { width: CONTENT_W - 20 });
  const boxH = textH + 12;
  doc.rect(MARGIN, startY, CONTENT_W, boxH).fill(bgColor);
  doc.rect(MARGIN, startY, 3, boxH).fill(borderColor);
  doc.font("Helvetica").fontSize(8).fillColor(C.dark);
  doc.text(text, MARGIN + 10, startY + 6, { width: CONTENT_W - 20 });
  doc.y = startY + boxH + 4;
}

function drawCascadeNodes(
  doc: PDFKit.PDFDocument,
  nodes: CascadeNode[],
  startY: number,
): void {
  const nodeW = 108;
  const nodeH = 52;
  const arrowW = 18;
  const totalW = nodeW * nodes.length + arrowW * (nodes.length - 1);
  const startX = MARGIN + (CONTENT_W - totalW) / 2;
  let x = startX;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    doc.roundedRect(x, startY, nodeW, nodeH, 5).fill(n.bgFill);
    doc.roundedRect(x, startY, nodeW, nodeH, 5).stroke(n.border).lineWidth(1.5);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(n.textColor);
    doc.text(n.label, x + 4, startY + 5, { width: nodeW - 8, align: "center" });
    doc.font("Helvetica").fontSize(6.5).fillColor(n.textColor);
    doc.text(n.model, x + 4, startY + 17, { width: nodeW - 8, align: "center" });
    const badgeY = startY + nodeH - 13;
    const bw = 56;
    const bx = x + (nodeW - bw) / 2;
    doc.roundedRect(bx, badgeY, bw, 10, 2).fill(n.border);
    doc.font("Helvetica-Bold").fontSize(5.5).fillColor(C.white);
    doc.text(n.badge, bx, badgeY + 2, { width: bw, align: "center" });
    x += nodeW;
    if (i < nodes.length - 1) {
      const arrowY = startY + nodeH / 2;
      doc.moveTo(x + 2, arrowY).lineTo(x + arrowW - 2, arrowY)
        .strokeColor(C.grey).lineWidth(1.2).stroke();
      doc.polygon([x + arrowW - 2, arrowY], [x + arrowW - 7, arrowY - 3], [x + arrowW - 7, arrowY + 3])
        .fill(C.grey);
      doc.font("Helvetica").fontSize(5.5).fillColor(C.grey);
      doc.text("fallback", x + 1, arrowY + 3, { width: arrowW - 2, align: "center" });
      x += arrowW;
    }
  }
}

function drawCascade(doc: PDFKit.PDFDocument): void {
  const startY = doc.y;
  const nodeH = 52;

  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.grey);
  doc.text(
    "Catena Universale — Ollama-first (Task #3872)  (server/ai/moderation/provider.ts)",
    MARGIN, startY, { width: CONTENT_W },
  );
  const chainAY = startY + 11;
  drawCascadeNodes(doc, CASCADE_A, chainAY);

  const chainBLabelY = chainAY + nodeH + 10;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.grey);
  doc.text(
    "Catena Route AI — pianificazione percorso  (server/ai/route-provider-config.ts)" +
    "  [configurabile: DB ai_route_provider_chain / env ROUTE_AI_PROVIDERS]",
    MARGIN, chainBLabelY, { width: CONTENT_W },
  );
  const chainBY = chainBLabelY + 11;
  drawCascadeNodes(doc, CASCADE_B, chainBY);

  doc.y = chainBY + nodeH + 8;
}

function drawCards(doc: PDFKit.PDFDocument): void {
  const cardW = (CONTENT_W - 8) / 3;
  const cols = 3;
  const cardH = 88;
  let x = MARGIN;
  let y = doc.y;

  for (let i = 0; i < CARDS.length; i++) {
    const col = i % cols;
    if (col === 0 && i > 0) {
      y += cardH + 5;
      if (y + cardH > PAGE_H - MARGIN - 50) {
        doc.addPage();
        pageHeader(doc, "Meccanismi Trasversali — continua");
        y = doc.y;
      }
    }
    x = MARGIN + col * (cardW + 4);
    const c = CARDS[i];
    doc.rect(x, y, cardW, cardH).fill(C.lightGrey);
    doc.rect(x, y, cardW, cardH).stroke(C.border).lineWidth(0.5);
    doc.rect(x, y, cardW, 15).fill(C.dark);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.white);
    doc.text(`${c.icon}  ${c.title}`, x + 5, y + 4, { width: cardW - 10 });
    doc.font("Helvetica").fontSize(6.5).fillColor(C.grey);
    const lineY = y + 18;
    c.lines.forEach((line, li) => {
      doc.text(`• ${line}`, x + 5, lineY + li * 10, { width: cardW - 10 });
    });
  }
  doc.y = y + cardH + 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function generate(): Promise<void> {
  fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });

  // ── Write HTML from shared data ──────────────────────────────────────────
  fs.writeFileSync(HTML_PATH, buildHtml(), "utf8");
  console.log(`✅  HTML generato: ${HTML_PATH}`);

  // ── Write PDF from shared data ───────────────────────────────────────────
  const doc = makeDoc();
  const stream = fs.createWriteStream(PDF_PATH);
  doc.pipe(stream);

  // ═══════════ PAGE 1
  pageHeader(doc, "Panoramica e Feature AI");

  sectionTitle(doc, "1. Catene di Esecuzione");
  doc.font("Helvetica").fontSize(8).fillColor(C.grey);
  doc.text(
    "Dal Task #3872, runWithFallback usa cascade Ollama-first universale. " +
    "Se Ollama è offline o lento, la chain scende automaticamente al provider cloud successivo.",
    MARGIN, doc.y, { width: CONTENT_W },
  );
  doc.moveDown(0.4);

  drawCascade(doc);

  infoBox(
    doc,
    "Cascade universale (Task #3872): Ollama tentato per PRIMO in ogni runWithFallback; se offline la chain scende su Groq → Gemini → OpenAI." +
    "  |  Engine Selector AI: 2 fasi — Fase 1 Ollama (½ budget 800ms), Fase 2 cloud chain (skipOllama:true)." +
    "  |  Chat co-pilot moderazione: skipOllama:true, tool calling multi-step — cloud-only." +
    "  |  DB Watchdog (proposer): 3-step — (0) Ollama, (1) Groq specifico, (2) chain cloud; cooldown 30min." +
    "  |  Route AI: chain separata Ollama-first, configurabile via DB ai_route_provider_chain / env ROUTE_AI_PROVIDERS.",
    C.blueLight, C.blue,
  );

  sectionTitle(doc, "2. Feature AI — Dettaglio per Modulo");

  const fCols = [
    { label: "Feature",           width: 90  },
    { label: "File / Modulo",     width: 115 },
    { label: "Provider primario", width: 65  },
    { label: "Modello",           width: 90  },
    { label: "Fallback",          width: 95  },
    { label: "Note",              width: 60  },
  ];
  let tableY = doc.y;
  tableY = tableRow(doc, fCols.map((c) => ({ text: c.label, width: c.width })), tableY, true, false);
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    tableY = tableRow(
      doc,
      [
        { text: f.name,     width: fCols[0].width, bold: true },
        { text: f.file,     width: fCols[1].width, mono: true, small: true },
        { text: f.provider, width: fCols[2].width },
        { text: f.model,    width: fCols[3].width, small: true },
        { text: f.fallback, width: fCols[4].width, small: true },
        { text: f.note,     width: fCols[5].width, small: true },
      ],
      tableY, false, i % 2 === 1,
    );
  }
  doc.y = tableY + 6;

  // ═══════════ PAGE 2 (mechanisms & embeddings)
  doc.addPage();
  pageHeader(doc, "Meccanismi Trasversali & Embeddings");

  sectionTitle(doc, "3. Meccanismi Trasversali");
  drawCards(doc);

  sectionTitle(doc, "4. Stack Embeddings");
  const embedY = doc.y;
  const halfW  = (CONTENT_W - 6) / 2;

  doc.rect(MARGIN, embedY, halfW, 65).fill(C.purpleLight);
  doc.rect(MARGIN, embedY, halfW, 65).stroke(C.purple).lineWidth(1.2);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.purple);
  doc.text("🥇  Provider primario — OpenAI", MARGIN + 6, embedY + 6, { width: halfW - 12 });
  doc.font("Helvetica").fontSize(7.5).fillColor(C.dark);
  [
    "Modello: text-embedding-3-large",
    "Dimensioni: 1536 (via providerOptions su dim nativa 3072)",
    "Tag DB: openai:text-embedding-3-large",
    "Timeout: 15s  ·  Retry: ×3 su 429 / 5xx",
    "Attivo quando: OPENAI_API_KEY presente",
  ].forEach((line, i) => doc.text(`• ${line}`, MARGIN + 6, embedY + 20 + i * 9, { width: halfW - 12 }));

  const fbX = MARGIN + halfW + 6;
  doc.rect(fbX, embedY, halfW, 65).fill(C.amberLight);
  doc.rect(fbX, embedY, halfW, 65).stroke(C.amber).lineWidth(1.2);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.amber);
  doc.text("🔁  Fallback locale — HuggingFace Transformers", fbX + 6, embedY + 6, { width: halfW - 12 });
  doc.font("Helvetica").fontSize(7.5).fillColor(C.dark);
  [
    "Modello: Xenova/multilingual-e5-small (quantized)",
    "Dim nativa: 384 → 1536 via 4× concat + L2-normalize",
    "Tag DB: local:Xenova/multilingual-e5-small",
    "Caricamento pigro (lazy): init solo alla prima chiamata",
    "Attivo quando: OPENAI_API_KEY assente o quota esaurita",
  ].forEach((line, i) => doc.text(`• ${line}`, fbX + 6, embedY + 20 + i * 9, { width: halfW - 12 }));

  doc.y = embedY + 72;

  infoBox(doc,
    "⚠️  Cross-provider similarity: La similarità coseno tra vettori OpenAI e vettori locali NON è significativa. " +
    "Il matcher filtra per campo model quando serve confronto omogeneo. Le righe local: sono confrontabili solo tra loro.",
    C.amberLight, C.amber,
  );

  sectionTitle(doc, "5. Variabili d'Ambiente — Riepilogo");
  const eCols = [
    { label: "Variabile",         width: 140 },
    { label: "Provider / Feature", width: 100 },
    { label: "Note",              width: 275 },
  ];
  let envY = doc.y;
  envY = tableRow(doc, eCols.map((c) => ({ text: c.label, width: c.width })), envY, true, false);
  for (let i = 0; i < ENV_ROWS.length; i++) {
    const r = ENV_ROWS[i];
    envY = tableRow(doc,
      [
        { text: r.varname,  width: eCols[0].width, mono: true, small: true },
        { text: r.provider, width: eCols[1].width, small: true },
        { text: r.note,     width: eCols[2].width, small: true },
      ],
      envY, false, i % 2 === 1,
    );
  }
  doc.y = envY + 6;

  infoBox(doc,
    "✅  Livello di resilienza: il sistema funziona con un solo provider configurato. " +
    "Con solo GROQ_API_KEY tutte le feature AI sono attive (eccetto embeddings OpenAI). " +
    "Con zero chiavi cloud ma OLLAMA_URL configurato, l'AI assistant è operativo in modalità degradata. " +
    "Con zero provider, il server parte comunque e il triage usa il fallback rule-based deterministico.",
    C.greenLight, C.green,
  );

  // ── Retroactive page footers (bufferPages:true) ──────────────────────────
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    const footerY = PAGE_H - MARGIN + 6;
    doc.moveTo(MARGIN, footerY - 2).lineTo(PAGE_W - MARGIN, footerY - 2)
      .strokeColor(C.border).lineWidth(0.4).stroke();
    doc.font("Helvetica").fontSize(6.5).fillColor(C.grey);
    doc.text("BikerLink AI Stack Schema — Documento riservato", MARGIN, footerY, { width: CONTENT_W / 3 });
    doc.text(
      new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }),
      MARGIN + CONTENT_W / 3, footerY, { width: CONTENT_W / 3, align: "center" },
    );
    doc.text(`Pagina ${i + 1} / ${totalPages}`, MARGIN + (CONTENT_W * 2) / 3, footerY, {
      width: CONTENT_W / 3, align: "right",
    });
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  console.log(`✅  PDF generato: ${PDF_PATH}`);
  console.log(`    Pagine: ${totalPages}  ·  Dimensione: ${(fs.statSync(PDF_PATH).size / 1024).toFixed(1)} KB`);
}

generate().catch((err) => {
  console.error("❌ Errore generazione:", err);
  process.exit(1);
});
