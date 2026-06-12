/**
 * BikerLink AI Stack Schema — HTML Generator
 * Produce docs/ai-schema.html dai dati condivisi in ai-schema-data.ts.
 */
import { CASCADE_A, CASCADE_B, FEATURES, CARDS, ENV_ROWS, CascadeNode, Feature, Card, EnvRow } from "./ai-schema-data";

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

export function buildHtml(): string {
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
    --orange:#E8541A; --dark:#1A1A2E; --grey:#4A4A6A; --light:#F5F5F7;
    --border:#D0D0E0; --green:#1B5E35; --green-light:#E8F5E9;
    --blue:#1A5FA8; --blue-light:#E3F0FB; --red:#C62828; --red-light:#FFEBEE;
    --amber:#E65100; --amber-light:#FFF3E0; --purple:#6A1B9A; --purple-light:#F3E5F5;
    --white:#ffffff; --alt-row:#EEF0F8;
  }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:8.5pt; color:var(--dark); background:#e8eaf0; padding:10mm; }
  .page { width:210mm; min-height:297mm; background:var(--white); margin:0 auto 10mm; padding:13mm 14mm 12mm; box-shadow:0 2px 16px rgba(0,0,0,.18); }
  @page { size:A4; margin:13mm 14mm 12mm; }
  @media print {
    body { background:none; padding:0; }
    .page { box-shadow:none; margin:0; padding:0; width:100%; min-height:0; }
    .page-break { page-break-before:always; }
    .no-break { page-break-inside:avoid; }
  }
  header { background:var(--dark); color:var(--white); border-radius:5px; padding:8px 14px; display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  header h1 { font-size:14pt; font-weight:700; letter-spacing:-.3px; }
  header h1 span { color:var(--orange); }
  .header-meta { text-align:right; font-size:7pt; opacity:.85; line-height:1.5; }
  .header-meta strong { display:block; font-size:8.5pt; color:var(--orange); }
  h2 { font-size:10.5pt; font-weight:700; color:var(--dark); border-left:4px solid var(--orange); padding-left:8px; margin:14px 0 6px; }
  h3 { font-size:9pt; font-weight:700; color:var(--grey); margin:10px 0 4px; }
  .cascade { display:flex; align-items:center; gap:0; margin:8px 0 10px; flex-wrap:wrap; }
  .cascade-node { border-radius:6px; padding:7px 10px; text-align:center; min-width:90px; }
  .cascade-node .label { font-size:8pt; font-weight:700; }
  .cascade-node .sub  { font-size:6.5pt; opacity:.85; margin-top:2px; }
  .cascade-node .badge { font-size:5.5pt; border-radius:3px; padding:1px 4px; margin-top:3px; display:inline-block; }
  .n-groq   { background:#E8F5E9; border:1.5px solid #2E7D32; color:#1B5E20; }
  .n-gemini { background:#E3F0FB; border:1.5px solid #1565C0; color:#0D47A1; }
  .n-openai { background:#F3E5F5; border:1.5px solid #7B1FA2; color:#4A148C; }
  .n-ollama { background:#FFF3E0; border:1.5px solid #E65100; color:#BF360C; }
  .badge-free  { background:#C8E6C9; color:#1B5E20; }
  .badge-paid  { background:#E1BEE7; color:#4A148C; }
  .badge-local { background:#FFE0B2; color:#BF360C; }
  .arrow { font-size:14pt; color:var(--grey); padding:0 4px; line-height:1; }
  .arrow-label { font-size:6pt; color:var(--grey); text-align:center; display:block; margin-top:2px; }
  .arrow-wrap { display:flex; flex-direction:column; align-items:center; justify-content:center; }
  table { width:100%; border-collapse:collapse; font-size:7.5pt; margin:4px 0 10px; }
  thead tr { background:var(--dark); color:var(--white); }
  thead th { padding:5px 6px; text-align:left; font-weight:600; font-size:7pt; }
  tbody td { padding:4px 6px; vertical-align:top; line-height:1.35; border-bottom:1px solid var(--border); }
  tbody tr:last-child td { border-bottom:none; }
  .infobox { border-radius:5px; padding:7px 10px; margin:6px 0; font-size:7.5pt; line-height:1.45; }
  .infobox-green  { background:var(--green-light); border-left:3px solid var(--green); }
  .infobox-blue   { background:var(--blue-light);  border-left:3px solid var(--blue); }
  .infobox-orange { background:var(--amber-light);  border-left:3px solid var(--amber); }
  .infobox strong { font-weight:700; }
  .cards { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin:6px 0 10px; }
  .card { border:1px solid var(--border); border-radius:5px; padding:7px 9px; background:var(--light); }
  .card-title { font-size:7.5pt; font-weight:700; color:var(--dark); margin-bottom:3px; border-bottom:1px solid var(--border); padding-bottom:3px; }
  .card-body { font-size:7pt; color:var(--grey); line-height:1.4; }
  .card-body ul { padding-left:12px; }
  .card-body li { margin:1px 0; }
  .embed-stack { display:flex; gap:8px; margin:6px 0 10px; }
  .embed-box { flex:1; border-radius:5px; padding:8px 10px; font-size:7.5pt; }
  .embed-primary  { background:var(--purple-light); border:1.5px solid var(--purple); }
  .embed-fallback { background:var(--amber-light);  border:1.5px solid var(--amber); }
  .embed-box strong { display:block; font-size:8pt; margin-bottom:3px; }
  footer { margin-top:12px; padding-top:6px; border-top:1px solid var(--border); font-size:6.5pt; color:var(--grey); display:flex; justify-content:space-between; }
  .mono { font-family:'Consolas','Courier New',monospace; }
  .dim  { opacity:.65; }
  .bold { font-weight:700; }
  p     { margin:4px 0; line-height:1.4; }
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
<h3>Catena Universale — Ollama-first &nbsp;<span class="tag tag-chain">server/ai/moderation/provider.ts</span></h3>
${cascadeAHtml}
<h3>Catena Route AI (pianificazione percorso) &nbsp;<span class="tag tag-chain">server/ai/route-provider-config.ts</span></h3>
${cascadeBHtml}
<div class="infobox infobox-blue">
  <strong>Cascade universale (Task #3872):</strong> Ollama viene tentato per PRIMO in ogni <code>runWithFallback</code> se configurato; se offline la chain prosegue su Groq → Gemini → OpenAI.
  &nbsp;&nbsp;<strong>Engine Selector AI:</strong> 2 fasi — Fase 1 Ollama (½ del budget 800ms), Fase 2 chain cloud (<code>skipOllama:true</code>) col budget residuo.
  &nbsp;&nbsp;<strong>Chat co-pilot moderazione</strong> (<code>moderation/chat.ts</code>): <code>skipOllama:true</code> per tool calling multi-step — cloud-only.
  &nbsp;&nbsp;<strong>DB Integrity Watchdog:</strong> 3-step manual — (0) Ollama, (1) Groq modello specifico, (2) chain cloud standard; cooldown 30min.
  &nbsp;&nbsp;<strong>Catena Route AI:</strong> chain separata, stessa priorità Ollama-first, configurabile via DB <code>ai_route_provider_chain</code> / env <code>ROUTE_AI_PROVIDERS</code>.
</div>
<h2>2. Feature AI — Dettaglio per Modulo</h2>
<table class="no-break">
  <thead>
    <tr>
      <th style="width:15%">Feature</th><th style="width:18%">File / Modulo</th>
      <th style="width:14%">Provider primario</th><th style="width:20%">Modello</th>
      <th style="width:18%">Fallback</th><th style="width:15%">Note</th>
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
