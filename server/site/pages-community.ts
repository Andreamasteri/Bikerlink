import {
  type PageMeta,
  breadcrumbsJsonLd,
} from "./render";
import { icon } from "./pages-shared";

export function buildCommunity(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/community",
    title: "Community BikerLink — Mappa mondiale biker, contest, eventi",
    description:
      "La community BikerLink raccoglie motociclisti da tutto il mondo. Mappa interattiva degli iscritti, contest fotografici settimanali, eventi, chat e profili.",
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Community", path: "/community" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Community BikerLink — Mappa mondiale biker, contest, eventi",
        description: "La community BikerLink raccoglie motociclisti da tutto il mondo. Mappa interattiva degli iscritti, contest fotografici settimanali, eventi, chat e profili.",
        url: `${baseUrl}/community`,
        inLanguage: "it-IT",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntity: {
          "@type": "SoftwareApplication",
          name: "BikerLink Community",
          applicationCategory: "SocialNetworkingApplication",
          operatingSystem: "Android, iOS",
          description: "Rete mondiale di motociclisti con mappa interattiva live, contest fotografici settimanali, eventi e raduni, chat 1-to-1 e di gruppo, garage condiviso e profili verificati.",
          featureList: [
            "Mappa globale degli iscritti aggiornata ogni 5 minuti",
            "Contest fotografici settimanali con voto della community",
            "Calendario eventi e raduni con RSVP e geolocalizzazione",
            "Chat private 1-to-1 e di gruppo MotoClub",
            "Condivisione GPS volontaria in chat per ritrovarsi durante un giro",
            "Garage condiviso: moto, storia, modifiche e foto",
            "Profili verificati con moderazione attiva",
          ],
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        },
      },
    ],
    headExtras: `<link rel="preconnect" href="https://unpkg.com" crossorigin />
<link rel="preconnect" href="https://basemaps.cartocdn.com" crossorigin />`,
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <span data-i18n="community.hero.breadcrumb">Community</span></div>
  <h1><span data-i18n="community.hero.h1.main">COMMUNITY</span> <span class="accent">BIKER</span><span style="display:block;font-size:0.38em;letter-spacing:3px;font-weight:700;color:var(--text3);margin-top:10px" data-i18n="community.hero.subtitle">MAPPA MONDIALE E RADUNI</span></h1>
  <p class="lead" data-i18n="community.hero.lead">Riders da tutta Italia (e oltre). Mostriamo dove sono, cosa fanno, e perché vale la pena unirsi. Una rete pensata per chi vive la strada in moto e cerca persone vere con cui condividerla.</p>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="community.map.eyebrow">Mappa globale</span>
    <h2 class="section-title" data-i18n="community.map.title">Dove sono i nostri <span class="accent">biker</span></h2>
    <p class="section-lead" data-i18n="community.map.lead">Distribuzione aggregata degli iscritti per paese. Aggiornata ogni 5 minuti. Nessun dato personale visibile — solo il conteggio.</p>
    <div id="world-map" role="img" aria-label="Mappa mondiale degli iscritti BikerLink per paese"></div>
    <div class="map-legend">
      <span><span class="dot"></span><span data-i18n="community.map.legend">Concentrazione biker (cerchio proporzionale al numero)</span></span>
    </div>
    <noscript><p style="margin-top:16px;color:var(--text3);font-size:13px">La mappa interattiva richiede JavaScript abilitato.</p></noscript>
  </div>
