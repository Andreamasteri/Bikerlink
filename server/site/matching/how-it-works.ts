import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingHowItWorks(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/come-funziona",
    title: "Come funziona il matching BikerLink — Dal profilo al match in 5 step",
    description: "Il flow completo del sistema di matching BikerLink: profilo, tracking GPS, engine di scoring, filtri e proposta dei top match con badge di trasparenza.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Come funziona", path: "/matching/come-funziona" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Come funziona il matching BikerLink",
        description: "Dal profilo al match in 5 step: profilo, tracking GPS, engine, filtri, proposta.",
        url: `${baseUrl}/matching/come-funziona`,
      },
    ],
  };

  const steps = [
    {
      num: "01",
      title: "Compili il profilo",
      desc: "Moto posseduta, brand preferiti, bio libera, gusti musicali (anche testo libero — l'AI la legge e ne estrae le affinità), zona di residenza e preferenze di matching. Più dati condividi, più il sistema è preciso. Ma funziona anche con il minimo.",
      icon: "👤",
    },
    {
      num: "02",
      title: "Tracciamo i tuoi giri",
      desc: "Solo se attivi il tracking GPS. Registriamo percorsi, fasce orarie, lean angle e G-force (telemetria del telefono). Nessuna raccolta silenziosa in background — il GPS si attiva solo su tua richiesta esplicita. Ghost Mode disponibile se non vuoi essere visibile.",
      icon: "📍",
    },
    {
      num: "03",
      title: "L'engine calcola l'affinità",
      desc: "Il cuore del sistema: 17 segnali combinati con pesi configurabili — brand moto, distanza geohash, overlap temporale, affinità musicale semantica, route affinity, lean angle, G-force, tag comuni, lingua, età, club condivisi e altro. Ogni segnale produce uno score normalizzato, sommato in un punteggio finale.",
      icon: "⚙️",
    },
    {
      num: "04",
      title: "Applichi i tuoi filtri",
      desc: "Puoi escludere tipi di moto, fasce d'età, generi, o specifici utenti (block). Le preferenze negative (hai ignorato 5 scooter → smette di proporne) vengono applicate automaticamente dal feedback loop senza che tu debba configurare nulla.",
      icon: "🔧",
    },
    {
      num: "05",
      title: "Ricevi i top match con il 'perché'",
      desc: "I candidati più compatibili appaiono con un badge di trasparenza: \"Stessa moto\", \"Stesso orario di guida\", \"Percorsi simili\". Sai sempre perché ti è stato proposto un biker — zero black box, massima fiducia.",
      icon: "🏍️",
    },
  ];

  const body = `
${matchSubnav("/matching/come-funziona")}

<section class="match-hero" aria-labelledby="how-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; Come funziona</div>
  <div class="match-hero-eyebrow">Il flow completo</div>
  <h1 id="how-h1">DAL PROFILO<br/>AL <span class="accent">MATCH</span></h1>
  <p class="lead">5 step dal momento in cui compili il profilo al momento in cui trovi il biker giusto. Nessuna black box — ogni fase è spiegata.</p>
</section>

<section class="section" aria-labelledby="flow-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Il flow</span>
    <h2 class="section-title" id="flow-h2">5 fasi.<br/><span class="accent">1 risultato.</span></h2>

    <!-- Inline SVG 5-step flow (statico, accessibile, SEO-friendly) -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 20px;margin:36px 0;overflow-x:auto">
      <svg viewBox="0 0 760 180" role="img" aria-labelledby="flow-svg-title flow-svg-desc" style="width:100%;max-width:760px;height:auto;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
        <title id="flow-svg-title">Flow del matching BikerLink in 5 step</title>
        <desc id="flow-svg-desc">Profilo → Tracking GPS → Engine scoring → Filtri → Top match con badge di trasparenza</desc>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#FF3B30"/>
          </marker>
        </defs>
        ${["👤 Profilo","📍 Tracking","⚙️ Engine","🔧 Filtri","🏍️ Match"].map((label,i)=>{
          const x = 20 + i*150;
          const accent = i===2;
          return `<g><rect x="${x}" y="50" width="130" height="80" rx="4" fill="#1A1A1A" stroke="${accent?'#FF3B30':'#333'}" stroke-width="${accent?2:1}"/><text x="${x+65}" y="85" text-anchor="middle" fill="${accent?'#FF3B30':'#F0F0F0'}" font-size="14" font-weight="700">${label.split(' ')[0]}</text><text x="${x+65}" y="108" text-anchor="middle" fill="#999" font-size="12">${label.split(' ').slice(1).join(' ')}</text><text x="${x+65}" y="35" text-anchor="middle" fill="#666" font-size="11" font-weight="700" letter-spacing="2">0${i+1}</text></g>${i<4?`<line x1="${x+130}" y1="90" x2="${x+150}" y2="90" stroke="#FF3B30" stroke-width="2" marker-end="url(#arrow)"/>`:''}`;
        }).join("")}
      </svg>
    </div>

    <!-- Mermaid flow diagram (interattivo) -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 20px;margin:36px 0;overflow-x:auto">
      <div class="mermaid" style="max-width:700px;margin:0 auto">
flowchart TD
  A["👤 Profilo utente<br/>(moto, musica, bio, zona)"] --> B["📍 Tracking GPS<br/>(percorsi, orari, telemetria)"]
  B --> C["⚙️ Engine scoring<br/>(17 segnali → score 0-1)"]
  A --> C
  C --> D["🔧 Filtri &amp; preferenze<br/>(esclusioni, blocchi, neg. feedback)"]
  D --> E["🏍️ Top match<br/>(con badge trasparenza)"]
  style A fill:#1A1A1A,stroke:#FF3B30,color:#F0F0F0
  style B fill:#1A1A1A,stroke:#333,color:#F0F0F0
  style C fill:#1A1A1A,stroke:#FF3B30,color:#FF3B30
  style D fill:#1A1A1A,stroke:#333,color:#F0F0F0
  style E fill:#1A1A1A,stroke:#FF3B30,color:#F0F0F0
      </div>
    </div>

    <div class="match-flow" role="list">
      ${steps.map(s => `
      <div class="match-step" role="listitem">
        <div class="match-step-num" aria-hidden="true">${s.num}</div>
        <div class="match-step-body">
          <h3><span aria-hidden="true">${s.icon}</span> ${s.title}</h3>
          <p>${s.desc}</p>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="scoring-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Il cuore dell'engine</span>
    <h2 class="section-title" id="scoring-h2">Come si calcola<br/><span class="accent">lo score.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:flex-start">
      <div class="prose" style="max-width:100%">
        <h3>Formula di base</h3>
        <p>Ogni segnale produce uno score S<sub>i</sub> normalizzato tra 0 e 1. Il punteggio finale è una media pesata:</p>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:16px 20px;margin:12px 0;font-family:monospace;font-size:15px;color:var(--accent)">
          score = Σ(w<sub>i</sub> × S<sub>i</sub>) / Σ(w<sub>i</sub>)
        </div>
        <svg viewBox="0 0 460 150" role="img" aria-labelledby="score-svg-title score-svg-desc" style="width:100%;max-width:460px;height:auto;display:block;margin:18px auto" xmlns="http://www.w3.org/2000/svg">
          <title id="score-svg-title">Visualizzazione contributo segnali allo score finale</title>
          <desc id="score-svg-desc">Barre orizzontali che mostrano il peso relativo di 4 categorie di segnali sullo score finale del matching</desc>
          ${[
            {l:"Geo-temporali", w:35, c:"#FF3B30"},
            {l:"Telemetrici", w:25, c:"#FF3B30"},
            {l:"Semantici (bio/musica)", w:22, c:"#888"},
            {l:"Diretti (brand/tag)", w:18, c:"#888"},
          ].map((b,i)=>`<text x="10" y="${22+i*32}" fill="#F0F0F0" font-size="12" font-weight="600">${b.l}</text><rect x="170" y="${12+i*32}" width="240" height="14" rx="2" fill="#1A1A1A" stroke="#333"/><rect x="170" y="${12+i*32}" width="${b.w*6.8}" height="14" rx="2" fill="${b.c}" opacity="0.85"/><text x="420" y="${22+i*32}" fill="#999" font-size="11">${b.w}%</text>`).join("")}
        </svg>
        <p>I pesi <code>w<sub>i</sub></code> sono configurabili dall'admin e — parzialmente — dall'utente stesso. I segnali con più dati disponibili pesano di più; quelli senza dati (es. tracking non attivo) pesano zero.</p>
        <h3 style="margin-top:24px">Embeddings semantici</h3>
        <p>Per bio e musica usiamo embeddings vettoriali (OpenAI text-embedding-3-large + fallback self-hosted). Due biker con bio diverse ma simili concettualmente (es. "amo le montagne" e "appassionato di passi alpini") risultano compatibili anche senza parole identiche.</p>
      </div>
      <div>
        <div class="steps">
          <div class="step"><h3>Segnali diretti</h3><p>Brand moto, tag comuni, lingua, fascia d'età — confronto diretto con peso fisso.</p></div>
          <div class="step"><h3>Segnali geo-temporali</h3><p>Distanza geohash, overlap fasce orarie di guida, zone percorse — richiedono tracking attivo.</p></div>
          <div class="step"><h3>Segnali semantici</h3><p>Affinità bio e musica via embeddings — catturano il "significato" oltre le parole esatte.</p></div>
          <div class="step"><h3>Segnali telemetrici</h3><p>Lean angle medio, G-force laterale, velocità in curva — lo stile di guida reale.</p></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-label="Badge di trasparenza">
  <div class="section-inner">
    <span class="section-eyebrow">Trasparenza</span>
    <h2 class="section-title">Sai sempre <span class="accent">perché.</span></h2>
    <p class="section-lead">Ogni match è accompagnato da badge che spiegano i motivi principali. Nessuna black box.</p>
    <div class="grid grid-4" style="margin-top:28px">
      ${[
        { icon: "🏍️", label: "Stessa moto" },
        { icon: "🎵", label: "Stessa musica" },
        { icon: "🗺️", label: "Percorsi simili" },
        { icon: "⏰", label: "Stesso orario" },
        { icon: "📍", label: "Zona vicina" },
        { icon: "🏁", label: "Stesso stile" },
        { icon: "🏛️", label: "Stesso club" },
        { icon: "⭐", label: "Alta affinità" },
      ].map(b => `
      <div class="card" style="text-align:center;padding:18px 12px">
        <div style="font-size:24px;margin-bottom:8px">${b.icon}</div>
        <div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text2)">${b.label}</div>
      </div>`).join("")}
    </div>
  </div>
</section>

<div class="cta-block">
  <h2>Vuoi vedere tutti i <span style="color:var(--accent)">17 tipi di segnale?</span></h2>
  <p>La pagina successiva li elenca tutti con icona e spiegazione in linguaggio semplice.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/matching/tipi-di-match">I 17 tipi di match →</a>
    <a class="btn btn-outline" href="/matching">← Torna all'overview</a>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{primaryColor:'#1A1A1A',primaryTextColor:'#F0F0F0',primaryBorderColor:'#FF3B30',lineColor:'#666',background:'#0A0A0A'}});}});</script>
`;
  return { meta, body };
}

// ── PAGE 3: TIPI DI MATCH (/matching/tipi-di-match) ──────────────────────────
