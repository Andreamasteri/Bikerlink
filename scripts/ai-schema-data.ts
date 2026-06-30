/**
 * BikerLink AI Stack Schema — Shared Data
 * Single source of truth per HTML e PDF. Importato da ai-schema-html.ts e generate-ai-schema-pdf.ts.
 */

export interface CascadeNode {
  label: string;
  model: string;
  badge: string;
  cssClass: "n-ollama" | "n-groq" | "n-gemini" | "n-openai";
  badgeCss: "badge-local" | "badge-free" | "badge-paid";
  bgFill: string; border: string; textColor: string;
}

/** Catena Universale — Ollama-first (Task #3872) */
export const CASCADE_A: CascadeNode[] = [
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
export const CASCADE_B: CascadeNode[] = [
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

export interface Feature {
  name: string; file: string; provider: string;
  model: string; fallback: string; note: string;
}

export const FEATURES: Feature[] = [
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

export interface Card {
  title: string; icon: string;
  file: string;
  lines: string[];
}

export const CARDS: Card[] = [
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

export interface EnvRow { varname: string; provider: string; note: string; }

export const ENV_ROWS: EnvRow[] = [
  { varname: "GROQ_API_KEY", provider: "Groq (primario)",
    note: "Free tier — 30 RPM, 1.000 RPD, TPD soft-cap 160k token. Override: GROQ_RPD_LIMIT, GROQ_TPD_LIMIT" },
  { varname: "GEMINI_API_KEY / GOOGLE_API_KEY", provider: "Gemini (fallback)",
    note: "Free tier Google AI Studio — 1.500 RPD. Override: GEMINI_RPD_LIMIT. Flash-lite su router, Flash su brain" },
  { varname: "OPENAI_API_KEY", provider: "OpenAI + Embeddings",
    note: "Pay-per-use. Nessun cap RPD di default (Infinity). Attiva anche text-embedding-3-large" },
  { varname: "BOWIE_OLLAMA_URL", provider: "Ollama (self-hosted)",
    note: "ThinkCentre LAN/Cloudflare. Se assente, Ollama disabilitato. Modello: BOWIE_OLLAMA_MODEL (default llama3.1:8b)" },
  { varname: "COORDINATOR_DISABLED", provider: "AiCoordinator",
    note: "Se =1, tutto il layer coordinator è disabilitato (emit/subscribe no-op)" },
  { varname: "GEMINI_TIMEOUT_MS", provider: "Route AI Parse/Stream",
    note: "Timeout globale AI route planning (default 30.000ms)" },
  { varname: "VALHALLA_URL", provider: "AI Engine Selector",
    note: "Se assente, il selector AI sceglie sempre GraphHopper con confidence alta" },
];
