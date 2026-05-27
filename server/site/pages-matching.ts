import { type PageMeta, breadcrumbsJsonLd } from "./render";

// ── SHARED MATCHING CSS ────────────────────────────────────────────────────────
export const MATCHING_CSS = `<style>
/* ── MATCHING HERO ── */
.match-hero{padding:120px 24px 64px;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,59,48,.18) 0%,transparent 70%),var(--bg);text-align:center;border-bottom:1px solid var(--border)}
.match-hero-eyebrow{font-size:13px;font-weight:700;letter-spacing:4px;color:var(--accent);text-transform:uppercase;margin-bottom:20px;display:inline-flex;align-items:center;gap:10px}
.match-hero-eyebrow::before,.match-hero-eyebrow::after{content:"";display:block;width:28px;height:1px;background:var(--accent)}
.match-hero h1{font-family:var(--font-display);font-size:clamp(48px,9vw,96px);line-height:.93;letter-spacing:4px;text-transform:uppercase;margin-bottom:20px}
.match-hero h1 .accent{color:var(--accent)}
.match-hero .lead{font-size:18px;color:var(--text2);max-width:680px;margin:0 auto 32px;line-height:1.75}
.match-breadcrumb{font-size:13px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:28px}
.match-breadcrumb a{color:var(--text3)}
@media (hover:hover) and (pointer:fine){.match-breadcrumb a:hover{color:var(--text2)}}

/* ── PROMISE CARDS ── */
.match-promises{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:48px}
@media(max-width:720px){.match-promises{grid-template-columns:1fr}}
.match-promise{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 24px;text-align:left;transition:border-color .2s}
@media (hover:hover) and (pointer:fine){.match-promise:hover{border-color:rgba(255,59,48,.35)}}
.match-promise-icon{font-size:28px;margin-bottom:14px}
.match-promise-title{font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:8px}
.match-promise-desc{font-size:14px;color:var(--text2);line-height:1.6}

/* ── STATS ROW ── */
.match-stats{display:flex;flex-wrap:wrap;background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.match-stat{flex:1;min-width:160px;padding:28px 24px;text-align:center;border-right:1px solid var(--border)}
.match-stat:last-child{border-right:none}
.match-stat-val{font-family:var(--font-display);font-size:40px;letter-spacing:2px;color:var(--accent);line-height:1;margin-bottom:6px}
.match-stat-lbl{font-size:13px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase}
@media(max-width:640px){.match-stat{min-width:50%;border-right:none;border-bottom:1px solid var(--border)}.match-stat:last-child{border-bottom:none}}

/* ── STEP FLOW ── */
.match-flow{display:grid;gap:0;counter-reset:flow}
.match-step{display:grid;grid-template-columns:80px 1fr;gap:24px;align-items:flex-start;padding:36px 0;border-bottom:1px solid var(--border)}
.match-step:last-child{border-bottom:none}
.match-step-num{font-family:var(--font-display);font-size:56px;letter-spacing:2px;color:var(--accent);line-height:1;opacity:.6;text-align:center;padding-top:6px}
.match-step-body h3{font-family:var(--font-display);font-size:22px;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:10px}
.match-step-body p{font-size:15px;color:var(--text2);line-height:1.75;max-width:560px}
@media(max-width:600px){.match-step{grid-template-columns:50px 1fr;gap:14px}.match-step-num{font-size:36px}}

/* ── TYPES GRID ── */
.match-types-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:36px}
.match-type-card{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:20px 18px;display:flex;gap:14px;align-items:flex-start;transition:border-color .2s,transform .2s}
@media (hover:hover) and (pointer:fine){.match-type-card:hover{border-color:rgba(255,59,48,.35);transform:translateY(-2px)}}
.match-type-icon{font-size:22px;flex-shrink:0;line-height:1;margin-top:2px}
.match-type-name{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:4px}
.match-type-desc{font-size:13px;color:var(--text2);line-height:1.5}

/* ── DECAY CHART ── */
.match-decay-chart{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:24px;margin:28px 0}
.match-decay-svg{width:100%;max-width:600px;height:180px;display:block;margin:0 auto}

/* ── AI TABLE ── */
.match-ai-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:4px;margin-top:24px}
.match-ai-table{width:100%;border-collapse:collapse;min-width:560px;font-size:14px}
.match-ai-table th,.match-ai-table td{padding:12px 16px;border-bottom:1px solid var(--border);text-align:left}
.match-ai-table thead th{background:var(--surface);font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3)}
.match-ai-table tbody tr:last-child td{border-bottom:none}
@media (hover:hover) and (pointer:fine){.match-ai-table tbody tr:hover td{background:rgba(255,255,255,.025)}}
.match-ai-table td:first-child{font-weight:600;color:var(--text)}
.match-ai-badge{display:inline-block;background:rgba(255,59,48,.12);color:var(--accent);font-size:11px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:2px;text-transform:uppercase}

/* ── KPI CARDS (investors) ── */
.match-kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}
@media(max-width:640px){.match-kpi-grid{grid-template-columns:1fr 1fr}}
.match-kpi{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:4px;padding:20px 18px;text-align:center}
.match-kpi-val{font-family:var(--font-display);font-size:36px;letter-spacing:2px;color:var(--accent);line-height:1;margin-bottom:4px}
.match-kpi-lbl{font-size:12px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase;line-height:1.4}

/* ── AI BRAIN CARDS ── */
.match-ai-brains{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin:28px 0}
.match-ai-brain{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:22px 20px;transition:border-color .2s}
@media (hover:hover) and (pointer:fine){.match-ai-brain:hover{border-color:rgba(255,59,48,.35)}}
.match-ai-brain-icon{font-size:28px;margin-bottom:10px}
.match-ai-brain-title{font-family:var(--font-display);font-size:18px;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:6px}
.match-ai-brain-desc{font-size:13px;color:var(--text2);line-height:1.6}

/* ── SUB-NAV ── */
.match-subnav{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}
.match-subnav-inner{max-width:var(--max);margin:0 auto;display:flex;gap:0}
.match-subnav a{display:inline-flex;align-items:center;padding:14px 18px;font-size:13px;font-weight:600;letter-spacing:.5px;color:var(--text3);text-decoration:none;text-transform:uppercase;border-bottom:2px solid transparent;transition:color .15s,border-color .15s;white-space:nowrap}
@media (hover:hover) and (pointer:fine){.match-subnav a:hover{color:var(--text)}}
.match-subnav a.active{color:var(--accent);border-color:var(--accent)}

/* ── PRIVACY LIST ── */
.match-privacy-list{list-style:none;display:flex;flex-direction:column;gap:10px;margin:20px 0}
.match-privacy-item{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;background:var(--surface);border:1px solid var(--border);border-radius:4px;font-size:14px;color:var(--text2);line-height:1.6}
.match-privacy-item .pi-icon{font-size:18px;flex-shrink:0;margin-top:1px}
.match-privacy-item strong{color:var(--text)}

/* ── ARCH DIAGRAM ── */
.match-arch{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 24px;margin:24px 0;text-align:center}
.match-arch svg{max-width:640px;width:100%;height:auto}

/* ── PAGE IMG ── */
.match-page-img{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:4px;border:1px solid var(--border);margin:24px 0;display:block}
.match-page-img-sm{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;border:1px solid var(--border);margin:20px 0;display:block}
</style>`;

