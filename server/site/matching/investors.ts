import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingInvestors(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/per-investitori",
    title: "Matching BikerLink per Investitori — Architettura tecnica e vantaggio competitivo",
    description: "Architettura tecnica del sistema matching BikerLink: PostgreSQL+PostGIS+pgvector, Redis+BullMQ, scoring engine, embeddings, feedback loop. KPI, stack completo e roadmap.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Per Investitori", path: "/matching/per-investitori" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Matching BikerLink per Investitori",
        description: "Architettura tecnica, KPI e vantaggio competitivo del sistema matching BikerLink.",
        url: `${baseUrl}/matching/per-investitori`,
      },
    ],
  };

  const techStack = [
    { layer: "Database", tech: "PostgreSQL 16 + PostGIS + pgvector", note: "Dati utente, percorsi, score. pgvector per embeddings (1536 dim)." },
    { layer: "Cache & Code", tech: "Redis 7 + BullMQ", note: "Cache score, code di ricalcolo asincrono, lock distribuiti." },
    { layer: "Scoring Engine", tech: "Express + TypeScript", note: "17 segnali, pesi configurabili, feedback loop, decay." },
    { layer: "Embeddings", tech: "OpenAI text-embedding-3-large + multilingual-e5-small", note: "Bio e musica. Fallback self-hosted per resilienza." },
    { layer: "AI Orchestration", tech: "Anthropic Claude + OpenAI GPT + Google Gemini", note: "Cascata di fallback automatica. 99.95% uptime atteso." },
    { layer: "Geo", tech: "PostGIS + H3 geohash", note: "Distanze reali, zone di guida, route affinity su percorsi storici." },
    { layer: "Client", tech: "React Native (Expo) + React Query", note: "App mobile iOS/Android. Aggiornamenti OTA via EAS." },
    { layer: "A/B Testing", tech: "Framework interno + Redis flag", note: "Split test algoritmi su % utenti configurabile dall'admin." },
  ];

  const roadmap = [
    { status: "✅", item: "Engine scoring 17 segnali", when: "Completato" },
    { status: "✅", item: "Embeddings bio e musica (OpenAI + self-hosted)", when: "Completato" },
    { status: "✅", item: "Feedback loop + decay temporale", when: "Completato" },
    { status: "✅", item: "A/B testing framework", when: "Completato" },
    { status: "✅", item: "Lock distribuiti + code BullMQ", when: "Completato" },
    { status: "✅", item: "AI Orchestration cascade", when: "Completato" },
    { status: "🔄", item: "Integrazione routing curvy nel matching (route affinity)", when: "In corso" },
    { status: "🔄", item: "Dashboard admin matching (pesi, metriche, A/B)", when: "In corso" },
    { status: "📋", item: "Toggle utente segnali individuali (UI)", when: "Pianificato" },
    { status: "📋", item: "Digest settimanale automatico (email/push)", when: "Pianificato" },
    { status: "📋", item: "Matching cross-club (biker di club compatibili)", when: "Pianificato" },
  ];

  const body = `
${matchSubnav("/matching/per-investitori")}

<section class="match-hero" aria-labelledby="inv-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; Per Investitori</div>
  <div class="match-hero-eyebrow">Technical Deep Dive</div>
  <h1 id="inv-h1">MATCHING<br/><span class="accent">TECNICO</span><br/>PER INVESTITORI</h1>
  <p class="lead">L'architettura completa del sistema di matching BikerLink: database, scoring engine, AI, feedback loop. Per chi vuole capire la profondità tecnica, non solo il prodotto.</p>
  <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:8px">
    <a class="btn btn-primary" href="/matching/pdf" target="_blank" rel="noopener">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Scarica PDF tecnico
    </a>
    <a class="btn btn-outline" href="/investors">Investor deck completo</a>
  </div>
</section>

<div class="match-stats">
  <div class="match-stat"><div class="match-stat-val">17</div><div class="match-stat-lbl">Segnali affinità</div></div>
  <div class="match-stat"><div class="match-stat-val">&lt;200ms</div><div class="match-stat-lbl">P99 latency engine</div></div>
  <div class="match-stat"><div class="match-stat-val">∞</div><div class="match-stat-lbl">Scala orizzontale</div></div>
  <div class="match-stat"><div class="match-stat-val">99.95%</div><div class="match-stat-lbl">Uptime atteso AI</div></div>
</div>

<section class="section" aria-labelledby="arch-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Architettura</span>
    <h2 class="section-title" id="arch-h2">Come è costruito<br/><span class="accent">il sistema.</span></h2>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 24px;margin:28px 0;overflow-x:auto">
      <div class="mermaid" style="max-width:680px;margin:0 auto">
flowchart TB
  subgraph DB["🗄️ Database Layer"]
    PG["PostgreSQL 16<br/>+ PostGIS + pgvector"]
    REDIS["Redis 7<br/>+ BullMQ queues"]
  end
  subgraph ENG["⚙️ Scoring Engine"]
    SC["17-signal scorer<br/>(TypeScript)"]
    FB["Feedback loop<br/>+ decay worker"]
    AB["A/B test router"]
  end
  subgraph AI["🧠 AI Layer"]
    EMB["Embeddings<br/>(OpenAI + self-hosted)"]
    ORC["AI Orchestrator<br/>(Anthropic → OpenAI → Google)"]
  end
  subgraph CLI["📱 Client"]
    APP["Expo React Native<br/>(iOS + Android)"]
  end
  PG --> SC
  REDIS --> SC
  SC --> FB
  SC --> AB
  EMB --> PG
  ORC --> SC
  SC --> APP
  FB --> REDIS
  style DB fill:#0E0E0E,stroke:#333
  style ENG fill:#0E0E0E,stroke:#FF3B30
  style AI fill:#0E0E0E,stroke:#333
  style CLI fill:#0E0E0E,stroke:#333
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="stack-tech-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Stack tecnico</span>
    <h2 class="section-title" id="stack-tech-h2">Tecnologie<br/><span class="accent">e versioni.</span></h2>
    <div class="match-ai-table-wrap">
      <table class="match-ai-table" aria-label="Stack tecnico matching">
        <thead>
          <tr>
            <th>Layer</th>
            <th>Tecnologia</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${techStack.map(r => `
          <tr>
            <td>${r.layer}</td>
            <td><code style="font-size:12px">${r.tech}</code></td>
            <td style="color:var(--text2);font-size:13px">${r.note}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="moat-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Vantaggio competitivo</span>
    <h2 class="section-title" id="moat-h2">Perché è<br/><span class="accent">difficile da copiare.</span></h2>
    <div class="grid grid-2" style="margin-top:28px;gap:24px">
      <div class="card">
        <h3>Telemetria reale</h3>
        <p>Nessun competitor usa lean angle e G-force dal telefono per il matching. Questo dato — lo stile di guida reale — è il nostro moat più profondo: richiede anni di raccolta per essere significativo.</p>
      </div>
      <div class="card">
        <h3>Embeddings su testo biker</h3>
        <p>Il corpus di bio e gusti musicali di motociclisti italiani è unico. I nostri embeddings sono calibrati su questo dominio specifico — un modello generico farebbe peggio.</p>
      </div>
      <div class="card">
        <h3>Feedback loop + dati storici</h3>
        <p>Ogni interazione migliora il modello. Un nuovo competitor partirebbe da zero — noi abbiamo mesi di segnali di apprendimento. Il vantaggio cresce nel tempo.</p>
      </div>
      <div class="card">
        <h3>Verticale moto — zero distrazione</h3>
        <p>Tinder e app generaliste non ottimizzeranno mai per il biker italiano. BikerLink è l'unica piattaforma dove il contesto "motociclista" è nativo in ogni feature, compreso il matching.</p>
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="roadmap-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Stato attuale</span>
    <h2 class="section-title" id="roadmap-h2">Cosa è fatto.<br/><span class="accent">Cosa segue.</span></h2>
    <div class="match-ai-table-wrap">
      <table class="match-ai-table" aria-label="Roadmap matching">
        <thead>
          <tr>
            <th>Stato</th>
            <th>Feature</th>
            <th>Quando</th>
          </tr>
        </thead>
        <tbody>
          ${roadmap.map(r => `
          <tr>
            <td style="font-size:16px;width:40px">${r.status}</td>
            <td>${r.item}</td>
            <td><span class="match-ai-badge" style="background:var(--surface2);color:var(--text3)">${r.when}</span></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="ai-inv-h2">
  <div class="section-inner">
    <span class="section-eyebrow">AI per investitori</span>
    <h2 class="section-title" id="ai-inv-h2">L'orchestra AI<br/><span class="accent">in numeri.</span></h2>
    <p class="section-lead">Per il dettaglio tecnico completo dell'architettura AI, vedi la <a href="/matching/intelligenza-artificiale">pagina dedicata</a>.</p>
    <div class="match-kpi-grid">
      <div class="match-kpi"><div class="match-kpi-val">6</div><div class="match-kpi-lbl">AI specializzate</div></div>
      <div class="match-kpi"><div class="match-kpi-val">8</div><div class="match-kpi-lbl">Modelli orchestrati</div></div>
      <div class="match-kpi"><div class="match-kpi-val">4</div><div class="match-kpi-lbl">Provider in failover</div></div>
      <div class="match-kpi"><div class="match-kpi-val">60-80%</div><div class="match-kpi-lbl">Risparmio costi AI stimato</div></div>
      <div class="match-kpi"><div class="match-kpi-val">100%</div><div class="match-kpi-lbl">Decisioni auditabili</div></div>
      <div class="match-kpi"><div class="match-kpi-val">0</div><div class="match-kpi-lbl">Azioni distruttive autonome</div></div>
    </div>
    <div style="text-align:center;margin-top:24px">
      <a class="btn btn-outline" href="/matching/intelligenza-artificiale">Vai alla pagina AI completa →</a>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2>Interessato a <span style="color:var(--accent)">investire o collaborare?</span></h2>
  <p>Siamo in fase early — il momento giusto per entrare. Scrivici per una call.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="mailto:invest@bikerlink.app">📩 Contattaci</a>
    <a class="btn btn-outline" href="/investors">Investor deck completo</a>
    <a class="btn btn-outline" href="/matching/pdf" target="_blank" rel="noopener">📄 Scarica PDF</a>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{primaryColor:'#1A1A1A',primaryTextColor:'#F0F0F0',primaryBorderColor:'#FF3B30',lineColor:'#555',background:'#0A0A0A'}});}});</script>
`;
  return { meta, body };
}
