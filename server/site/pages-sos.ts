import {
  type PageMeta,
  breadcrumbsJsonLd,
} from "./render";
import { icon } from "./pages-shared";

export function buildSos(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/sos",
    title: "SOS Biker — Emergenza stradale per motociclisti | BikerLink",
    description:
      "L'SOS di BikerLink notifica i motociclisti vicino a te con la tua posizione GPS in caso di emergenza. Come funziona, quando si attiva, le garanzie di privacy.",
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "SOS Biker", path: "/sos" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "Come attivare l'SOS Biker di BikerLink",
        description:
          "Procedura per attivare la richiesta di soccorso dalla community in caso di emergenza stradale.",
        totalTime: "PT30S",
        step: [
          {
            "@type": "HowToStep",
            position: 1,
            name: "Apri BikerLink",
            text: "Avvia l'app sul tuo dispositivo. L'SOS è raggiungibile dalla home con un tap.",
          },
          {
            "@type": "HowToStep",
            position: 2,
            name: "Tocca il pulsante SOS",
            text: "Premi il pulsante rosso SOS. Seleziona il motivo (guasto, incidente, altro) e il raggio di ricerca.",
          },
          {
            "@type": "HowToStep",
            position: 3,
            name: "Conferma la richiesta",
            text: "Confermando, la tua posizione GPS precisa viene inviata ai biker online entro il raggio scelto.",
          },
          {
            "@type": "HowToStep",
            position: 4,
            name: "Chatta con chi accetta",
            text: "Quando un biker accetta, si apre una chat privata. Coordinatevi per il soccorso.",
          },
        ],
      },
    ],
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; SOS</div>
  <h1 data-i18n-html="sos.hero.h1">SOS <span class="accent">BIKER</span></h1>
  <p class="lead" data-i18n="sos.hero.lead">Un tasto. La community ti trova. Pensato per le emergenze stradali reali: guasti, foratura, incidente lieve, quando il 112 non basta e serve un altro biker accanto.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/download" data-i18n="sos.hero.btn.download">Scarica l'app</a>
    <a class="btn btn-outline" href="#how" data-i18n="sos.hero.btn.how">Come funziona</a>
  </div>
</section>

<section id="how" class="section">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="sos.steps.eyebrow">Procedura</span>
    <h2 class="section-title" data-i18n="sos.steps.title">Come si attiva</h2>
    <div class="steps">
      <div class="step"><div><h3 data-i18n="sos.steps.s1.title">Apri l'app</h3><p data-i18n="sos.steps.s1.desc">L'SOS è sempre raggiungibile dalla home — un tap, niente menù nascosti.</p></div></div>
      <div class="step"><div><h3 data-i18n="sos.steps.s2.title">Tocca SOS</h3><p data-i18n="sos.steps.s2.desc">Scegli il motivo (guasto, incidente, panne tecnica) e il raggio di ricerca (5–50 km).</p></div></div>
      <div class="step"><div><h3 data-i18n="sos.steps.s3.title">Conferma</h3><p data-i18n="sos.steps.s3.desc">La posizione GPS precisa viene inviata ai biker online nel raggio scelto. Notifica push immediata.</p></div></div>
      <div class="step"><div><h3 data-i18n="sos.steps.s4.title">Coordina</h3><p data-i18n="sos.steps.s4.desc">Quando un biker accetta, si apre una chat privata. Concordate l'intervento direttamente in app.</p></div></div>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="sos.privacy.eyebrow">Garanzie</span>
    <h2 class="section-title" data-i18n="sos.privacy.title">Privacy e sicurezza</h2>
    <div class="grid grid-3">
      <article class="card"><div class="icon">${icon.lock}</div><h3 data-i18n="sos.privacy.card1.title">Solo su attivazione</h3><p data-i18n="sos.privacy.card1.desc">La posizione precisa viene condivisa esclusivamente quando attivi l'SOS — mai prima, mai in background silenzioso.</p></article>
      <article class="card"><div class="icon">${icon.shield}</div><h3 data-i18n="sos.privacy.card2.title">Raggio scelto da te</h3><p data-i18n="sos.privacy.card2.desc">Decidi tu chi può vedere la tua emergenza: 5, 10, 30 o 50 km. Solo i biker dentro il raggio ricevono la notifica.</p></article>
      <article class="card"><div class="icon">${icon.alert}</div><h3 data-i18n="sos.privacy.card3.title">Annullabile sempre</h3><p data-i18n="sos.privacy.card3.desc">Annulli quando vuoi. Lo storico SOS viene cancellato automaticamente dopo 6 mesi.</p></article>
    </div>
    <div style="margin-top:32px;padding:20px;background:var(--surface);border-left:3px solid var(--accent);border-radius:var(--radius)">
      <p style="color:var(--text2);font-size:14px" data-i18n-html="sos.warn"><strong style="color:var(--text)">Importante:</strong> BikerLink non sostituisce i servizi di emergenza ufficiali. In caso di pericolo per la vita, chiama sempre il <strong style="color:var(--text)">112</strong>. L'SOS Biker è uno strumento complementare per assistenza tra motociclisti.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner prose">
    <h2 data-i18n="sos.why.title">Perché esiste questa funzione</h2>
    <p data-i18n-html="sos.why.p1">Capita a chiunque viaggi su due ruote: una catena che salta in una zona senza copertura del soccorso stradale, una caduta a bassa velocità con la moto ribaltata su un fianco, una panne elettrica al tramonto su una statale poco trafficata. In quei momenti il 112 è la chiamata giusta solo se c'è un'emergenza medica reale. Per tutto il resto serve un altro paio di braccia, e quasi sempre un altro motociclista è la persona giusta perché conosce la moto, sa cosa cercare, e ha già vissuto situazioni simili.</p>
    <p data-i18n-html="sos.why.p2">Il pulsante SOS di BikerLink nasce esattamente per quello scenario intermedio: non un'emergenza sanitaria, ma una difficoltà tecnica o logistica in cui serve aiuto fisico in poco tempo. La rete locale di iscritti riceve la notifica solo se è online e dentro il raggio che hai scelto. Nessun dato viene memorizzato oltre il necessario per coordinare l'intervento.</p>
    <p data-i18n-html="sos.why.p3">Tutti i dettagli su privacy, ritenzione dei dati e limitazioni sono nella <a href="/privacy">Privacy Policy</a> e nelle <a href="/faq">domande frequenti</a>. Per qualsiasi dubbio o segnalazione contattaci tramite la pagina <a href="/contact">contatti</a>.</p>
  </div>
</section>

<section class="cta-block">
  <h2 data-i18n="sos.cta.title">Non guidare più da solo.</h2>
  <p data-i18n="sos.cta.desc">Con BikerLink hai sempre qualcuno vicino — anche quando ti serve davvero.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download" data-i18n="sos.cta.btn">Scarica BikerLink</a></div>
</section>
`;
  return { meta, body };
}