// ── SUB-NAV ───────────────────────────────────────────────────────────────────
function matchSubnav(current: string): string {
  const links = [
    { href: "/matching", label: "Overview" },
    { href: "/matching/come-funziona", label: "Come funziona" },
    { href: "/matching/tipi-di-match", label: "I 17 tipi" },
    { href: "/matching/come-impara", label: "Come impara" },
    { href: "/matching/intelligenza-artificiale", label: "AI" },
    { href: "/matching/privacy", label: "Privacy" },
    { href: "/matching/per-investitori", label: "Investitori" },
  ];
  return `
<nav class="match-subnav" aria-label="Sezioni matching">
  <div class="match-subnav-inner">
    ${links.map(l => `<a href="${l.href}"${l.href === current ? ' class="active" aria-current="page"' : ''}>${l.label}</a>`).join("")}
  </div>
</nav>`;
}

// ── PAGE 1: OVERVIEW (/matching) ──────────────────────────────────────────────
export function buildMatchingOverview(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching",
    title: "Matching BikerLink — Come ti facciamo incontrare i biker giusti",
    description: "Il sistema di matching di BikerLink usa 17 segnali di affinità, embeddings semantici e telemetria reale per connetterti con i biker più compatibili. Scopri come funziona.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Come ti facciamo incontrare i biker giusti",
        description: "Il sistema di matching di BikerLink: 17 segnali, embeddings, geo e feedback loop.",
        url: `${baseUrl}/matching`,
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
      },
    ],
  };

  const body = `
${matchSubnav("/matching")}

<section class="match-hero" aria-labelledby="match-hero-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Matching</div>
  <div class="match-hero-eyebrow">Sistema matching</div>
  <h1 id="match-hero-h1">COME TI FACCIAMO<br/><span class="accent">INCONTRARE</span><br/>I BIKER GIUSTI</h1>
  <p class="lead">Non un algoritmo generico. Un'orchestra di 17 segnali, intelligenza artificiale, dati reali dalla strada — per proporti solo chi è davvero compatibile con il tuo modo di guidare.</p>
  <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:8px">
    <a class="btn btn-primary" href="/matching/come-funziona">Scopri come funziona →</a>
    <a class="btn btn-outline" href="/matching/per-investitori">Versione tecnica</a>
  </div>
</section>

<div class="match-stats" role="region" aria-label="Statistiche matching">
  <div class="match-stat"><div class="match-stat-val">17</div><div class="match-stat-lbl">Segnali di affinità</div></div>
  <div class="match-stat"><div class="match-stat-val">&lt;200ms</div><div class="match-stat-lbl">Latenza engine</div></div>
  <div class="match-stat"><div class="match-stat-val">6</div><div class="match-stat-lbl">AI specializzate</div></div>
  <div class="match-stat"><div class="match-stat-val">0</div><div class="match-stat-lbl">Pubblicità nei match</div></div>
</div>

<section class="section" aria-labelledby="match-promises-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Le 3 promesse</span>
    <h2 class="section-title" id="match-promises-h2">Non a caso.<br/><span class="accent">Per davvero.</span></h2>
    <p class="section-lead">Il matching non è una lista di utenti vicini. È un sistema che impara da ogni tuo sì e ogni tuo no, e migliora ogni settimana.</p>

    <div class="match-promises">
      <div class="match-promise">
        <div class="match-promise-icon">🎯</div>
        <div class="match-promise-title">Match veri, non a caso</div>
        <p class="match-promise-desc">Non ti mostriamo chi è vicino a te geograficamente e basta. Analizziamo moto, stile di guida, gusti musicali, orari, percorsi — 17 dimensioni di compatibilità reale.</p>
      </div>
      <div class="match-promise">
        <div class="match-promise-icon">🧠</div>
        <div class="match-promise-title">Impariamo dai tuoi sì e no</div>
        <p class="match-promise-desc">Ogni swipe, ogni ignora, ogni connessione avviata alimenta il feedback loop. Il sistema aggiusta i pesi e ti propone match sempre più pertinenti col passare del tempo.</p>
      </div>
      <div class="match-promise">
        <div class="match-promise-icon">🏍️</div>
        <div class="match-promise-title">Geo + Tempo + Musica + Strade</div>
        <p class="match-promise-desc">Distanza intelligente (geohash), fasce orarie di guida, affinità musicale da testi liberi, e percorsi reali con lean angle e G-force: nessun altro fa matching così.</p>
      </div>
    </div>

    <div style="margin-top:40px;text-align:center">
      <a class="btn btn-primary" href="/matching/come-funziona">Dal profilo al match: il flow completo →</a>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="match-why-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Perché esiste</span>
    <h2 class="section-title" id="match-why-h2">Il problema<br/><span class="accent">che risolviamo.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:center">
      <div class="prose" style="max-width:100%">
        <p>Trovare compagni di viaggio compatibili è difficile. Nei gruppi WhatsApp finisci nel caos. Sui social non sai chi guida davvero o chi fa solo foto. Alle uscite di club non sai se il ritmo sarà il tuo.</p>
        <p>BikerLink risolve il problema alla radice: costruiamo un profilo multidimensionale da dati reali — la moto che hai, le strade che percorri, gli orari in cui esci, la musica che ascolti, lo stile con cui guidi — e li usiamo per proporti persone con cui condividere una giornata su due ruote ha senso.</p>
        <p>Il risultato non è solo una lista di utenti. È un compagno di giro che probabilmente ha già percorso le tue stesse strade, ascolta la tua stessa musica, e guida allo stesso ritmo.</p>
      </div>
      <div>
        <div class="match-promises" style="grid-template-columns:1fr;gap:12px">
          <div class="match-promise" style="padding:18px 16px">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:20px">❌</span>
              <div>
                <div class="match-promise-title" style="font-size:15px;margin-bottom:3px">Senza BikerLink</div>
                <p class="match-promise-desc" style="font-size:13px">Gruppi WhatsApp caotici, uscite incompatibili per ritmo, persone sconosciute con cui non hai nulla in comune.</p>
              </div>
            </div>
          </div>
          <div class="match-promise" style="padding:18px 16px;border-color:rgba(255,59,48,.3)">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:20px">✅</span>
              <div>
                <div class="match-promise-title" style="font-size:15px;margin-bottom:3px">Con BikerLink</div>
                <p class="match-promise-desc" style="font-size:13px">Match basati su 17 segnali reali. Trovi chi guida al tuo ritmo, sulle tue strade, nei tuoi orari — senza cercare.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="match-nav-h2">
  <div class="section-inner" style="text-align:center">
    <span class="section-eyebrow">Manuale completo</span>
    <h2 class="section-title" id="match-nav-h2">Esplora il sistema<br/><span class="accent">passo per passo.</span></h2>
    <div class="grid grid-3" style="margin-top:36px;text-align:left">
      <a href="/matching/come-funziona" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
        <h3>Come funziona</h3>
        <p>Dal profilo al match in 5 step. Il flow completo con diagramma.</p>
        <div class="meta">→ Leggi</div>
      </a>
      <a href="/matching/tipi-di-match" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <h3>I 17 tipi di match</h3>
        <p>Tutti i segnali spiegati in linguaggio semplice con icona e esempio.</p>
        <div class="meta">→ Esplora</div>
      </a>
      <a href="/matching/come-impara" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
        <h3>Come impara</h3>
        <p>Feedback loop, decay temporale, A/B testing e preferenze negative.</p>
        <div class="meta">→ Scopri</div>
      </a>
      <a href="/matching/intelligenza-artificiale" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
        <h3>Il cervello AI</h3>
        <p>6 AI specializzate, 8 modelli, 4 provider in fallback. Architettura completa.</p>
        <div class="meta">→ Leggi</div>
      </a>
      <a href="/matching/privacy" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <h3>Privacy</h3>
        <p>Cosa raccogliamo, cosa non facciamo, come disattivare ogni tipo di match.</p>
        <div class="meta">→ Leggi</div>
      </a>
      <a href="/matching/per-investitori" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
        <h3>Per investitori</h3>
        <p>Architettura tecnica, KPI, stack completo e vantaggio competitivo.</p>
        <div class="meta">→ Leggi</div>
      </a>
    </div>
  </div>
</section>

<section class="cta-block" aria-label="Download">
  <h2>Pronto a trovare<br/><span style="color:var(--accent)">il tuo compagno di giro?</span></h2>
  <p>Scarica BikerLink, completa il profilo e lascia che il matching faccia il resto. Gratis, per sempre.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/download">Scarica l'app</a>
    <a class="btn btn-outline" href="/matching/come-funziona">Come funziona →</a>
  </div>
</section>
`;
  return { meta, body };
}

