
// SVG icon helpers (Feather-style, inline)
export const icon = {
  map: `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
  users: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  message: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  gps: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  zap: `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  bike: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><polyline points="5.5 17.5 9 7 14 7 18.5 17.5"/><line x1="9" y1="7" x2="14" y2="7"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
};

export const HERO_STATS = `
<section class="section" aria-label="Statistiche piattaforma">
  <div class="section-inner">
    <div class="stats-row">
      <div class="stat"><div class="stat-value" id="stat-users">5.000+</div><div class="stat-label" data-i18n="comp.stats.label1">Biker registrati</div></div>
      <div class="stat"><div class="stat-value">100%</div><div class="stat-label" data-i18n="comp.stats.label2">Gratis, per sempre</div></div>
      <div class="stat"><div class="stat-value">24/7</div><div class="stat-label" data-i18n="comp.stats.label3">SOS attivo</div></div>
      <div class="stat"><div class="stat-value">0€</div><div class="stat-label" data-i18n="comp.stats.label4">Costi nascosti</div></div>
    </div>
  </div>
</section>`;

// ── SHARED: COMPETITOR COMPARISON SECTION ─────────────────────────────────────
export const COMP_SECTION = `
<!-- ── COMPETITOR TABLE ── -->
<section class="comp-section" aria-labelledby="comp-heading">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="comp.eyebrow">Confronto funzionalità</span>
    <h2 class="section-title" id="comp-heading" data-i18n-html="comp.unique.h2">Dove siamo <span class="accent">unici.</span></h2>
    <p class="section-lead" data-i18n="comp.lead">Tre funzionalità che nessun altro ha. Non aggiunte, non partial — solo BikerLink.</p>
    <div class="comp-highlights">
      <div class="comp-highlight">
        <div class="comp-highlight-icon">🤖</div>
        <div class="comp-highlight-title" data-i18n="comp.h1.title">AI linguaggio naturale</div>
        <div class="comp-highlight-desc" data-i18n="comp.h1.desc">Pianifica un percorso scrivendo "strade curve in Toscana, 3 ore, evita autostrade" — l'AI capisce e costruisce il giro.</div>
        <div class="comp-highlight-badge" data-i18n="comp.badge">Solo BikerLink</div>
      </div>
      <div class="comp-highlight">
        <div class="comp-highlight-icon">🏆</div>
        <div class="comp-highlight-title" data-i18n="comp.h2.title">BikerScore — Indice fun factor</div>
        <div class="comp-highlight-desc" data-i18n="comp.h2.desc">Ogni percorso ha un punteggio numerico basato su curvosità, dislivello, fondo e traffico. Scegli il giro più divertente, non solo il più veloce.</div>
        <div class="comp-highlight-badge" data-i18n="comp.badge">Solo BikerLink</div>
      </div>
      <div class="comp-highlight">
        <div class="comp-highlight-icon">🤝</div>
        <div class="comp-highlight-title" data-i18n="comp.h3.title">Matching engine biker</div>
        <div class="comp-highlight-desc" data-i18n="comp.h3.desc">Algoritmo di compatibilità che abbina moto, stile di guida e disponibilità. Trova il compagno di viaggio giusto, non solo il più vicino.</div>
        <div class="comp-highlight-badge" data-i18n="comp.badge">Solo BikerLink</div>
      </div>
    </div>
    <div class="comp-table-wrap" role="region" aria-label="Tabella comparativa funzionalità">
      <table class="comp-table">
        <thead>
          <tr>
            <th scope="col" data-i18n="comp.table.header">Funzionalità</th>
            <th scope="col">Kurviger</th>
            <th scope="col">Calimoto</th>
            <th scope="col">MotoPlanner</th>
            <th scope="col">Rever</th>
            <th scope="col">Scenic</th>
            <th scope="col" class="col-bl">BikerLink</th>
          </tr>
        </thead>
        <tbody>
          <tr><td data-i18n="comp.table.row1">Routing curvy</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-partial">⚠️</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-check">✅</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row2">AI linguaggio naturale</td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row3">Indice "fun factor"</td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row4">Round trip</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row5">Multi-day</td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row6">Meteo sul percorso</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row7">POI integrati</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-partial">⚠️</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row8">Matching biker</td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row9">Social community</td><td><span class="comp-cell-partial">⚠️</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row10">GPX import</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row11">Mappe offline</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-partial">⚠️</span></td><td><span class="comp-cell-check">✅</span></td><td class="col-bl"><span class="comp-cell-cross">❌</span></td></tr>
          <tr><td data-i18n="comp.table.row12">Navigazione voce</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-check">✅</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row13">Multilingual</td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-check">✅</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row14">CarPlay</td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-check">✅</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-cross">❌</span></td><td><span class="comp-cell-check">✅</span></td><td class="col-bl"><span class="comp-cell-cross">❌</span></td></tr>
          <tr><td data-i18n="comp.table.row15"></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row16"></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row17"></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row18"></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row19"></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
          <tr><td data-i18n="comp.table.row20"></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td><span class="comp-cell-partial" aria-label="Da verificare">—</span></td><td class="col-bl"><span class="comp-cell-check">✅</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>`;
