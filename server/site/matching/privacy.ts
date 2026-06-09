import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingPrivacy(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/privacy",
    title: "Privacy del matching BikerLink — Cosa raccogliamo e cosa non facciamo",
    description: "Privacy del sistema di matching BikerLink: dati raccolti, nessuna vendita a terzi, nessuna profilazione pubblicitaria, come disattivare ogni tipo di segnale. GDPR compliant.",
    ogImage: `${baseUrl}/assets/images/playstore-feature-graphic.png`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Privacy", path: "/matching/privacy" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Privacy del matching BikerLink",
        description: "Quali dati usa il matching di BikerLink, come vengono protetti e quali sono i tuoi diritti.",
        url: `${baseUrl}/matching/privacy`,
        inLanguage: "it-IT",
        datePublished: "2024-10-01",
        dateModified: "2025-05-15",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntityOfPage: `${baseUrl}/matching/privacy`,
        about: {
          "@type": "Thing",
          name: "Privacy e protezione dati nel sistema di matching BikerLink",
        },
      },
    ],
  };

  const body = `
${matchSubnav("/matching/privacy")}

<section class="match-hero" aria-labelledby="priv-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; <span data-i18n="match.priv.breadcrumb">Privacy</span></div>
  <div class="match-hero-eyebrow" data-i18n="match.priv.eyebrow">Trasparenza</div>
  <h1 id="priv-h1" data-i18n-html="match.priv.h1">COSA SAPPIAMO<br/><span class="accent">DI TE</span><br/>E PERCHÉ</h1>
  <p class="lead" data-i18n="match.priv.lead">Nessuna sorpresa. Nessuna vendita. Ecco esattamente cosa raccogliamo per farti incontrare i biker giusti, cosa non facciamo mai, e come controllare tutto.</p>

  <!-- SVG: Cosa raccogliamo vs Cosa NON facciamo -->
  <svg viewBox="0 0 720 240" role="img" aria-labelledby="priv-compare-title priv-compare-desc" style="width:100%;max-width:720px;height:auto;display:block;margin:32px auto 0" xmlns="http://www.w3.org/2000/svg">
    <title id="priv-compare-title">Confronto: cosa raccogliamo vs cosa non facciamo mai</title>
    <desc id="priv-compare-desc">Due colonne contrapposte: a sinistra in verde i dati che raccogliamo solo con consenso esplicito; a destra in rosso le pratiche che non facciamo mai.</desc>
    <rect x="20" y="20" width="320" height="200" fill="#0E1A12" stroke="#2EBD5D" stroke-width="1.5" rx="4"/>
    <text x="180" y="48" text-anchor="middle" fill="#2EBD5D" font-size="14" font-weight="700" letter-spacing="2" data-i18n="match.priv.svg.col1.title">COSA RACCOGLIAMO</text>
    <text x="180" y="64" text-anchor="middle" fill="#999" font-size="11" data-i18n="match.priv.svg.col1.sub">solo con consenso esplicito</text>
    ${[
      {k:"match.priv.svg.col1.li1",t:"Profilo dichiarato"},
      {k:"match.priv.svg.col1.li2",t:"GPS (se attivo)"},
      {k:"match.priv.svg.col1.li3",t:"Telemetria (se attiva)"},
      {k:"match.priv.svg.col1.li4",t:"Bio &amp; musica"},
      {k:"match.priv.svg.col1.li5",t:"Feedback like/skip"},
    ].map((item,i)=>`<text x="40" y="${95+i*22}" fill="#F0F0F0" font-size="13" data-i18n="${item.k}">✓ ${item.t}</text>`).join("")}
    <rect x="380" y="20" width="320" height="200" fill="#1A0E0D" stroke="#FF3B30" stroke-width="1.5" rx="4"/>
    <text x="540" y="48" text-anchor="middle" fill="#FF3B30" font-size="14" font-weight="700" letter-spacing="2" data-i18n="match.priv.svg.col2.title">COSA NON FACCIAMO</text>
    <text x="540" y="64" text-anchor="middle" fill="#999" font-size="11" data-i18n="match.priv.svg.col2.sub">linee rosse, mai negoziabili</text>
    ${[
      {k:"match.priv.svg.col2.li1",t:"Vendere dati a terzi"},
      {k:"match.priv.svg.col2.li2",t:"Profilare per pubblicità"},
      {k:"match.priv.svg.col2.li3",t:"Tracking in background"},
      {k:"match.priv.svg.col2.li4",t:"Condividere identità"},
      {k:"match.priv.svg.col2.li5",t:"AI autonoma su dati sensibili"},
    ].map((item,i)=>`<text x="400" y="${95+i*22}" fill="#F0F0F0" font-size="13" data-i18n="${item.k}">✗ ${item.t}</text>`).join("")}
  </svg>
</section>

<section class="section" aria-labelledby="collect-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.priv.collect.eyebrow">Cosa raccogliamo</span>
    <h2 class="section-title" id="collect-h2" data-i18n="match.priv.collect.title">I dati che usiamo.</h2>
    <p class="section-lead" data-i18n="match.priv.collect.lead">Raccogliamo solo ciò che serve per calcolare le affinità. Niente di più.</p>

    <ul class="match-privacy-list" aria-label="Dati raccolti">
      <li class="match-privacy-item"><span class="pi-icon">🏍️</span><div data-i18n-html="match.priv.collect.li1"><strong>Moto e preferenze dichiarate</strong> — Brand, modello, stile di guida, tipo di uscite. Li fornisci tu esplicitamente nel profilo.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">📍</span><div data-i18n-html="match.priv.collect.li2"><strong>GPS e percorsi</strong> — Solo se attivi il tracking. Registriamo le coordinate durante il giro e le usiamo per calcolare route affinity e zone di guida. Il GPS non è mai attivo in background senza consenso.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">📐</span><div data-i18n-html="match.priv.collect.li3"><strong>Telemetria di guida</strong> — Lean angle e G-force dal giroscopio e accelerometro del telefono. Solo durante il tracking attivo.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">🎵</span><div data-i18n-html="match.priv.collect.li4"><strong>Gusti musicali</strong> — Testo libero nel profilo. Usiamo AI per estrarne le affinità semantiche. Non colleghiamo il tuo Spotify o Last.fm senza consenso esplicito.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">👤</span><div data-i18n-html="match.priv.collect.li5"><strong>Bio e interessi</strong> — Il testo libero che scrivi nel profilo. Viene elaborato con embeddings per trovare affinità concettuali.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">💬</span><div data-i18n-html="match.priv.collect.li6"><strong>Segnali di feedback</strong> — Like, ignora, block. Non i contenuti delle conversazioni — solo le azioni di matching.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">⏰</span><div data-i18n-html="match.priv.collect.li7"><strong>Fasce orarie</strong> — Estratte dai timestamp dei giri. Solo se tracking attivo.</div></li>
    </ul>
  </div>
</section>

<section class="section alt" aria-labelledby="noncollect-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.priv.not.eyebrow">Cosa NON facciamo</span>
    <h2 class="section-title" id="noncollect-h2" data-i18n="match.priv.not.title">Le nostre linee rosse.</h2>

    <ul class="match-privacy-list" aria-label="Cosa non facciamo mai">
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div data-i18n-html="match.priv.not.li1"><strong>No vendita dati a terzi</strong> — I tuoi dati non vengono mai venduti o ceduti a inserzionisti, assicurazioni, case produttrici o chiunque altro. Mai.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div data-i18n-html="match.priv.not.li2"><strong>No profilazione pubblicitaria</strong> — Non usiamo i dati di matching per mostrarti pubblicità. Il matching è per il matching — punto.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div data-i18n-html="match.priv.not.li3"><strong>No condivisione identità</strong> — La tua posizione reale non viene mai condivisa con altri utenti senza il tuo consenso esplicito. Ghost Mode è sempre disponibile.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div data-i18n-html="match.priv.not.li4"><strong>No raccolta in background</strong> — Il GPS non si attiva mai senza che tu apra l'app e attivi esplicitamente il tracking. Nessun tracciamento silenzioso.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div data-i18n-html="match.priv.not.li5"><strong>No AI autonoma su dati sensibili</strong> — Le decisioni che riguardano i tuoi dati personali vengono sempre supervisionate da operatori umani.</div></li>
    </ul>
  </div>
</section>

<section class="section" aria-labelledby="control-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.priv.ctrl.eyebrow">Il tuo controllo</span>
    <h2 class="section-title" id="control-h2" data-i18n="match.priv.ctrl.title">Puoi disattivare tutto.</h2>
    <p class="section-lead" data-i18n="match.priv.ctrl.lead">Ogni tipo di segnale ha un toggle. Puoi disattivarne uno, alcuni, o tutti — il sistema funziona comunque con i dati rimasti.</p>

    <div class="grid grid-2" style="margin-top:28px;gap:20px">
      ${[
        { icon: "📍", sk: "match.priv.ctrl.c1.sig", signal: "Tracking GPS", ak: "match.priv.ctrl.c1.act", action: "Disattiva dalle impostazioni app — il GPS smette di raccogliere dati immediatamente" },
        { icon: "📐", sk: "match.priv.ctrl.c2.sig", signal: "Telemetria guida", ak: "match.priv.ctrl.c2.act", action: "Toggle separato da GPS — puoi tracciare il percorso senza lean angle e G-force" },
        { icon: "🎵", sk: "match.priv.ctrl.c3.sig", signal: "Musica nel matching", ak: "match.priv.ctrl.c3.act", action: "Rimuovi i gusti musicali dal profilo — il segnale musica viene ignorato" },
        { icon: "👤", sk: "match.priv.ctrl.c4.sig", signal: "Bio nel matching", ak: "match.priv.ctrl.c4.act", action: "Cancella la bio o attiva il toggle \"escludi bio dal matching\" nelle impostazioni" },
        { icon: "👁️", sk: "match.priv.ctrl.c5.sig", signal: "Visibilità sulla mappa", ak: "match.priv.ctrl.c5.act", action: "Ghost Mode — sei online ma invisibile agli altri. Puoi ancora vedere e fare matching" },
        { icon: "📊", sk: "match.priv.ctrl.c6.sig", signal: "Feedback loop", ak: "match.priv.ctrl.c6.act", action: "Nelle impostazioni avanzate puoi resettare il tuo storico di feedback e ripartire da zero" },
      ].map(c => `
      <div class="match-privacy-item">
        <span class="pi-icon">${c.icon}</span>
        <div><strong data-i18n="${c.sk}">${c.signal}</strong><br/><span style="font-size:13px" data-i18n="${c.ak}">${c.action}</span></div>
      </div>`).join("")}
    </div>

    <div style="margin-top:36px;padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:4px">
      <h3 style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px" data-i18n="match.priv.ctrl.del.h3">Eliminazione completa</h3>
      <p style="font-size:14px;color:var(--text2);line-height:1.7" data-i18n-html="match.priv.ctrl.del.p">Puoi eliminare il tuo account e tutti i dati associati in qualsiasi momento: dall'app vai su <strong>Profilo → Modifica → Elimina account</strong>. I dati vengono rimossi entro 30 giorni (esclusi i log obbligatori per legge). In alternativa, scrivi a <a href="mailto:bikerlinkapp@gmail.com">bikerlinkapp@gmail.com</a>.</p>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="anon-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.priv.anon.eyebrow">Anonimizzazione</span>
    <h2 class="section-title" id="anon-h2" data-i18n="match.priv.anon.title">Dai dati grezzi all'aggregato.</h2>
    <p class="section-lead" data-i18n="match.priv.anon.lead">I tuoi dati di matching non vengono mai esposti in chiaro a terzi o usati per analitiche pubbliche senza prima passare attraverso un processo di anonimizzazione e aggregazione.</p>

    <svg viewBox="0 0 760 200" role="img" aria-labelledby="anon-svg-title anon-svg-desc" style="width:100%;max-width:760px;height:auto;display:block;margin:24px auto" xmlns="http://www.w3.org/2000/svg">
      <title id="anon-svg-title">Pipeline di anonimizzazione e aggregazione dei dati</title>
      <desc id="anon-svg-desc">Quattro step: dati grezzi personali → rimozione identificatori → aggregazione per coorte → statistiche pubblicabili. Solo l'ultima fase può essere condivisa o usata per analytics.</desc>
      <defs>
        <marker id="anon-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#FF3B30"/>
        </marker>
      </defs>
      ${[
        {l:"DATI GREZZI", lk:"match.priv.anon.s1.l", s:"con identità", sk:"match.priv.anon.s1.s", c:"#FF3B30", icon:"🔒"},
        {l:"PSEUDONIMI", lk:"match.priv.anon.s2.l", s:"hash + salt", sk:"match.priv.anon.s2.s", c:"#FF8A7A", icon:"🎭"},
        {l:"AGGREGATI", lk:"match.priv.anon.s3.l", s:"coorti ≥ 50 utenti", sk:"match.priv.anon.s3.s", c:"#888", icon:"📊"},
        {l:"PUBBLICABILI", lk:"match.priv.anon.s4.l", s:"solo statistiche", sk:"match.priv.anon.s4.s", c:"#2EBD5D", icon:"🌍"},
      ].map((b,i)=>{
        const x = 20 + i*185;
        return `<g><rect x="${x}" y="50" width="160" height="100" rx="4" fill="#1A1A1A" stroke="${b.c}" stroke-width="1.5"/><text x="${x+80}" y="80" text-anchor="middle" font-size="24">${b.icon}</text><text x="${x+80}" y="108" text-anchor="middle" fill="${b.c}" font-size="13" font-weight="700" letter-spacing="1" data-i18n="${b.lk}">${b.l}</text><text x="${x+80}" y="128" text-anchor="middle" fill="#999" font-size="11" data-i18n="${b.sk}">${b.s}</text><text x="${x+80}" y="40" text-anchor="middle" fill="#666" font-size="11" font-weight="700">${i+1}</text></g>${i<3?`<line x1="${x+160}" y1="100" x2="${x+185}" y2="100" stroke="#FF3B30" stroke-width="2" marker-end="url(#anon-arrow)"/>`:''}`;
      }).join("")}
      <text x="380" y="185" text-anchor="middle" fill="#666" font-size="11" data-i18n="match.priv.anon.note">Nessun dato personale lascia mai gli step 1–2 senza autenticazione interna</text>
    </svg>
  </div>
</section>

<section class="section alt" aria-label="Link Privacy Policy">
  <div class="section-inner" style="text-align:center">
    <span class="section-eyebrow" data-i18n="match.priv.full.eyebrow">Documento completo</span>
    <h2 class="section-title" data-i18n="match.priv.full.title">Privacy Policy completa.</h2>
    <p class="section-lead" data-i18n="match.priv.full.lead">Per tutti i dettagli legali, le basi giuridiche del trattamento (GDPR art. 6), i tempi di conservazione e i tuoi diritti come interessato.</p>
    <a class="btn btn-primary" href="/privacy" data-i18n="match.priv.full.btn">Leggi la Privacy Policy completa →</a>
  </div>
</section>

<div class="cta-block">
  <h2 data-i18n="match.priv.cta.title">Hai altre <span style="color:var(--accent)">domande sulla privacy?</span></h2>
  <p data-i18n="match.priv.cta.desc">Scrivici a bikerlinkapp@gmail.com — rispondiamo entro 48 ore.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="mailto:bikerlinkapp@gmail.com" data-i18n="match.priv.cta.btn1">Scrivici</a>
    <a class="btn btn-outline" href="/matching/come-impara" data-i18n="match.priv.cta.btn2">← Come impara</a>
    <a class="btn btn-outline" href="/matching/per-investitori" data-i18n="match.priv.cta.btn3">Versione tecnica →</a>
  </div>
</div>
`;
  return { meta, body };
}

// ── PAGE 7: PER INVESTITORI (/matching/per-investitori) ───────────────────────