// ── PAGE 2: COME FUNZIONA (/matching/come-funziona) ───────────────────────────
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

    <!-- Mermaid flow diagram -->
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
export function buildMatchingTypes(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/tipi-di-match",
    title: "I 17 tipi di match BikerLink — Tutti i segnali di affinità spiegati",
    description: "Tutti i 17 segnali di affinità del sistema matching BikerLink: brand moto, distanza, musica, lean angle, route affinity, overlap temporale e altro. Spiegati in linguaggio semplice.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "I 17 tipi", path: "/matching/tipi-di-match" },
      ]),
    ],
  };

  const types = [
    { icon: "🏍️", name: "Brand moto", desc: "Ti suggeriamo chi guida la tua marca preferita o una compatibile. Ducatisti con Ducatisti, BMW con BMW — ma anche combinazioni dichiarate come \"aperto a tutti\"." },
    { icon: "📍", name: "Distanza geohash", desc: "Non solo i km in linea d'aria: usiamo geohash a 5–6 cifre per zone di guida reale. Chi è nello stesso bacino stradale conta di più di chi è vicino ma su un'isola irraggiungibile." },
    { icon: "🎵", name: "Affinità musicale", desc: "Stessa musica = stesso ritmo. Analizziamo le preferenze musicali con embeddings semantici: \"metal\" e \"hard rock\" risultano vicini, anche senza parole identiche nel profilo." },
    { icon: "📐", name: "Lean angle (piega)", desc: "Chi ama le curve come te. Il lean angle medio estratto dalla telemetria del telefono (giroscopio + accelerometro) rivela lo stile reale — non quello dichiarato." },
    { icon: "💨", name: "G-force laterale", desc: "La forza laterale in curva è la firma del pilota. Chi ha G-force simile guida con lo stesso entusiasmo e ritmo — né troppo piano, né troppo veloce per te." },
    { icon: "🗺️", name: "Route affinity", desc: "Sovrapposizione geografica dei percorsi storici. Se avete percorso le stesse strade negli ultimi 3 mesi, probabilmente vi piace lo stesso tipo di paesaggio." },
    { icon: "⏰", name: "Overlap orario", desc: "Chi guida nelle tue stesse fasce orarie (mattina presto, weekend, sera). Se esci solo la domenica alle 7, ha senso conoscere chi fa lo stesso." },
    { icon: "🏁", name: "Stile di guida", desc: "Velocità media in percorso, accelerazioni, frenate — sintetizzati in un profilo di stile. Chi guida in modo simile è più compatibile per uscite in comune." },
    { icon: "🏛️", name: "Club condivisi", desc: "Essere nello stesso MotoClub o in club gemellati aumenta il match score. La community già costruita conta." },
    { icon: "🏷️", name: "Tag comuni", desc: "Hashtag nel profilo: #touring, #enduro, #track, #curvy. Chi condivide più tag ha più cose in comune su cui costruire una conversazione." },
    { icon: "📖", name: "Affinità bio", desc: "Embeddings semantici della descrizione libera. \"Amo i passi di montagna\" e \"Sono felice sulle curve alpine\" vengono letti come concetti simili." },
    { icon: "🌍", name: "Lingua e zona", desc: "Parlare la stessa lingua e stare nella stessa regione aumenta le chance di incontrarsi davvero. Ma non è un filtro bloccante — puoi cercare biker in tutto il paese." },
    { icon: "👤", name: "Fascia d'età", desc: "Opzionale e configurabile. Se non ti interessa filtrare per età, non pesa nulla. Se preferisci uscire con persone della tua generazione, il sistema lo rispetta." },
    { icon: "⭐", name: "Reputazione biker", desc: "Feedback degli utenti dopo le uscite, indice di risposta ai messaggi, segnalazioni zero. Un biker affidabile ha uno score di reputazione più alto." },
    { icon: "🔄", name: "Preferenze dichiarate", desc: "Cosa hai esplicitamente indicato: tipo di uscita preferita (touring, track, enduro), disponibilità a nuovi rider, se cerchi compagni o solo visibilità." },
    { icon: "📊", name: "Feedback storico", desc: "Il tuo storico di like/ignora/block. Chi hai già rifiutato non ti viene riproposto. Chi hai connesso con successo aiuta a calibrare i pesi futuri." },
    { icon: "🌡️", name: "Decay temporale", desc: "I match \"invecchiano\": un profilo non aggiornato da 90 giorni pesa meno. I biker attivi recentemente vengono proposti per primi." },
  ];

  const body = `
${matchSubnav("/matching/tipi-di-match")}

<section class="match-hero" aria-labelledby="types-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; I 17 tipi</div>
  <div class="match-hero-eyebrow">I segnali</div>
  <h1 id="types-h1">I <span class="accent">17</span> TIPI<br/>DI MATCH</h1>
  <p class="lead">Ogni match è il risultato di 17 segnali combinati. Qui trovi ognuno spiegato in linguaggio semplice — cosa misura, come funziona, e perché conta per trovare il compagno di giro giusto.</p>
</section>

<section class="section" aria-labelledby="types-grid-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Tutti i segnali</span>
    <h2 class="section-title" id="types-grid-h2">17 dimensioni.<br/><span class="accent">1 punteggio.</span></h2>
    <p class="section-lead">Ogni segnale ha un peso configurabile e — in futuro — un toggle utente per attivarlo o disattivarlo. Puoi scegliere cosa conta di più per te.</p>

    <div class="match-types-grid" role="list">
      ${types.map((t, i) => `
      <div class="match-type-card" role="listitem">
        <div class="match-type-icon" aria-hidden="true">${t.icon}</div>
        <div>
          <div class="match-type-name">${String(i + 1).padStart(2, "0")} · ${t.name}</div>
          <div class="match-type-desc">${t.desc}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="weights-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Pesi e controllo</span>
    <h2 class="section-title" id="weights-h2">Tu decidi<br/><span class="accent">cosa conta.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:center">
      <div class="prose" style="max-width:100%">
        <p>Ogni segnale ha un peso predefinito ottimizzato dai dati aggregati della community. Ma puoi personalizzarlo:</p>
        <ul>
          <li><strong>Toggle utente</strong> — disattiva completamente un segnale (es. non vuoi matching per musica)</li>
          <li><strong>Boost manuale</strong> — aumenta il peso di un segnale che per te è fondamentale (es. "voglio solo Ducatisti")</li>
          <li><strong>Preferenze negative</strong> — il sistema impara dai tuoi rifiuti e abbassa automaticamente il peso dei profili simili</li>
        </ul>
        <p>Il risultato: un sistema che parte ottimizzato per la media, ma si adatta al tuo profilo specifico nel tempo.</p>
      </div>
      <div class="steps">
        <div class="step"><h3>Primo giorno</h3><p>Pesi standard ottimizzati per la community media. Già buoni risultati dal primo utilizzo.</p></div>
        <div class="step"><h3>Dopo 1 settimana</h3><p>Il feedback loop ha già aggiustato 3–5 segnali basandosi sui tuoi like e ignora.</p></div>
        <div class="step"><h3>Dopo 1 mese</h3><p>Il tuo profilo di preferenze è stabile. I match sono altamente personalizzati sul tuo stile.</p></div>
      </div>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2>Vuoi capire come il sistema <span style="color:var(--accent)">impara?</span></h2>
  <p>Feedback loop, decay temporale, A/B testing — tutto spiegato nella sezione successiva.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/matching/come-impara">Come impara il sistema →</a>
    <a class="btn btn-outline" href="/matching/come-funziona">← Come funziona</a>
  </div>
