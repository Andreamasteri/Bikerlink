import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingAI(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/intelligenza-artificiale",
    title: "Il Cervello AI di BikerLink — 6 AI specializzate, 8 modelli, 4 provider",
    description: "BikerLink non usa una sola AI: 6 sistemi specializzati, 8 modelli orchestrati in cascata (Anthropic, OpenAI, Google, self-hosted), failover automatico e 100% delle decisioni loggato e auditabile.",
    ogImage: `${baseUrl}/assets/images/playstore-feature-graphic.png`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Intelligenza Artificiale", path: "/matching/intelligenza-artificiale" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: "Il Cervello AI di BikerLink",
        description: "6 AI specializzate, 8 modelli, 4 provider con failover automatico.",
        url: `${baseUrl}/matching/intelligenza-artificiale`,
        inLanguage: "it-IT",
        datePublished: "2024-11-01",
        dateModified: "2025-05-15",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntityOfPage: `${baseUrl}/matching/intelligenza-artificiale`,
      },
    ],
  };

  const brains = [
    { icon: "🛡️", title: "AI Moderazione", desc: "Analizza ogni segnalazione, distingue spam e ritorsioni dai problemi veri, suggerisce azioni al moderatore umano. Non agisce da sola su decisioni irreversibili." },
    { icon: "👁️", title: "AI Watchdog Sistema", desc: "Monitora 24/7 metriche, log ed errori. Auto-corregge i problemi noti e documentati, allerta gli admin solo per quelli nuovi o anomali." },
    { icon: "🚀", title: "AI Orchestrator OTA", desc: "Gestisce gli aggiornamenti dell'app: decide quando rilasciare, come segmentare il rollout, e come eseguire il rollback automatico se qualcosa va storto." },
    { icon: "🗄️", title: "AI Integrità Database", desc: "Controlla che i dati siano coerenti tra tabelle e microservizi. Ripara automaticamente le piccole incongruenze, segnala quelle grandi per revisione umana." },
    { icon: "🧩", title: "AI Integrità App", desc: "Analizza il codice e l'interfaccia: trova duplicazioni, traduzioni mancanti, configurazioni incoerenti. È il QA automatizzato che non dorme mai." },
    { icon: "🧠", title: "AI Console Unificata", desc: "La chat unica dove l'admin parla con tutti i 5 sistemi sopra contemporaneamente. Correla eventi tra sottosistemi diversi e risponde in linguaggio naturale." },
  ];

  const stackRows = [
    { role: "Cervello principale", model: "Claude Sonnet 4.6", provider: "Anthropic", usage: "Tutte le decisioni complesse" },
    { role: "Router veloce", model: "Gemini 2.5 Flash-Lite", provider: "Google", usage: "Classificazione rapida e instradamento" },
    { role: "Heavy reasoning", model: "Claude Opus 4.7", provider: "Anthropic", usage: "Audit settimanali, casi rari e critici" },
    { role: "Fallback 1", model: "GPT-5.1", provider: "OpenAI", usage: "Se Anthropic non risponde" },
    { role: "Fallback 2", model: "Gemini 2.5 Pro", provider: "Google", usage: "Se anche OpenAI non risponde" },
    { role: "Embeddings testuali", model: "text-embedding-3-large", provider: "OpenAI", usage: "Similarità bio e gusti musicali" },
    { role: "Embeddings locali", model: "multilingual-e5-small", provider: "Self-hosted", usage: "Fallback se cloud non risponde" },
    { role: "Routing curvy", model: "Gemini 2.5 Pro", provider: "Google", usage: "Generazione waypoint moto" },
  ];

  const kpis = [
    { val: "6", lbl: "Sottosistemi AI specializzati" },
    { val: "8", lbl: "Modelli orchestrati in cascata" },
    { val: "4", lbl: "Provider con failover automatico" },
    { val: "99.95%", lbl: "Uptime atteso (ridondanza)" },
    { val: "100%", lbl: "Decisioni AI loggato & auditabile" },
    { val: "0", lbl: "Azioni distruttive autonome" },
  ];

  const body = `
${matchSubnav("/matching/intelligenza-artificiale")}

<section class="match-hero" aria-labelledby="ai-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; <span data-i18n="match.ai.breadcrumb">Intelligenza Artificiale</span></div>
  <div class="match-hero-eyebrow" data-i18n="match.ai.eyebrow">L'orchestra AI</div>
  <h1 id="ai-h1" data-i18n-html="match.ai.h1">IL CERVELLO<br/><span class="accent">AI</span> DI<br/>BIKERLINK</h1>
  <p class="lead" data-i18n="match.ai.lead">6 sistemi AI specializzati. 4 provider in fallback. 8 modelli orchestrati. Zero compromessi sulla precisione — e zero azioni autonome irreversibili.</p>
</section>

<div class="match-stats" role="region" aria-label="KPI AI">
  ${kpis.map(k => `<div class="match-stat"><div class="match-stat-val">${k.val}</div><div class="match-stat-lbl">${k.lbl}</div></div>`).join("")}
</div>

<section class="section" aria-labelledby="brains-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.ai.brains.eyebrow">I 6 cervelli</span>
    <h2 class="section-title" id="brains-h2" data-i18n="match.ai.brains.title">Non una AI.<br/><span class="accent">Un'orchestra.</span></h2>
    <p class="section-lead" data-i18n="match.ai.brains.lead">Ogni AI è ottimizzata sul suo dominio specifico. Una sola AI generalista farebbe peggio su tutto — BikerLink usa specialisti.</p>

    <div class="match-ai-brains">
      ${brains.map(b => `
      <div class="match-ai-brain">
        <div class="match-ai-brain-icon">${b.icon}</div>
        <div class="match-ai-brain-title">${b.title}</div>
        <div class="match-ai-brain-desc">${b.desc}</div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="matching-ai-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.ai.matching.eyebrow">Matching</span>
    <h2 class="section-title" id="matching-ai-h2" data-i18n="match.ai.matching.title">Il matching usa<br/><span class="accent">altre 2 AI.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:32px">
      <div class="match-ai-brain" style="border-color:rgba(255,59,48,.3)">
        <div class="match-ai-brain-icon">🎵</div>
        <div class="match-ai-brain-title" data-i18n="match.ai.embed.title">Embeddings semantici</div>
        <div class="match-ai-brain-desc" data-i18n="match.ai.embed.desc">Per bio e gusti musicali. Usa OpenAI text-embedding-3-large (1536 dimensioni) con fallback su modello self-hosted multilingual-e5-small. Capisce affinità concettuali oltre le parole esatte — "amo i passi" e "appassionato di montagna" vengono letti come simili.</div>
      </div>
      <div class="match-ai-brain" style="border-color:rgba(255,59,48,.3)">
        <div class="match-ai-brain-icon">🗺️</div>
        <div class="match-ai-brain-title" data-i18n="match.ai.routing.title">AI di routing curvy</div>
        <div class="match-ai-brain-desc" data-i18n="match.ai.routing.desc">Gemini 2.5 Pro genera waypoint intermedi per percorsi moto curvi su OSM + GraphHopper. Evita autostrade, cerca strade con più curve, ottimizza per il tipo di moto e stile di guida. Già in produzione.</div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="why-many-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.ai.why.eyebrow">Architettura</span>
    <h2 class="section-title" id="why-many-h2" data-i18n="match.ai.why.title">Perché tante AI<br/><span class="accent">invece di una?</span></h2>
    <div class="grid grid-3" style="margin-top:32px">
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
        <h3 data-i18n="match.ai.why.c1.title">Specializzazione</h3>
        <p data-i18n="match.ai.why.c1.desc">Ogni AI è ottimizzata sul suo dominio (moderazione ≠ database integrity ≠ routing). Una sola AI generalista farebbe peggio su tutto.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
        <h3 data-i18n="match.ai.why.c2.title">Ridondanza in cascata</h3>
        <p data-i18n="match.ai.why.c2.desc">Ogni cervello principale ha 3 modelli in fallback (Anthropic → OpenAI → Google). Se un provider va giù, BikerLink continua a funzionare.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <h3 data-i18n="match.ai.why.c3.title">Costo controllato</h3>
        <p data-i18n="match.ai.why.c3.desc">Compiti semplici → modello da $0.10/M token. Compiti complessi → $3/M. Casi critici → $5/M. Risparmio stimato 60–80% vs "GPT per tutto".</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
        <h3 data-i18n="match.ai.why.c4.title">Trasparenza totale</h3>
        <p data-i18n="match.ai.why.c4.desc">Ogni decisione AI è loggata, spiegata in italiano, e revisionabile dall'admin. Mai azioni autonome irreversibili.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg></div>
        <h3 data-i18n="match.ai.why.c5.title">Human-in-the-loop</h3>
        <p data-i18n="match.ai.why.c5.desc">Le AI suggeriscono, l'admin approva. Nessuna azione distruttiva (ban, eliminazione dati, rollback) senza conferma umana.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <h3 data-i18n="match.ai.why.c6.title">Monitoraggio 24/7</h3>
        <p data-i18n="match.ai.why.c6.desc">Il Watchdog AI monitora metriche, latenze e log in tempo reale. Problemi noti vengono risolti automaticamente — gli admin dormono.</p>
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="stack-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.ai.stack.eyebrow">Stack AI</span>
    <h2 class="section-title" id="stack-h2" data-i18n="match.ai.stack.title">Lo stack AI<br/><span class="accent">in tabella.</span></h2>
    <div class="match-ai-table-wrap">
      <table class="match-ai-table" aria-label="Stack AI BikerLink">
        <thead>
          <tr>
            <th data-i18n="match.ai.table.role">Ruolo</th>
            <th data-i18n="match.ai.table.model">Modello</th>
            <th data-i18n="match.ai.table.provider">Provider</th>
            <th data-i18n="match.ai.table.usage">Quando lo usiamo</th>
          </tr>
        </thead>
        <tbody>
          ${stackRows.map(r => `
          <tr>
            <td>${r.role}</td>
            <td><code>${r.model}</code></td>
            <td><span class="match-ai-badge">${r.provider}</span></td>
            <td style="color:var(--text2);font-size:13px">${r.usage}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="fallback-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.ai.fallback.eyebrow">Resilienza</span>
    <h2 class="section-title" id="fallback-h2" data-i18n="match.ai.fallback.title">La cascata<br/><span class="accent">di fallback.</span></h2>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 24px;margin:28px 0;overflow-x:auto">
      <div class="mermaid" style="max-width:600px;margin:0 auto">
flowchart LR
  A["🏆 Claude Sonnet 4.6<br/>(Anthropic)"] -->|fallisce| B["🔁 GPT-5.1<br/>(OpenAI)"]
  B -->|fallisce| C["🔁 Gemini 2.5 Pro<br/>(Google)"]
  C -->|fallisce| D["⚠️ Degradazione graceful<br/>(risposta minima garantita)"]
  style A fill:#1A1A1A,stroke:#FF3B30,color:#F0F0F0
  style B fill:#1A1A1A,stroke:#555,color:#F0F0F0
  style C fill:#1A1A1A,stroke:#555,color:#F0F0F0
  style D fill:#1A1A1A,stroke:#444,color:#A3A3A3
      </div>
    </div>
    <div class="prose" style="max-width:680px">
      <p data-i18n="match.ai.fallback.p1">Se Anthropic non risponde entro il timeout, la richiesta passa automaticamente a OpenAI. Se anche OpenAI fallisce, va a Google. Se tutti e tre sono offline contemporaneamente (probabilità &lt;0.05%), il sistema risponde con una modalità degradata — lenta ma funzionante. Zero downtime visibile all'utente.</p>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2 data-i18n="match.ai.cta.title">Vuoi vedere <span style="color:var(--accent)">la console AI in azione?</span></h2>
  <p data-i18n="match.ai.cta.desc">Contattaci per una demo riservata — mostriamo i log, le decisioni in tempo reale e l'architettura completa.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="mailto:invest@bikerlink.app" data-i18n="match.ai.cta.btn1">Richiedi una demo</a>
    <a class="btn btn-outline" href="/matching/per-investitori" data-i18n="match.ai.cta.btn2">Versione investitori →</a>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{primaryColor:'#1A1A1A',primaryTextColor:'#F0F0F0',primaryBorderColor:'#FF3B30',lineColor:'#666',background:'#0A0A0A'}});}});</script>
`;
  return { meta, body };
}

// ── PAGE 6: PRIVACY (/matching/privacy) ──────────────────────────────────────