</section>

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="community.life.eyebrow">Cosa succede</span>
    <h2 class="section-title" data-i18n="community.what.title">La community è <span class="accent">viva</span></h2>
    <div class="grid grid-3">
      <article class="card"><div class="icon">${icon.camera}</div><h3 data-i18n="community.life.card1.title">Contest fotografici</h3><p data-i18n="community.life.card1.desc">Ogni settimana un tema: giro più tortuoso, alba in moto, ritratto biker. Vota le foto degli altri, pubblica le tue.</p></article>
      <article class="card"><div class="icon">${icon.users}</div><h3 data-i18n="community.life.card2.title">Eventi e raduni</h3><p data-i18n="community.life.card2.desc">Sezione eventi con calendario, geolocalizzazione, RSVP. Organizza il tuo raduno o partecipa a quelli vicini.</p></article>
      <article class="card"><div class="icon">${icon.message}</div><h3 data-i18n="community.life.card3.title">Chat sempre attive</h3><p data-i18n="community.life.card3.desc">Chat private 1-to-1, chat di gruppo MotoClub, condivisione GPS volontaria in chat per ritrovarsi durante un giro.</p></article>
      <article class="card"><div class="icon">${icon.bike}</div><h3 data-i18n="community.life.card4.title">Garage condiviso</h3><p data-i18n="community.life.card4.desc">Mostra la tua moto. Storia, modifiche, foto. Connettiti con chi ha lo stesso modello.</p></article>
      <article class="card"><div class="icon">${icon.heart}</div><h3 data-i18n="community.life.card5.title">Profili veri</h3><p data-i18n="community.life.card5.desc">Nickname, bio, anno di nascita, regione. Foto profilo soggetta ad approvazione: niente bot, niente fake.</p></article>
      <article class="card"><div class="icon">${icon.shield}</div><h3 data-i18n="community.life.card6.title">Moderazione attiva</h3><p data-i18n="community.life.card6.desc">Segnalazioni con risposta entro 24h. Block list e mute personali sempre disponibili.</p></article>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner prose">
    <h2 data-i18n="community.seo.h2">Una rete che cresce, ogni settimana</h2>
    <p data-i18n="community.seo.p1">BikerLink è una piattaforma in continua espansione. Ogni mese si registrano centinaia di nuovi utenti, prevalentemente dall'Italia ma anche da Francia, Spagna, Germania, Stati Uniti e Sud America. Non è un numero buttato lì: il backend traccia gli iscritti aggregati per paese e li mostra sulla mappa qui sopra in modo trasparente, senza esporre dati personali.</p>
    <p data-i18n="community.seo.p2">L'obiettivo non è massimizzare il numero di account, ma costruire una rete attiva e di qualità. Per questo ogni profilo viene controllato in fase di approvazione foto, ogni richiesta di adesione a un club passa dagli admin, e ogni segnalazione viene letta entro 24 ore. È un equilibrio fragile, e funziona solo se chi entra rispetta le regole di base: rispetto reciproco, niente spam, niente contenuti illegali.</p>
    <p data-i18n-html="community.seo.p3">Se vuoi capire come è nata BikerLink, chi la sviluppa e quali sono i principi guida, leggi la pagina <a href="/about">chi siamo</a>. Se invece hai dubbi pratici (privacy, costi, eliminazione account), trovi tutte le risposte nelle <a href="/faq">domande frequenti</a>.</p>
  </div>
</section>

<section class="cta-block">
  <h2 data-i18n="community.cta.title">Unisciti.</h2>
  <p data-i18n="community.cta.desc">Oltre 5.000 rider da tutto il mondo sono già dentro. Tocca a te.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download" data-i18n="community.cta.btn">Scarica BikerLink</a></div>
</section>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  function init(){
    if(typeof L === 'undefined'){ setTimeout(init, 200); return; }
    var el = document.getElementById('world-map');
    if(!el) return;
    var map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, worldCopyJump: true }).setView([30, 10], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd', maxZoom: 6, minZoom: 2
    }).addTo(map);
    fetch('/api/community/stats').then(function(r){ return r.json(); }).then(function(data){
      if(!data || !Array.isArray(data.countries)) return;
      data.countries.forEach(function(c){
        if(c.lat==null || c.lon==null || !c.count) return;
        var r = Math.max(6, Math.min(28, Math.sqrt(c.count) * 2.5));
        L.circleMarker([c.lat, c.lon], {
          radius: r, color: '#FF3B30', weight: 1.5, fillColor: '#FF3B30', fillOpacity: 0.45
        }).bindPopup('<strong>'+c.name+'</strong><br/>'+c.count+' biker').addTo(map);
      });
      if(data.total){
        var s = document.getElementById('stat-users');
        if(s) s.textContent = data.total.toLocaleString('it-IT')+'+';
      }
    }).catch(function(){});
  }
  init();
})();
</script>
`;
  return { meta, body };
}