</div>
`;
  return { meta, body };
}

// ── PAGE 4: COME IMPARA (/matching/come-impara) ───────────────────────────────
export function buildMatchingLearning(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/come-impara",
    title: "Come impara il matching BikerLink — Feedback loop, decay e A/B testing",
    description: "Il sistema di matching BikerLink impara dai tuoi sì e dai tuoi no: feedback loop continuo, decay temporale, A/B testing e preferenze negative. Spiegato con esempi reali.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Come impara", path: "/matching/come-impara" },
      ]),
    ],
  };

  const body = `
${matchSubnav("/matching/come-impara")}

<section class="match-hero" aria-labelledby="learn-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; Come impara</div>
  <div class="match-hero-eyebrow">Apprendimento continuo</div>
  <h1 id="learn-h1">IL SISTEMA<br/><span class="accent">IMPARA</span><br/>DA TE</h1>
  <p class="lead">Ogni tuo sì, ogni tuo no, ogni connessione avviata alimenta un ciclo di miglioramento continuo. Il matching diventa più preciso ogni giorno.</p>
</section>

<section class="section" aria-labelledby="feedback-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Feedback loop</span>
    <h2 class="section-title" id="feedback-h2">Il sistema impara<br/><span class="accent">dai tuoi sì e no.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:flex-start">
      <div class="prose" style="max-width:100%">
        <p>Ogni interazione è un segnale di apprendimento:</p>
        <ul>
          <li><strong>Like / Connessione avviata</strong> → il profilo viene usato come "positivo" per ricalibrate i pesi del tuo modello personale</li>
          <li><strong>Ignora / Skip</strong> → segnale negativo debole; il sistema evita profili simili nelle prossime 48h</li>
          <li><strong>Block</strong> → segnale negativo forte; quel profilo non tornerà mai, e il tipo di profilo viene penalizzato</li>
          <li><strong>Connessione con chat attiva</strong> → segnale positivo forte; hai incontrato qualcuno con cui hai conversato davvero</li>
        </ul>
        <p style="margin-top:16px">Esempio reale: hai ignorato 5 scooter di fila? Il sistema abbassa automaticamente il peso del brand "scooter" nel tuo profilo — senza che tu debba configurare nulla.</p>
      </div>
      <div>
        <div class="match-arch" style="text-align:left">
          <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:18px">Ciclo di apprendimento</div>
          <div class="steps" style="gap:10px">
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px">Proposta match</h3><p style="font-size:13px">Il sistema propone i top candidati con score attuale</p></div>
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px">Interazione utente</h3><p style="font-size:13px">Like, ignora, block, chat — ogni azione è registrata</p></div>
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px">Aggiornamento pesi</h3><p style="font-size:13px">I pesi personali vengono ricalibrati in background</p></div>
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px">Match migliori</h3><p style="font-size:13px">La prossima sessione parte con un modello più preciso</p></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="decay-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Decay temporale</span>
    <h2 class="section-title" id="decay-h2">I match<br/><span class="accent">invecchiano.</span></h2>
    <p class="section-lead">Un biker non attivo da 3 mesi non è il tuo compagno di giro ideale. Il decay temporale penalizza progressivamente i profili inattivi.</p>

    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:center">
      <div class="match-decay-chart" aria-label="Curva di decay esponenziale">
        <div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:12px;text-align:center">Score decay nel tempo (inattività)</div>
        <svg class="match-decay-svg" viewBox="0 0 400 160" aria-hidden="true">
          <defs>
            <linearGradient id="decayGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#FF3B30" stop-opacity="0.4"/>
              <stop offset="100%" stop-color="#FF3B30" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <!-- Area fill -->
          <path d="M 30 20 Q 120 25 180 70 Q 250 110 370 148 L 370 148 L 30 148 Z" fill="url(#decayGrad)"/>
          <!-- Curve line -->
          <path d="M 30 20 Q 120 25 180 70 Q 250 110 370 148" fill="none" stroke="#FF3B30" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Axes -->
          <line x1="30" y1="148" x2="380" y2="148" stroke="#333" stroke-width="1"/>
          <line x1="30" y1="10" x2="30" y2="148" stroke="#333" stroke-width="1"/>
          <!-- Labels -->
          <text x="30" y="10" fill="#666" font-size="11" text-anchor="middle">100%</text>
          <text x="200" y="165" fill="#666" font-size="11" text-anchor="middle">Giorni di inattività →</text>
          <text x="110" y="165" fill="#666" font-size="10" text-anchor="middle">30gg</text>
          <text x="200" y="165" fill="#666" font-size="10" text-anchor="middle">60gg</text>
          <text x="290" y="165" fill="#666" font-size="10" text-anchor="middle">90gg</text>
          <text x="380" y="100" fill="#FF3B30" font-size="11" text-anchor="end">≈0%</text>
          <!-- Dots -->
          <circle cx="30" cy="20" r="3" fill="#FF3B30"/>
          <circle cx="110" cy="55" r="3" fill="#FF3B30"/>
          <circle cx="200" cy="95" r="3" fill="#FF3B30"/>
          <circle cx="290" cy="128" r="3" fill="#FF3B30"/>
        </svg>
        <p style="text-align:center;font-size:13px;color:var(--text3);margin-top:8px">Dopo 90 giorni di inattività, il profilo non viene più proposto</p>
      </div>
      <div class="prose" style="max-width:100%">
        <h3>Come funziona il decay</h3>
        <p>Il punteggio finale di ogni candidato viene moltiplicato per un fattore di decay basato sull'inattività:</p>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:14px 18px;margin:12px 0;font-family:monospace;font-size:14px;color:var(--accent)">
          decay = e<sup>(-λ × giorni_inattivi)</sup>
        </div>
        <p>Il parametro λ è configurabile dall'admin. Il decay default porta a ~50% dopo 30 giorni, ~10% dopo 60, ~0% dopo 90.</p>
        <h3 style="margin-top:20px">Cosa conta come "attività"</h3>
        <ul>
          <li>Apertura dell'app</li>
          <li>Aggiornamento del profilo</li>
          <li>Tracking GPS di un giro</li>
          <li>Invio o ricezione di messaggi</li>
          <li>Partecipazione a un contest</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="ab-h2">
  <div class="section-inner">
    <span class="section-eyebrow">A/B testing</span>
    <h2 class="section-title" id="ab-h2">Sperimentiamo<br/><span class="accent">per migliorare.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:flex-start">
      <div class="prose" style="max-width:100%">
        <p>Il sistema di matching non è statico. Usiamo A/B testing continuo per migliorare gli algoritmi:</p>
        <ul>
          <li>Una parte degli utenti riceve l'algoritmo attuale (gruppo A)</li>
          <li>Un'altra parte riceve una variante sperimentale (gruppo B)</li>
          <li>Misuriamo le connessioni avviate, le chat attive, il tasso di risposta</li>
          <li>Se il gruppo B ottiene risultati migliori, la variante diventa il nuovo standard</li>
        </ul>
        <p style="margin-top:16px">In linguaggio semplice: <em>"a volte proviamo due algoritmi su gruppi diversi per vedere quale ti fa trovare compagni migliori. Non lo noti mai, ma i tuoi match migliorano costantemente."</em></p>
      </div>
      <div>
        <div class="match-arch">
          <div class="mermaid">
