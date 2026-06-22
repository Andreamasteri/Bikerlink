import {
  type PageMeta,
  organizationJsonLd,
} from "./render";
import { COMP_SECTION } from "./pages-shared";
import HOME_CSS from "./pages-home-css";

// ── HOME ──────────────────────────────────────────────────────────────────────
export interface LandingImages {
  hero_main_url?: string;
  hero_main_sm_url?: string;
  hero_community_url?: string;
  hero_community_sm_url?: string;
}

const DEFAULT_LANDING_IMAGES: Required<LandingImages> = {
  hero_main_url: "/assets/images/hero-forest.webp",
  hero_main_sm_url: "/assets/images/hero-forest-sm.webp",
  hero_community_url: "/assets/images/hero-community.webp",
  hero_community_sm_url: "/assets/images/hero-community-sm.webp",
};

export function buildHome(baseUrl: string, images?: LandingImages): { meta: PageMeta; body: string } {
  const img = { ...DEFAULT_LANDING_IMAGES, ...images };
  const meta: PageMeta = {
    path: "/",
    title: "BikerLink — App per motociclisti: GPS, Community, SOS",
    description:
      "App verticale per motociclisti: mappa biker live, MotoClub, SOS emergenza, contest foto. Gratis, italiana, in continua evoluzione.",
    ogImage: `${baseUrl}${img.hero_main_url}`,
    headExtras: HOME_CSS,
    jsonld: [
      organizationJsonLd(baseUrl),
      {
        "@context": "https://schema.org",
        "@type": "MobileApplication",
        name: "BikerLink",
        operatingSystem: "Android, iOS",
        applicationCategory: "SocialNetworkingApplication",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        description:
          "App social verticale per motociclisti: community, GPS live, MotoClub, SOS biker.",
        url: baseUrl,
        image: `${baseUrl}${img.hero_main_url}`,
      },
    ],
  };

  const heartSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

  const body = `
<!-- ── HERO ── -->
<section class="home-hero" aria-label="Hero BikerLink">
  <img class="home-hero-bg" src="${img.hero_main_url}" srcset="${img.hero_main_sm_url} 800w, ${img.hero_main_url} 1600w" sizes="100vw" alt="Motociclista su strada forestale — luce filtrata tra gli alberi" width="1600" height="900" fetchpriority="high" />
  <div class="home-hero-overlay" aria-hidden="true"></div>
  <div class="home-hero-inner">
    <div class="home-hero-eyebrow" data-i18n="home.hero.eyebrow">La community mondiale dei biker</div>
    <h1 class="home-hero-title">BIKER<span class="dot">·</span>LINK<span style="display:block;font-size:0.27em;letter-spacing:5px;font-weight:700;color:rgba(255,255,255,0.5);margin-top:14px" data-i18n="home.hero.subtitle">APP PER MOTOCICLISTI</span></h1>
    <p class="home-hero-sub" data-i18n="home.hero.sub">U'll Never Ride Alone</p>
    <p class="home-hero-desc" data-i18n="home.hero.desc">La prima piattaforma verticale per motociclisti. Mappa live, MotoClub, SOS d'emergenza e contest fotografici — tutto gratis, per sempre.</p>
    <div class="home-hero-btns">
      <a class="btn btn-primary" href="/download">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span data-i18n="home.hero.btn.download">Scarica l'app</span>
      </a>
      <a class="btn-ghost" href="/features" data-i18n="home.hero.btn.features">Scopri le funzionalità</a>
      <a class="btn-ghost" href="${process.env.EXPO_WEB_URL || '/accedi'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        <span data-i18n="home.hero.btn.webapp">Apri Web App</span>
      </a>
    </div>
  </div>
  <div class="home-hero-scroll" aria-hidden="true">
    <span></span>
    scroll
  </div>
</section>

<!-- ── STATS BAR ── -->
<div class="home-stats" role="region" aria-label="Statistiche piattaforma">
  <div class="home-stats-inner">
    <div class="home-stat"><div class="home-stat-val" id="stat-users">…</div><div class="home-stat-lbl" data-i18n="home.stats.users">Biker registrati</div></div>
    <div class="home-stat"><div class="home-stat-val">100%</div><div class="home-stat-lbl" data-i18n="home.stats.free">Gratis, per sempre</div></div>
    <div class="home-stat"><div class="home-stat-val">24/7</div><div class="home-stat-lbl" data-i18n="home.stats.sos">SOS attivo</div></div>
    <div class="home-stat"><div class="home-stat-val">0€</div><div class="home-stat-lbl" data-i18n="home.stats.hidden">Costi nascosti</div></div>
  </div>
</div>
<script>
(function(){
  fetch('/api/community/stats').then(function(r){return r.json();}).then(function(d){
    var el=document.getElementById('stat-users');
    if(!el)return;
    var n=d&&d.total?Number(d.total):0;
    el.textContent=n>0?n.toLocaleString('it-IT'):'—';
  }).catch(function(){
    var el=document.getElementById('stat-users');
    if(el)el.textContent='—';
  });
})();
</script>

<!-- ── SECOND SCENE: CONNETTI LA TUA PASSIONE ── -->
<section class="home-split" id="community" aria-label="Community BikerLink">
  <div class="home-split-content">
    <div class="home-split-eyebrow" data-i18n="home.split.eyebrow">La community</div>
    <h2 class="home-split-title" data-i18n="home.split.title">CONNETTI<br/>LA TUA<br/><span class="accent">PASSIONE.</span></h2>
    <p class="home-split-body" data-i18n="home.split.body">Ogni strada nasconde una storia. BikerLink ti mette in contatto con migliaia di biker reali: trova il tuo riding partner, crea il tuo club e vivi ogni giro come un'avventura condivisa.</p>
    <div class="home-split-btns">
      <a class="btn btn-primary" href="https://play.google.com/store/apps/details?id=com.bikerlink.app" target="_blank" rel="noopener" aria-label="Scarica su Google Play">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.18 23.76c.24.13.52.2.8.2.39 0 .76-.12 1.07-.34L16.72 17l-3.23-3.23-10.31 9.99zM1.1 1.24C1.04 1.46 1 1.7 1 1.94v20.12c0 .24.04.48.1.7l.1.09L12.47 12V11.88L1.2 1.15l-.1.09zM20.92 10.19l-2.87-1.65-3.28 3.28 3.28 3.28 2.89-1.66c.82-.47.82-1.78-.02-2.25zM4.05.58L16.72 7l-3.25 3.25L4.05.58z"/></svg>
        Google Play
      </a>
      <a class="btn-ghost" href="https://apps.apple.com/it/app/bikerlink/id6746682447" target="_blank" rel="noopener" aria-label="Scarica su App Store">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
        App Store
      </a>
    </div>
  </div>
  <div class="home-split-photo">
    <img src="${img.hero_community_url}" srcset="${img.hero_community_sm_url} 800w, ${img.hero_community_url} 1600w" sizes="(max-width: 860px) 100vw, 50vw" alt="Moto parcheggiate in un bosco — raduno biker" width="1600" height="900" loading="lazy" />
  </div>
</section>

<!-- ── FEATURES GRID ── -->
<section class="section alt" aria-labelledby="features-heading">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="home.features.eyebrow">Cosa puoi fare</span>
    <h2 class="section-title" id="features-heading" data-i18n="home.features.title">Tutto ciò che <span class="accent">un biker</span> vuole.</h2>
    <p class="section-lead" data-i18n="home.features.lead">Sei funzioni che lavorano insieme: dalla mappa live agli SOS, dai MotoClub ai contest. Niente fronzoli, niente abbonamenti.</p>
    <div class="grid grid-3">
      <article class="card"><div class="card-img"><img src="/assets/images/bike-road-1.webp" srcset="/assets/images/bike-road-1-sm.webp 600w, /assets/images/bike-road-1.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Moto su strada — mappa biker live" width="1200" height="1800" loading="lazy" /></div><h3 data-i18n="home.features.card1.title">Mappa biker live</h3><p data-i18n="home.features.card1.desc">Vedi chi è online vicino a te in tempo reale. Filtra per moto, brand, disponibilità a un giro.</p></article>
      <article class="card"><div class="card-img"><img src="/assets/images/motoclub-ride.webp" srcset="/assets/images/motoclub-ride-sm.webp 600w, /assets/images/motoclub-ride.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Gruppo di motociclisti — MotoClub" width="1200" height="785" loading="lazy" /></div><h3 data-i18n="home.features.card2.title">MotoClub</h3><p data-i18n="home.features.card2.desc">Crea o entra in un club. Admin, codici invito, chat di gruppo dedicata.</p></article>
      <article class="card"><div class="card-img"><img src="/assets/images/bike-road-2.webp" srcset="/assets/images/bike-road-2-sm.webp 600w, /assets/images/bike-road-2.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Moto sulla strada — SOS Biker emergenza" width="1200" height="1800" loading="lazy" /></div><h3 data-i18n="home.features.card3.title">SOS Biker</h3><p data-i18n="home.features.card3.desc">Un tasto. La community vicina riceve la notifica con la tua posizione precisa.</p></article>
      <article class="card"><div class="card-img"><img src="/assets/images/contest-1.webp" srcset="/assets/images/contest-1-sm.webp 600w, /assets/images/contest-1.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Foto contest moto — PicContest BikerLink" width="1200" height="800" loading="lazy" /></div><h3 data-i18n="home.features.card4.title">Contest foto</h3><p data-i18n="home.features.card4.desc">Concorsi fotografici settimanali. Mostra la tua moto, il tuo giro, vinci visibilità.</p></article>
      <article class="card"><div class="card-img"><img src="/assets/images/telemetry-dash.webp" srcset="/assets/images/telemetry-dash-sm.webp 512w, /assets/images/telemetry-dash.webp 1024w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Dashboard telemetria — tracking GPS percorsi" width="1024" height="1024" loading="lazy" /></div><h3 data-i18n="home.features.card5.title">Tracking percorsi</h3><p data-i18n="home.features.card5.desc">Registra i tuoi giri con velocità, km, G-force. Storico privato e statistiche.</p></article>
      <article class="card"><div class="card-img"><img src="/assets/images/card-biker.webp" srcset="/assets/images/card-biker-sm.webp 400w, /assets/images/card-biker.webp 800w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Biker solitario — matching compagni di viaggio" width="800" height="1200" loading="lazy" /></div><h3 data-i18n="home.features.card6.title">Matching biker</h3><p data-i18n="home.features.card6.desc">Trova compagni di viaggio compatibili per moto, stile di guida e gusti musicali.</p></article>
    </div>
    <div style="margin-top:32px"><a class="btn btn-outline" href="/features" data-i18n="home.features.btn">Tutte le funzionalità →</a></div>
  </div>
</section>

<!-- ── USERTYPE PHOTO CARDS ── -->
<section class="home-who" aria-labelledby="who-heading">
  <div class="home-who-inner">
    <span class="section-eyebrow" data-i18n="home.who.eyebrow">Per chi è</span>
    <h2 class="section-title" id="who-heading" data-i18n="home.who.title">Una sola app.<br/><span class="accent">Tre tipi di biker.</span></h2>
    <p class="section-lead" data-i18n="home.who.lead">Che tu vada da solo, in coppia o con il tuo equipaggio — BikerLink è costruita per te.</p>
    <div class="home-who-grid" role="list">
      <article class="home-who-card" role="listitem">
        <img src="/assets/images/card-biker.webp" srcset="/assets/images/card-biker-sm.webp 400w, /assets/images/card-biker.webp 800w" sizes="(max-width: 768px) 100vw, 33vw" alt="Biker solitario su moto sportiva" width="800" height="1200" loading="lazy" />
        <div class="home-who-overlay" aria-hidden="true"></div>
        <div class="home-who-num" aria-hidden="true">/01</div>
        <div class="home-who-body">
          <div class="home-who-label" data-i18n="home.who.card1.label">Solo rider</div>
          <h3 class="home-who-name" data-i18n="home.who.card1.name">IL BIKER</h3>
          <p class="home-who-desc" data-i18n="home.who.card1.desc">Guidi da solo ma vuoi avere qualcuno vicino. Mappa live, SOS d'emergenza e matching per trovare compagni di viaggio compatibili.</p>
        </div>
      </article>
      <article class="home-who-card" role="listitem">
        <img src="/assets/images/card-zavorrine.webp" srcset="/assets/images/card-zavorrine-sm.webp 400w, /assets/images/card-zavorrine.webp 800w" sizes="(max-width: 768px) 100vw, 33vw" alt="Passeggero in moto — le zavorrine" width="800" height="1200" loading="lazy" />
        <div class="home-who-overlay" aria-hidden="true"></div>
        <div class="home-who-num" aria-hidden="true">/02</div>
        <div class="home-who-body">
          <div class="home-who-label" data-i18n="home.who.card2.label">Passeggeri</div>
          <h3 class="home-who-name" data-i18n="home.who.card2.name">LE ZAVORRINE</h3>
          <p class="home-who-desc" data-i18n="home.who.card2.desc">Vivi la moto da passeggero con lo stesso entusiasmo. Trova il tuo pilota ideale, connettiti con la community, partecipa ai contest.</p>
        </div>
      </article>
      <article class="home-who-card" role="listitem">
        <img src="/assets/images/card-coppie.webp" srcset="/assets/images/card-coppie-sm.webp 512w, /assets/images/card-coppie.webp 1024w" sizes="(max-width: 768px) 100vw, 33vw" alt="Coppia in moto" width="1024" height="1024" loading="lazy" />
        <div class="home-who-overlay" aria-hidden="true"></div>
        <div class="home-who-num" aria-hidden="true">/03</div>
        <div class="home-who-body">
          <div class="home-who-label" data-i18n="home.who.card3.label">In due</div>
          <h3 class="home-who-name" data-i18n="home.who.card3.name">LE COPPIE</h3>
          <p class="home-who-desc" data-i18n="home.who.card3.desc">La moto è il vostro modo di stare insieme. Condividete i percorsi, i ricordi fotografici e la rete di biker fidati con cui viaggiare.</p>
        </div>
      </article>
    </div>
  </div>
</section>

<!-- ── TELEMETRY / RACE MODE ── -->
<section class="home-tele" aria-label="Race Mode e telemetria">
  <div class="home-tele-inner">
    <div class="home-tele-content">
      <span class="section-eyebrow" data-i18n="home.tele.eyebrow">Race Mode</span>
      <h2 class="section-title" data-i18n="home.tele.title">Ogni dato.<br/><span class="accent">Ogni curva.</span></h2>
      <p class="section-lead" data-i18n="home.tele.lead">Velocità, G-force longitudinale, accelerazione laterale, distanza. Il tracker GPS di BikerLink registra ogni giro con precisione da pista.</p>
      <div class="home-tele-metrics" role="list" aria-label="Metriche in tempo reale">
        <div class="home-tele-metric" role="listitem">
          <div class="home-tele-metric-val">287</div>
          <div class="home-tele-metric-unit">km/h</div>
          <div class="home-tele-metric-lbl" data-i18n="home.tele.metric1">Velocità max</div>
        </div>
        <div class="home-tele-metric" role="listitem">
          <div class="home-tele-metric-val">3.4</div>
          <div class="home-tele-metric-unit">sec</div>
          <div class="home-tele-metric-lbl" data-i18n="home.tele.metric2">0–100</div>
        </div>
        <div class="home-tele-metric" role="listitem">
          <div class="home-tele-metric-val">52°</div>
          <div class="home-tele-metric-unit"></div>
          <div class="home-tele-metric-lbl" data-i18n="home.tele.metric3">Piega max</div>
        </div>
        <div class="home-tele-metric" role="listitem">
          <div class="home-tele-metric-val">428</div>
          <div class="home-tele-metric-unit">km</div>
          <div class="home-tele-metric-lbl" data-i18n="home.tele.metric4">Distanza giro</div>
        </div>
      </div>
      <div style="margin-top:28px">
        <a class="btn btn-primary" href="/features" data-i18n="home.tele.btn">Scopri il tracking →</a>
      </div>
    </div>
    <div class="home-tele-photo">
      <img src="/assets/images/telemetry-dash.webp" srcset="/assets/images/telemetry-dash-sm.webp 512w, /assets/images/telemetry-dash.webp 1024w" sizes="(max-width: 860px) 100vw, 50vw" alt="Dashboard telemetria BikerLink — velocità e G-force" width="1024" height="1024" loading="lazy" />
    </div>
  </div>
</section>

<!-- ── MATCHING SECTION ── -->
<section class="home-matching" aria-labelledby="matching-home-heading">
  <div class="home-matching-inner">
    <div>
      <span class="section-eyebrow" data-i18n="home.matching.eyebrow">Matching intelligente</span>
      <h2 class="section-title" id="matching-home-heading" data-i18n="home.matching.title">Non a caso.<br/><span class="accent">Per davvero.</span></h2>
      <p class="section-lead" style="margin-top:16px" data-i18n="home.matching.lead">17 segnali di affinità — moto, musica, percorsi, stile di guida, orari — per proporti solo i biker davvero compatibili con te.</p>
      <div class="home-matching-signals" role="list" aria-label="Segnali di matching">
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">🏍️</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.moto">Brand moto</span></div>
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">🎵</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.music">Musica</span></div>
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">📐</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.lean">Lean angle</span></div>
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">🗺️</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.routes">Percorsi</span></div>
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">⏰</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.hours">Orari guida</span></div>
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">💨</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.gforce">G-force</span></div>
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">📍</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.zone">Zona</span></div>
        <div class="home-matching-signal" role="listitem"><span class="home-matching-signal-icon" aria-hidden="true">🏛️</span><span class="home-matching-signal-name" data-i18n="home.matching.sig.club">Club</span></div>
      </div>
      <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap">
        <a class="btn btn-primary" href="/matching" data-i18n="home.matching.btn1">Scopri come funziona →</a>
        <a class="btn btn-outline" href="/matching/tipi-di-match" data-i18n="home.matching.btn2">I 17 segnali</a>
      </div>
    </div>
    <div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--text3);margin-bottom:20px" data-i18n="home.matching.demo.header">Match con @marco_v4</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${[
            { key: "home.matching.demo.bar1", label: "Stessa moto (Ducati Streetfighter V4)", pct: 100 },
            { key: "home.matching.demo.bar2", label: "Musica simile (Rock / Metal)", pct: 88 },
            { key: "home.matching.demo.bar3", label: "Percorsi sovrapposti (Dolomiti)", pct: 76 },
            { key: "home.matching.demo.bar4", label: "Stesso lean angle medio (38°)", pct: 91 },
            { key: "home.matching.demo.bar5", label: "Stessa fascia oraria (domenica AM)", pct: 83 },
          ].map(s => `
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text2)" data-i18n="${s.key}">${s.label}</span>
              <span style="font-size:12px;font-weight:700;color:var(--accent)">${s.pct}%</span>
            </div>
            <div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden">
              <div style="height:3px;width:${s.pct}%;background:var(--accent);border-radius:2px"></div>
            </div>
          </div>`).join("")}
        </div>
        <div style="margin-top:20px;padding:12px 16px;background:rgba(255,59,48,.08);border:1px solid rgba(255,59,48,.2);border-radius:3px;font-size:13px;color:var(--accent);font-weight:600;text-align:center" data-i18n="home.matching.demo.total">
          Affinità totale: 87% — Top match 🏆
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── AI TRIP PLANNING ── -->
<section class="home-ai-plan" aria-labelledby="ai-plan-heading">
  <div class="home-ai-plan-inner">
    <div class="home-ai-plan-photo" aria-hidden="true">
      <img src="/assets/images/bike-road-2.webp" srcset="/assets/images/bike-road-2-sm.webp 600w, /assets/images/bike-road-2.webp 1200w" sizes="(max-width: 860px) 100vw, 50vw" alt="Percorso moto curvy tra le montagne" width="1200" height="1800" loading="lazy" />
    </div>
    <div class="home-ai-plan-content">
      <span class="section-eyebrow" data-i18n="home.aiplan.eyebrow">Pianificazione intelligente</span>
      <h2 class="home-ai-plan-title" id="ai-plan-heading" data-i18n="home.aiplan.title">Il tuo itinerario moto.<br/><strong>In 30 secondi.</strong></h2>
      <p class="home-ai-plan-body" data-i18n="home.aiplan.body">Inserisci il punto di partenza, il tuo stile di guida e la moto che hai in garage. L'AI di BikerLink genera percorsi curvi personalizzati su misura per te — colline, passi, asfalto fresco. Nessun altro lo fa così.</p>
      <ul class="home-ai-plan-features" aria-label="Funzionalità pianificazione AI">
        <li><span class="home-ai-plan-check" aria-hidden="true">✓</span> <span data-i18n="home.aiplan.li1">Percorsi curvosi ottimizzati per la tua moto</span></li>
        <li><span class="home-ai-plan-check" aria-hidden="true">✓</span> <span data-i18n="home.aiplan.li2">Personalizzazione per stile di guida</span></li>
        <li><span class="home-ai-plan-check" aria-hidden="true">✓</span> <span data-i18n="home.aiplan.li3">Generazione in pochi secondi, ovunque</span></li>
        <li><span class="home-ai-plan-check" aria-hidden="true">✓</span> <span data-i18n="home.aiplan.li4">Nessun altro app biker lo fa</span></li>
      </ul>
      <div style="margin-top:32px">
        <a class="btn btn-primary" href="/download">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
          <span data-i18n="home.aiplan.btn">Pianifica il tuo giro</span>
        </a>
      </div>
    </div>
  </div>
</section>

<!-- ── CONTEST PHOTO GRID ── -->
<section class="home-contest" aria-labelledby="contest-heading">
  <div class="home-contest-inner">
    <span class="section-eyebrow" data-i18n="home.contest.eyebrow">PicContest</span>
    <h2 class="section-title" id="contest-heading" data-i18n="home.contest.title">Ogni settimana<br/><span class="accent">un nuovo palco.</span></h2>
    <p class="section-lead" data-i18n="home.contest.lead">Carica la tua foto migliore — moto, percorso, panorama. La community vota, il vincitore conquista la gallery della settimana.</p>
    <div class="home-contest-tags" aria-label="Hashtag del contest">
      <span class="home-contest-tag">#sunsetride</span>
      <span class="home-contest-tag">#curvy</span>
      <span class="home-contest-tag">#brotherhood</span>
      <span class="home-contest-tag">#track</span>
      <span class="home-contest-tag">#touring</span>
      <span class="home-contest-tag">#alpineroads</span>
    </div>
    <a class="btn btn-primary" href="/download" style="margin-bottom:36px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <span data-i18n="home.contest.btn">Partecipa al contest</span>
    </a>
    <div class="home-contest-grid" role="list">
      <article class="home-contest-card" role="listitem">
        <img src="/assets/images/contest-1.webp" srcset="/assets/images/contest-1-sm.webp 600w, /assets/images/contest-1.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Foto contest #1 — Moto in gara" width="1200" height="800" loading="lazy" />
        <div class="home-contest-overlay" aria-hidden="true"></div>
        <div class="home-contest-rank gold">🏆 1°</div>
        <div class="home-contest-meta">
          <span class="home-contest-author">@marco_v4</span>
          <span class="home-contest-likes">${heartSvg} 1.247</span>
        </div>
      </article>
      <article class="home-contest-card" role="listitem">
        <img src="/assets/images/contest-2.webp" srcset="/assets/images/contest-2-sm.webp 600w, /assets/images/contest-2.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Foto contest #2 — Biker su passo di montagna" width="1200" height="800" loading="lazy" />
        <div class="home-contest-overlay" aria-hidden="true"></div>
        <div class="home-contest-rank">🥈 2°</div>
        <div class="home-contest-meta">
          <span class="home-contest-author">@giulia.rides</span>
          <span class="home-contest-likes">${heartSvg} 983</span>
        </div>
      </article>
      <article class="home-contest-card" role="listitem">
        <img src="/assets/images/contest-3.webp" srcset="/assets/images/contest-3-sm.webp 600w, /assets/images/contest-3.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Foto contest #3 — Moto sul passo" width="1200" height="800" loading="lazy" />
        <div class="home-contest-overlay" aria-hidden="true"></div>
        <div class="home-contest-rank">🥉 3°</div>
        <div class="home-contest-meta">
          <span class="home-contest-author">@duke_790</span>
          <span class="home-contest-likes">${heartSvg} 821</span>
        </div>
      </article>
    </div>
  </div>
</section>

<!-- ── TRUST PILLARS ── -->
<section class="section" aria-labelledby="trust-heading">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="home.trust.eyebrow">Pensata per te</span>
    <h2 class="section-title" id="trust-heading" data-i18n="home.trust.title">Niente abbonamenti.<br/><span class="accent">Niente compromessi.</span></h2>
    <div class="grid grid-3" style="margin-top:24px">
      <article class="card"><div class="card-img"><img src="/assets/images/card-biker.webp" srcset="/assets/images/card-biker-sm.webp 400w, /assets/images/card-biker.webp 800w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Biker solitario — privacy e libertà" width="800" height="1200" loading="lazy" /></div><h3 data-i18n="home.trust.card1.title">Privacy reale</h3><p data-i18n="home.trust.card1.desc">Ghost Mode, fuzzing GPS, Fake Home. Scegli tu cosa rendere visibile.</p><div class="meta" data-i18n="home.trust.card1.meta">GDPR · Italian-made</div></article>
      <article class="card"><div class="card-img"><img src="/assets/images/bike-road-1.webp" srcset="/assets/images/bike-road-1-sm.webp 600w, /assets/images/bike-road-1.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Moto su strada veloce" width="1200" height="1800" loading="lazy" /></div><h3 data-i18n="home.trust.card2.title">Veloce e leggera</h3><p data-i18n="home.trust.card2.desc">App nativa, caricamento progressivo, mappa ottimizzata anche con connessione lenta.</p><div class="meta" data-i18n="home.trust.card2.meta">Android · iOS in arrivo</div></article>
      <article class="card"><div class="card-img"><img src="/assets/images/motoclub-ride.webp" srcset="/assets/images/motoclub-ride-sm.webp 600w, /assets/images/motoclub-ride.webp 1200w" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px" alt="Community di motociclisti in gruppo" width="1200" height="785" loading="lazy" /></div><h3 data-i18n="home.trust.card3.title">Community moderata</h3><p data-i18n="home.trust.card3.desc">Sistema di segnalazioni, moderazione automatica, EULA chiaro. Zero tolleranza per spam e abusi.</p><div class="meta" data-i18n="home.trust.card3.meta">24/7</div></article>
    </div>
  </div>
</section>

${COMP_SECTION}

<!-- ── SEO PROSE ── -->
<section class="section alt" aria-label="Approfondimento">
  <div class="section-inner prose">
    <h2 data-i18n="home.seo.h2">Perché un'app dedicata ai motociclisti</h2>
    <p data-i18n="home.seo.p1">I motociclisti italiani sono oltre 6 milioni, ma sui social tradizionali si perdono nel rumore. Forum verticali esistono da decenni e restano utili per le discussioni tecniche, però mancavano di mobilità: niente mappa live, niente coordinamento in tempo reale, niente notifiche di prossimità. BikerLink colma quel vuoto con un'app pensata da chi guida una moto, non da chi disegna prodotti generici.</p>
    <p data-i18n="home.seo.p2">Il focus è sulla strada vera: organizzare un giro la domenica mattina, trovare qualcuno con la stessa moto per un confronto tecnico, condividere foto di un passo di montagna, ricevere aiuto se rimani a piedi. Tutte attività che già avvengono nei gruppi WhatsApp e nei forum, ma in modo frammentato. Avere uno strumento unico cambia l'esperienza quotidiana di chi vive la moto come passione, non come semplice mezzo di trasporto.</p>
    <p data-i18n-html="home.seo.p3">Per saperne di più sulla nostra storia e sulla mission, leggi <a href="/about">chi siamo</a>. Per domande pratiche su privacy, costi e gestione account vai alle <a href="/faq">domande frequenti</a>.</p>
  </div>
</section>

<!-- ── CTA ── -->
<section class="cta-block" aria-label="Call to action">
  <h2 data-i18n="home.cta.title">Pronto a non <span style="color:var(--accent)">guidare più da solo?</span></h2>
  <p data-i18n="home.cta.desc">Iscriviti gratis, completa il profilo, e in 60 secondi sei sulla mappa con rider da tutto il mondo.</p>
  <div class="btn-row">
    <a class="btn btn-primary" href="/download" data-i18n="home.cta.btn1">Scarica BikerLink</a>
    <a class="btn btn-outline" href="/faq" data-i18n="home.cta.btn2">Domande frequenti</a>
  </div>
</section>
`;
  return { meta, body };
}
