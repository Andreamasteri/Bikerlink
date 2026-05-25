import {
  type PageMeta,
  breadcrumbsJsonLd,
} from "./render";
import { COMP_SECTION } from "./pages-shared";

export function buildFeatures(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/features",
    title: "Funzionalità BikerLink — Mappa, MotoClub, SOS, Contest",
    description:
      "Tutte le funzioni BikerLink: mappa biker live, MotoClub con chat, SOS d'emergenza, contest fotografici, matching e tracking GPS.",
    jsonld: breadcrumbsJsonLd(baseUrl, [
      { name: "Home", path: "/" },
      { name: "Funzionalità", path: "/features" },
    ]),
  };
  const feature = (
    tag: string,
    title: string,
    text: string,
    imgSrc: string,
    imgAlt: string,
    href: string,
    cta: string,
    imgWidth = 1200,
    imgHeight = 800,
  ) => {
    const imgSrcSm = imgSrc.replace(".webp", "-sm.webp");
    const smallW = Math.round(imgWidth / 2);
    return `
<article class="feature-row">
  <div>
    <span class="tag">${tag}</span>
    <h2>${title}</h2>
    <p>${text}</p>
    <a class="btn btn-outline" href="${href}">${cta} →</a>
  </div>
  <div class="visual">
    <img src="${imgSrc}" srcset="${imgSrcSm} ${smallW}w, ${imgSrc} ${imgWidth}w" sizes="(max-width: 860px) 100vw, 50vw" alt="${imgAlt}" width="${imgWidth}" height="${imgHeight}" loading="lazy" />
  </div>
</article>`;
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Funzionalità</div>
  <h1>FUNZIO<span class="accent">NALITÀ</span></h1>
  <p class="lead">Sei moduli costruiti per il motociclista italiano. Niente filler — ogni feature risolve un problema reale.</p>
</section>

<section class="section">
  <div class="section-inner">
    ${feature("Mappa", "Vedi i biker vicino a te, in tempo reale", "Mappa interattiva con posizione live degli utenti online. Filtri per modello, brand, disponibilità a un giro. Heartbeat ogni 30 secondi per visibilità affidabile.", "/assets/images/bike-road-1.webp", "Moto su strada — mappa biker live", "/community", "Vai alla community", 1200, 1800)}
    ${feature("MotoClub", "Crea il tuo club. Gestiscilo come vuoi.", "Sistema completo: creazione club, codici invito, pannello admin, approvazioni manuali o auto-join, chat di gruppo dedicata con hashtag e filtri. Pensato per veri equipaggi e gruppi locali.", "/assets/images/motoclub-ride.webp", "Gruppo di motociclisti — MotoClub BikerLink", "/motoclub", "Scopri i MotoClub", 1200, 785)}
    ${feature("SOS", "Un tasto. La rete ti trova.", "Quando attivi l'SOS, la tua posizione precisa viene inviata ai motociclisti entro il raggio scelto. Chat privata istantanea con chi accetta. Tutto integrato, niente numeri da chiamare in panico.", "/assets/images/bike-road-2.webp", "Moto sulla strada — SOS emergenza biker", "/sos", "Come funziona l'SOS", 1200, 1800)}
    ${feature("Contest foto", "Mostra la tua moto. Vinci visibilità.", "Concorsi fotografici settimanali con voto degli iscritti. Categorie tematiche, classifica live, profili in evidenza per i vincitori. Pubblica la foto del tuo ultimo giro e raccontala.", "/assets/images/contest-1.webp", "Foto contest moto — BikerLink PicContest", "/community", "Vedi i contest", 1200, 800)}
    ${feature("Tracking GPS", "Registra ogni giro. Senza limiti.", "Tracker preciso con km, velocità media, G-force longitudinale e accelerazione. Storico privato, statistiche cumulative, e modalità Ghost se non vuoi essere visibile durante il giro.", "/assets/images/telemetry-dash.webp", "Dashboard telemetria moto — tracking GPS BikerLink", "/about", "Leggi la mission", 1024, 1024)}
    ${feature("Matching biker", "Trova compagni di viaggio compatibili.", "Algoritmo basato su moto posseduta, stile di guida, zona, e gusti musicali (integrazione Last.fm opzionale). Più che un'app di incontri — un modo per non partire più da soli.", "/assets/images/card-biker.webp", "Biker solitario — matching compagni di viaggio", "/faq", "Domande frequenti", 800, 1200)}
  </div>
</section>

${COMP_SECTION}

<section class="cta-block">
  <h2>Provala adesso. <span style="color:var(--accent)">È gratis.</span></h2>
  <p>Scarica BikerLink e in un minuto sei dentro con tutta la community italiana.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica l'app</a></div>
</section>
`;
  return { meta, body };
}