sequenceDiagram
  participant U as Utente
  participant R as Router A/B
  participant A as Algo Attuale
  participant B as Algo Variante
  participant M as Metriche
  U->>R: Richiesta match
  R->>A: 50% utenti
  R->>B: 50% utenti
  A->>U: Match lista A
  B->>U: Match lista B
  U->>M: Interazioni
  M->>R: Statistiche
  Note over M,R: Se B &gt; A → B diventa standard
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="neg-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Preferenze negative</span>
    <h2 class="section-title" id="neg-h2">Puoi<br/><span class="accent">escludere.</span></h2>
    <p class="section-lead">Non ti piacciono certi tipi di biker o di moto? Il sistema impara dai tuoi no — automaticamente o su tua richiesta esplicita.</p>
    <div class="grid grid-2" style="margin-top:32px;gap:32px">
      <div>
        <h3 style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">Apprendimento automatico</h3>
        <div class="match-privacy-list">
          <div class="match-privacy-item"><span class="pi-icon">🔄</span><div>Hai ignorato 5 scooter → il sistema abbassa automaticamente il peso "scooter" nel tuo profilo</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🔄</span><div>Hai bloccato 2 utenti dello stesso club → il club viene de-prioritizzato nei tuoi match</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🔄</span><div>Non hai mai avviato chat con utenti over 60 → la fascia viene progressivamente penalizzata</div></div>
        </div>
      </div>
      <div>
        <h3 style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px">Controllo esplicito</h3>
        <div class="match-privacy-list">
          <div class="match-privacy-item"><span class="pi-icon">⚙️</span><div><strong>Filtri profilo</strong> — Escludi tipo di moto, fascia d'età, sesso direttamente dalle preferenze</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🚫</span><div><strong>Block utente</strong> — Blocca un utente specifico; non lo vedrai mai più nei match</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🔕</span><div><strong>Silenzia tipo</strong> — "Non voglio più vedere biker con moto &lt;50cc" — salvato nelle preferenze</div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="digest-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Recap settimanale</span>
    <h2 class="section-title" id="digest-h2">Il digest<br/><span class="accent">del lunedì.</span></h2>
    <div class="prose" style="max-width:680px">
      <p>Ogni lunedì mattina, il sistema genera un digest personalizzato con i tuoi top match della settimana: i biker con cui hai più affinità che non hai ancora contattato, i nuovi iscritti nella tua zona, e le uscite in programma nei club vicini.</p>
      <p>Non è spam — è un riassunto intelligente che tiene vivo il matching anche quando non apri l'app tutti i giorni.</p>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2>Curioso di sapere <span style="color:var(--accent)">come funziona l'AI?</span></h2>
  <p>6 sistemi AI specializzati, 8 modelli in cascata, 4 provider con failover. La pagina più tecnica del manuale.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/matching/intelligenza-artificiale">Il cervello AI →</a>
    <a class="btn btn-outline" href="/matching/tipi-di-match">← I 17 tipi</a>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{primaryColor:'#1A1A1A',primaryTextColor:'#F0F0F0',primaryBorderColor:'#FF3B30',lineColor:'#666',background:'#0A0A0A'}});}});</script>
