import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingOverview(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching",
    title: "Matching BikerLink — Come ti facciamo incontrare i biker giusti",
    description: "Il sistema di matching di BikerLink usa 17 segnali di affinità, embeddings semantici e telemetria reale per connetterti con i biker più compatibili. Scopri come funziona.",
    ogImage: `${baseUrl}/assets/images/playstore-feature-graphic.png`,
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
        inLanguage: "it-IT",
        datePublished: "2024-10-01",
        dateModified: "2025-05-15",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntityOfPage: `${baseUrl}/matching`,
      },
    ],
  };

  const body = `
${matchSubnav("/matching")}

<section class="match-hero" aria-labelledby="match-hero-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Matching</div>
  <div class="match-hero-eyebrow" data-i18n="match.overview.eyebrow">Sistema matching</div>
  <h1 id="match-hero-h1" data-i18n-html="match.ov.h1">COME TI FACCIAMO<br/><span class="accent">INCONTRARE</span><br/>I BIKER GIUSTI</h1>
  <p class="lead" data-i18n="match.overview.lead">Non un algoritmo generico. Un'orchestra di 17 segnali, intelligenza artificiale, dati reali dalla strada — per proporti solo chi è davvero compatibile con il tuo modo di guidare.</p>
  <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:8px">
    <a class="btn btn-primary" href="/matching/come-funziona" data-i18n="match.overview.btn1">Scopri come funziona →</a>
    <a class="btn btn-outline" href="/matching/per-investitori" data-i18n="match.overview.btn2">Versione tecnica</a>
  </div>
</section>

<div class="match-stats" role="region" aria-label="Statistiche matching">
  <div class="match-stat"><div class="match-stat-val">17</div><div class="match-stat-lbl" data-i18n="match.stats.signals">Segnali di affinità</div></div>
  <div class="match-stat"><div class="match-stat-val">&lt;200ms</div><div class="match-stat-lbl" data-i18n="match.stats.latency">Latenza engine</div></div>
  <div class="match-stat"><div class="match-stat-val">6</div><div class="match-stat-lbl" data-i18n="match.stats.ai">AI specializzate</div></div>
  <div class="match-stat"><div class="match-stat-val">0</div><div class="match-stat-lbl" data-i18n="match.stats.ads">Pubblicità nei match</div></div>
</div>

<section class="section" aria-labelledby="match-promises-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.promises.eyebrow">Le 3 promesse</span>
    <h2 class="section-title" id="match-promises-h2" data-i18n="match.ov.promises.title">Non a caso. Per davvero.</h2>
    <p class="section-lead" data-i18n="match.promises.lead">Il matching non è una lista di utenti vicini. È un sistema che impara da ogni tuo sì e ogni tuo no, e migliora ogni settimana.</p>

    <div class="match-promises">
      <div class="match-promise">
        <div class="match-promise-icon">🎯</div>
        <div class="match-promise-title" data-i18n="match.promises.p1.title">Match veri, non a caso</div>
        <p class="match-promise-desc" data-i18n="match.promises.p1.desc">Non ti mostriamo chi è vicino a te geograficamente e basta. Analizziamo moto, stile di guida, gusti musicali, orari, percorsi — 17 dimensioni di compatibilità reale.</p>
      </div>
      <div class="match-promise">
        <div class="match-promise-icon">🧠</div>
        <div class="match-promise-title" data-i18n="match.promises.p2.title">Impariamo dai tuoi sì e no</div>
        <p class="match-promise-desc" data-i18n="match.promises.p2.desc">Ogni swipe, ogni ignora, ogni connessione avviata alimenta il feedback loop. Il sistema aggiusta i pesi e ti propone match sempre più pertinenti col passare del tempo.</p>
      </div>
      <div class="match-promise">
        <div class="match-promise-icon">🏍️</div>
        <div class="match-promise-title" data-i18n="match.promises.p3.title">Geo + Tempo + Musica + Strade</div>
        <p class="match-promise-desc" data-i18n="match.promises.p3.desc">Distanza intelligente (geohash), fasce orarie di guida, affinità musicale da testi liberi, e percorsi reali con lean angle e G-force: nessun altro fa matching così.</p>
      </div>
    </div>

    <div style="margin-top:40px;text-align:center">
      <a class="btn btn-primary" href="/matching/come-funziona" data-i18n="match.overview.btn.flow">Dal profilo al match: il flow completo →</a>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="match-why-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.why.eyebrow">Perché esiste</span>
    <h2 class="section-title" id="match-why-h2" data-i18n="match.ov.why.title">Il problema che risolviamo.</h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:center">
      <div class="prose" style="max-width:100%">
        <p data-i18n="match.ov.why.p1">Trovare compagni di viaggio compatibili è difficile. Nei gruppi WhatsApp finisci nel caos. Sui social non sai chi guida davvero o chi fa solo foto. Alle uscite di club non sai se il ritmo sarà il tuo.</p>
        <p data-i18n="match.ov.why.p2">BikerLink risolve il problema alla radice: costruiamo un profilo multidimensionale da dati reali — la moto che hai, le strade che percorri, gli orari in cui esci, la musica che ascolti, lo stile con cui guidi — e li usiamo per proporti persone con cui condividere una giornata su due ruote ha senso.</p>
        <p data-i18n="match.ov.why.p3">Il risultato non è solo una lista di utenti. È un compagno di giro che probabilmente ha già percorso le tue stesse strade, ascolta la tua stessa musica, e guida allo stesso ritmo.</p>
      </div>
      <div>
        <div class="match-promises" style="grid-template-columns:1fr;gap:12px">
          <div class="match-promise" style="padding:18px 16px">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:20px">❌</span>
              <div>
                <div class="match-promise-title" style="font-size:15px;margin-bottom:3px" data-i18n="match.ov.without.title">Senza BikerLink</div>
                <p class="match-promise-desc" style="font-size:13px" data-i18n="match.ov.without.desc">Gruppi WhatsApp caotici, uscite incompatibili per ritmo, persone sconosciute con cui non hai nulla in comune.</p>
              </div>
            </div>
          </div>
          <div class="match-promise" style="padding:18px 16px;border-color:rgba(255,59,48,.3)">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:20px">✅</span>
              <div>
                <div class="match-promise-title" style="font-size:15px;margin-bottom:3px" data-i18n="match.ov.with.title">Con BikerLink</div>
                <p class="match-promise-desc" style="font-size:13px" data-i18n="match.ov.with.desc">Match basati su 17 segnali reali. Trovi chi guida al tuo ritmo, sulle tue strade, nei tuoi orari — senza cercare.</p>
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
    <span class="section-eyebrow" data-i18n="match.manual.eyebrow">Manuale completo</span>
    <h2 class="section-title" id="match-nav-h2" data-i18n="match.ov.nav.title">Esplora il sistema passo per passo.</h2>
    <div class="grid grid-3" style="margin-top:36px;text-align:left">
      <a href="/matching/come-funziona" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>
        <h3 data-i18n="match.manual.c1.title">Come funziona</h3>
        <p data-i18n="match.manual.c1.desc">Dal profilo al match in 5 step. Il flow completo con diagramma.</p>
        <div class="meta" data-i18n="match.manual.read">→ Leggi</div>
      </a>
      <a href="/matching/tipi-di-match" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <h3 data-i18n="match.manual.c2.title">I 17 tipi di match</h3>
        <p data-i18n="match.manual.c2.desc">Tutti i segnali spiegati in linguaggio semplice con icona e esempio.</p>
        <div class="meta" data-i18n="match.manual.explore">→ Esplora</div>
      </a>
      <a href="/matching/come-impara" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
        <h3 data-i18n="match.manual.c3.title">Come impara</h3>
        <p data-i18n="match.manual.c3.desc">Feedback loop, decay temporale, A/B testing e preferenze negative.</p>
        <div class="meta" data-i18n="match.manual.discover">→ Scopri</div>
      </a>
      <a href="/matching/intelligenza-artificiale" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
        <h3 data-i18n="match.manual.c4.title">Il cervello AI</h3>
        <p data-i18n="match.manual.c4.desc">6 AI specializzate, 8 modelli, 4 provider in fallback. Architettura completa.</p>
        <div class="meta" data-i18n="match.manual.read">→ Leggi</div>
      </a>
      <a href="/matching/privacy" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <h3 data-i18n="match.manual.c5.title">Privacy</h3>
        <p data-i18n="match.manual.c5.desc">Cosa raccogliamo, cosa non facciamo, come disattivare ogni tipo di match.</p>
        <div class="meta" data-i18n="match.manual.read">→ Leggi</div>
      </a>
      <a href="/matching/per-investitori" class="card" style="text-decoration:none">
        <div class="icon"><svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
        <h3 data-i18n="match.manual.c6.title">Per investitori</h3>
        <p data-i18n="match.manual.c6.desc">Architettura tecnica, KPI, stack completo e vantaggio competitivo.</p>
        <div class="meta" data-i18n="match.manual.read">→ Leggi</div>
      </a>
    </div>
  </div>
</section>

<section class="cta-block" aria-label="Download">
  <h2 data-i18n="match.ov.cta.title">Pronto a trovare il tuo compagno di giro?</h2>
  <p data-i18n="match.cta.desc">Scarica BikerLink, completa il profilo e lascia che il matching faccia il resto. Gratis, per sempre.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/download" data-i18n="match.cta.btn1">Scarica l'app</a>
    <a class="btn btn-outline" href="/matching/come-funziona" data-i18n="match.cta.btn2">Come funziona →</a>
  </div>
</section>
`;
  return { meta, body };
}

// ── PAGE 2: COME FUNZIONA (/matching/come-funziona) ───────────────────────────