`;
  return { meta, body };
}

// ── PAGE 5: INTELLIGENZA ARTIFICIALE (/matching/intelligenza-artificiale) ─────
export function buildMatchingAI(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/intelligenza-artificiale",
    title: "Il Cervello AI di BikerLink — 6 AI specializzate, 8 modelli, 4 provider",
    description: "BikerLink non usa una sola AI: 6 sistemi specializzati, 8 modelli orchestrati in cascata (Anthropic, OpenAI, Google, self-hosted), failover automatico e 100% delle decisioni loggato e auditabile.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Intelligenza Artificiale", path: "/matching/intelligenza-artificiale" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Il Cervello AI di BikerLink",
        description: "6 AI specializzate, 8 modelli, 4 provider con failover automatico.",
        url: `${baseUrl}/matching/intelligenza-artificiale`,
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
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; Intelligenza Artificiale</div>
  <div class="match-hero-eyebrow">L'orchestra AI</div>
  <h1 id="ai-h1">IL CERVELLO<br/><span class="accent">AI</span> DI<br/>BIKERLINK</h1>
  <p class="lead">6 sistemi AI specializzati. 4 provider in fallback. 8 modelli orchestrati. Zero compromessi sulla precisione — e zero azioni autonome irreversibili.</p>
</section>

<div class="match-stats" role="region" aria-label="KPI AI">
  ${kpis.map(k => `<div class="match-stat"><div class="match-stat-val">${k.val}</div><div class="match-stat-lbl">${k.lbl}</div></div>`).join("")}
</div>

<section class="section" aria-labelledby="brains-h2">
  <div class="section-inner">
    <span class="section-eyebrow">I 6 cervelli</span>
    <h2 class="section-title" id="brains-h2">Non una AI.<br/><span class="accent">Un'orchestra.</span></h2>
    <p class="section-lead">Ogni AI è ottimizzata sul suo dominio specifico. Una sola AI generalista farebbe peggio su tutto — BikerLink usa specialisti.</p>

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
    <span class="section-eyebrow">Matching</span>
    <h2 class="section-title" id="matching-ai-h2">Il matching usa<br/><span class="accent">altre 2 AI.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:32px">
      <div class="match-ai-brain" style="border-color:rgba(255,59,48,.3)">
        <div class="match-ai-brain-icon">🎵</div>
        <div class="match-ai-brain-title">Embeddings semantici</div>
        <div class="match-ai-brain-desc">Per bio e gusti musicali. Usa OpenAI text-embedding-3-large (1536 dimensioni) con fallback su modello self-hosted multilingual-e5-small. Capisce affinità concettuali oltre le parole esatte — "amo i passi" e "appassionato di montagna" vengono letti come simili.</div>
      </div>
      <div class="match-ai-brain" style="border-color:rgba(255,59,48,.3)">
        <div class="match-ai-brain-icon">🗺️</div>
        <div class="match-ai-brain-title">AI di routing curvy</div>
        <div class="match-ai-brain-desc">Gemini 2.5 Pro genera waypoint intermedi per percorsi moto curvi su OSM + GraphHopper. Evita autostrade, cerca strade con più curve, ottimizza per il tipo di moto e stile di guida. Già in produzione.</div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="why-many-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Architettura</span>
    <h2 class="section-title" id="why-many-h2">Perché tante AI<br/><span class="accent">invece di una?</span></h2>
    <div class="grid grid-3" style="margin-top:32px">
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
        <h3>Specializzazione</h3>
        <p>Ogni AI è ottimizzata sul suo dominio (moderazione ≠ database integrity ≠ routing). Una sola AI generalista farebbe peggio su tutto.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
        <h3>Ridondanza in cascata</h3>
        <p>Ogni cervello principale ha 3 modelli in fallback (Anthropic → OpenAI → Google). Se un provider va giù, BikerLink continua a funzionare.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <h3>Costo controllato</h3>
        <p>Compiti semplici → modello da $0.10/M token. Compiti complessi → $3/M. Casi critici → $5/M. Risparmio stimato 60–80% vs "GPT per tutto".</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div>
        <h3>Trasparenza totale</h3>
        <p>Ogni decisione AI è loggata, spiegata in italiano, e revisionabile dall'admin. Mai azioni autonome irreversibili.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg></div>
        <h3>Human-in-the-loop</h3>
        <p>Le AI suggeriscono, l'admin approva. Nessuna azione distruttiva (ban, eliminazione dati, rollback) senza conferma umana.</p>
      </div>
      <div class="card">
        <div class="icon"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <h3>Monitoraggio 24/7</h3>
        <p>Il Watchdog AI monitora metriche, latenze e log in tempo reale. Problemi noti vengono risolti automaticamente — gli admin dormono.</p>
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="stack-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Stack AI</span>
    <h2 class="section-title" id="stack-h2">Lo stack AI<br/><span class="accent">in tabella.</span></h2>
    <div class="match-ai-table-wrap">
      <table class="match-ai-table" aria-label="Stack AI BikerLink">
        <thead>
          <tr>
            <th>Ruolo</th>
            <th>Modello</th>
            <th>Provider</th>
            <th>Quando lo usiamo</th>
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
    <span class="section-eyebrow">Resilienza</span>
    <h2 class="section-title" id="fallback-h2">La cascata<br/><span class="accent">di fallback.</span></h2>
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
      <p>Se Anthropic non risponde entro il timeout, la richiesta passa automaticamente a OpenAI. Se anche OpenAI fallisce, va a Google. Se tutti e tre sono offline contemporaneamente (probabilità &lt;0.05%), il sistema risponde con una modalità degradata — lenta ma funzionante. Zero downtime visibile all'utente.</p>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2>Vuoi vedere <span style="color:var(--accent)">la console AI in azione?</span></h2>
  <p>Contattaci per una demo riservata — mostriamo i log, le decisioni in tempo reale e l'architettura completa.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="mailto:invest@bikerlink.app">Richiedi una demo</a>
    <a class="btn btn-outline" href="/matching/per-investitori">Versione investitori →</a>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{primaryColor:'#1A1A1A',primaryTextColor:'#F0F0F0',primaryBorderColor:'#FF3B30',lineColor:'#666',background:'#0A0A0A'}});}});</script>
`;
  return { meta, body };
}

// ── PAGE 6: PRIVACY (/matching/privacy) ──────────────────────────────────────
export function buildMatchingPrivacy(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/privacy",
    title: "Privacy del matching BikerLink — Cosa raccogliamo e cosa non facciamo",
    description: "Privacy del sistema di matching BikerLink: dati raccolti, nessuna vendita a terzi, nessuna profilazione pubblicitaria, come disattivare ogni tipo di segnale. GDPR compliant.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Privacy", path: "/matching/privacy" },
      ]),
    ],
  };

  const body = `
${matchSubnav("/matching/privacy")}

<section class="match-hero" aria-labelledby="priv-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; Privacy</div>
  <div class="match-hero-eyebrow">Trasparenza</div>
  <h1 id="priv-h1">COSA SAPPIAMO<br/><span class="accent">DI TE</span><br/>E PERCHÉ</h1>
  <p class="lead">Nessuna sorpresa. Nessuna vendita. Ecco esattamente cosa raccogliamo per farti incontrare i biker giusti, cosa non facciamo mai, e come controllare tutto.</p>
</section>

<section class="section" aria-labelledby="collect-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Cosa raccogliamo</span>
    <h2 class="section-title" id="collect-h2">I dati che<br/><span class="accent">usiamo.</span></h2>
    <p class="section-lead">Raccogliamo solo ciò che serve per calcolare le affinità. Niente di più.</p>

    <ul class="match-privacy-list" aria-label="Dati raccolti">
      <li class="match-privacy-item"><span class="pi-icon">🏍️</span><div><strong>Moto e preferenze dichiarate</strong> — Brand, modello, stile di guida, tipo di uscite. Li fornisci tu esplicitamente nel profilo.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">📍</span><div><strong>GPS e percorsi</strong> — Solo se attivi il tracking. Registriamo le coordinate durante il giro e le usiamo per calcolare route affinity e zone di guida. Il GPS non è mai attivo in background senza consenso.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">📐</span><div><strong>Telemetria di guida</strong> — Lean angle e G-force dal giroscopio e accelerometro del telefono. Solo durante il tracking attivo.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">🎵</span><div><strong>Gusti musicali</strong> — Testo libero nel profilo. Usiamo AI per estrarne le affinità semantiche. Non colleghiamo il tuo Spotify o Last.fm senza consenso esplicito.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">👤</span><div><strong>Bio e interessi</strong> — Il testo libero che scrivi nel profilo. Viene elaborato con embeddings per trovare affinità concettuali.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">💬</span><div><strong>Segnali di feedback</strong> — Like, ignora, block. Non i contenuti delle conversazioni — solo le azioni di matching.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">⏰</span><div><strong>Fasce orarie</strong> — Estratte dai timestamp dei giri. Solo se tracking attivo.</div></li>
    </ul>
  </div>
</section>

<section class="section alt" aria-labelledby="noncollect-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Cosa NON facciamo</span>
    <h2 class="section-title" id="noncollect-h2">Le nostre<br/><span class="accent">linee rosse.</span></h2>

    <ul class="match-privacy-list" aria-label="Cosa non facciamo mai">
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No vendita dati a terzi</strong> — I tuoi dati non vengono mai venduti o ceduti a inserzionisti, assicurazioni, case produttrici o chiunque altro. Mai.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No profilazione pubblicitaria</strong> — Non usiamo i dati di matching per mostrarti pubblicità. Il matching è per il matching — punto.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No condivisione identità</strong> — La tua posizione reale non viene mai condivisa con altri utenti senza il tuo consenso esplicito. Ghost Mode è sempre disponibile.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No raccolta in background</strong> — Il GPS non si attiva mai senza che tu apra l'app e attivi esplicitamente il tracking. Nessun tracciamento silenzioso.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No AI autonoma su dati sensibili</strong> — Le decisioni che riguardano i tuoi dati personali vengono sempre supervisionate da operatori umani.</div></li>
    </ul>
  </div>
</section>

<section class="section" aria-labelledby="control-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Il tuo controllo</span>
    <h2 class="section-title" id="control-h2">Puoi disattivare<br/><span class="accent">tutto.</span></h2>
    <p class="section-lead">Ogni tipo di segnale ha un toggle. Puoi disattivarne uno, alcuni, o tutti — il sistema funziona comunque con i dati rimasti.</p>

    <div class="grid grid-2" style="margin-top:28px;gap:20px">
      ${[
        { icon: "📍", signal: "Tracking GPS", action: "Disattiva dalle impostazioni app — il GPS smette di raccogliere dati immediatamente" },
        { icon: "📐", signal: "Telemetria guida", action: "Toggle separato da GPS — puoi tracciare il percorso senza lean angle e G-force" },
        { icon: "🎵", signal: "Musica nel matching", action: "Rimuovi i gusti musicali dal profilo — il segnale musica viene ignorato" },
        { icon: "👤", signal: "Bio nel matching", action: "Cancella la bio o attiva il toggle \"escludi bio dal matching\" nelle impostazioni" },
        { icon: "👁️", signal: "Visibilità sulla mappa", action: "Ghost Mode — sei online ma invisibile agli altri. Puoi ancora vedere e fare matching" },
        { icon: "📊", signal: "Feedback loop", action: "Nelle impostazioni avanzate puoi resettare il tuo storico di feedback e ripartire da zero" },
      ].map(c => `
      <div class="match-privacy-item">
        <span class="pi-icon">${c.icon}</span>
        <div><strong>${c.signal}</strong><br/><span style="font-size:13px">${c.action}</span></div>
      </div>`).join("")}
    </div>

    <div style="margin-top:36px;padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:4px">
      <h3 style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">Eliminazione completa</h3>
      <p style="font-size:14px;color:var(--text2);line-height:1.7">Puoi eliminare il tuo account e tutti i dati associati in qualsiasi momento: dall'app vai su <strong>Profilo → Modifica → Elimina account</strong>. I dati vengono rimossi entro 30 giorni (esclusi i log obbligatori per legge). In alternativa, scrivi a <a href="mailto:bikerlinkapp@gmail.com">bikerlinkapp@gmail.com</a>.</p>
    </div>
  </div>
</section>

<section class="section alt" aria-label="Link Privacy Policy">
  <div class="section-inner" style="text-align:center">
    <span class="section-eyebrow">Documento completo</span>
    <h2 class="section-title">Privacy Policy<br/><span class="accent">completa.</span></h2>
    <p class="section-lead">Per tutti i dettagli legali, le basi giuridiche del trattamento (GDPR art. 6), i tempi di conservazione e i tuoi diritti come interessato.</p>
    <a class="btn btn-primary" href="/privacy">Leggi la Privacy Policy completa →</a>
  </div>
</section>

<div class="cta-block">
  <h2>Hai altre <span style="color:var(--accent)">domande sulla privacy?</span></h2>
  <p>Scrivici a bikerlinkapp@gmail.com — rispondiamo entro 48 ore.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="mailto:bikerlinkapp@gmail.com">Scrivici</a>
    <a class="btn btn-outline" href="/matching/come-impara">← Come impara</a>
    <a class="btn btn-outline" href="/matching/per-investitori">Versione tecnica →</a>
  </div>
</div>
`;
  return { meta, body };
}

// ── PAGE 7: PER INVESTITORI (/matching/per-investitori) ───────────────────────
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
