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
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Funzionalità", path: "/features" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Funzionalità BikerLink",
        description: "Tutte le funzioni BikerLink: mappa biker live, MotoClub con chat, SOS d'emergenza, contest fotografici, matching e tracking GPS.",
        url: `${baseUrl}/features`,
        inLanguage: "it-IT",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntity: {
          "@type": "ItemList",
          name: "Moduli BikerLink",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Mappa biker live", description: "Mappa interattiva con posizione live degli utenti online. Filtri per modello, brand, disponibilità a un giro.", url: `${baseUrl}/community` },
            { "@type": "ListItem", position: 2, name: "MotoClub", description: "Sistema completo: creazione club, codici invito, pannello admin, approvazioni manuali o auto-join, chat di gruppo dedicata.", url: `${baseUrl}/motoclub` },
            { "@type": "ListItem", position: 3, name: "SOS emergenza", description: "Un tasto invia la posizione ai biker nel raggio scelto con chat privata istantanea.", url: `${baseUrl}/sos` },
            { "@type": "ListItem", position: 4, name: "Contest fotografici", description: "Concorsi fotografici settimanali con voto degli iscritti, categorie tematiche e classifica live.", url: `${baseUrl}/community` },
            { "@type": "ListItem", position: 5, name: "Tracking GPS", description: "Tracker preciso con km, velocità media, G-force longitudinale e accelerazione. Storico privato e statistiche cumulative.", url: `${baseUrl}/about` },
            { "@type": "ListItem", position: 6, name: "Matching biker", description: "Algoritmo basato su moto posseduta, stile di guida, zona e gusti musicali per trovare compagni di viaggio compatibili.", url: `${baseUrl}/matching` },
          ],
        },
      },
    ],
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
    i18nPrefix = "",
  ) => {
    const imgSrcSm = imgSrc.replace(".webp", "-sm.webp");
    const smallW = Math.round(imgWidth / 2);
    const tagAttr = i18nPrefix ? ` data-i18n="${i18nPrefix}.tag"` : "";
    const titleAttr = i18nPrefix ? ` data-i18n="${i18nPrefix}.title"` : "";
    const textAttr = i18nPrefix ? ` data-i18n="${i18nPrefix}.text"` : "";
    const ctaAttr = i18nPrefix ? ` data-i18n="${i18nPrefix}.cta"` : "";
    return `
<article class="feature-row">
  <div>
    <span class="tag"${tagAttr}>${tag}</span>
    <h2${titleAttr}>${title}</h2>
    <p${textAttr}>${text}</p>
    <a class="btn btn-outline" href="${href}"${ctaAttr}>${cta} →</a>
  </div>
  <div class="visual">
    <img src="${imgSrc}" srcset="${imgSrcSm} ${smallW}w, ${imgSrc} ${imgWidth}w" sizes="(max-width: 860px) 100vw, 50vw" alt="${imgAlt}" width="${imgWidth}" height="${imgHeight}" loading="lazy" />
  </div>
</article>`;
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <span data-i18n="features.hero.breadcrumb">Funzionalità</span></div>
  <h1><span data-i18n="features.hero.h1.main">FUNZIONALITÀ</span> <span class="accent">BIKERLINK</span><span style="display:block;font-size:0.38em;letter-spacing:3px;font-weight:700;color:var(--text3);margin-top:10px" data-i18n="features.hero.title.sub">PER MOTOCICLISTI</span></h1>
  <p class="lead" data-i18n="features.hero.lead">Sei moduli costruiti per il motociclista. Niente filler — ogni feature risolve un problema reale.</p>
</section>

<section class="section">
  <div class="section-inner">
    ${feature("Mappa", "Vedi i biker vicino a te, in tempo reale", "Mappa interattiva con posizione live degli utenti online. Filtri per modello, brand, disponibilità a un giro. Heartbeat ogni 30 secondi per visibilità affidabile.", "/assets/images/bike-road-1.webp", "Moto su strada — mappa biker live", "/community", "Vai alla community", 1200, 1800, "features.f1")}
    ${feature("MotoClub", "Crea il tuo club. Gestiscilo come vuoi.", "Sistema completo: creazione club, codici invito, pannello admin, approvazioni manuali o auto-join, chat di gruppo dedicata con hashtag e filtri. Pensato per veri equipaggi e gruppi locali.", "/assets/images/motoclub-ride.webp", "Gruppo di motociclisti — MotoClub BikerLink", "/motoclub", "Scopri i MotoClub", 1200, 785, "features.f2")}
    ${feature("SOS", "Un tasto. La rete ti trova.", "Quando attivi l'SOS, la tua posizione precisa viene inviata ai motociclisti entro il raggio scelto. Chat privata istantanea con chi accetta. Tutto integrato, niente numeri da chiamare in panico.", "/assets/images/bike-road-2.webp", "Moto sulla strada — SOS emergenza biker", "/sos", "Come funziona l'SOS", 1200, 1800, "features.f3")}
    ${feature("Contest foto", "Mostra la tua moto. Vinci visibilità.", "Concorsi fotografici settimanali con voto degli iscritti. Categorie tematiche, classifica live, profili in evidenza per i vincitori. Pubblica la foto del tuo ultimo giro e raccontala.", "/assets/images/contest-1.webp", "Foto contest moto — BikerLink PicContest", "/community", "Vedi i contest", 1200, 800, "features.f4")}
    ${feature("Tracking GPS", "Registra ogni giro. Senza limiti.", "Tracker preciso con km, velocità media, G-force longitudinale e accelerazione. Storico privato, statistiche cumulative, e modalità Ghost se non vuoi essere visibile durante il giro.", "/assets/images/telemetry-dash.webp", "Dashboard telemetria moto — tracking GPS BikerLink", "/about", "Leggi la mission", 1024, 1024, "features.f5")}
    ${feature("Matching biker", "Trova compagni di viaggio compatibili.", "Algoritmo basato su moto posseduta, stile di guida, zona, e gusti musicali (integrazione Last.fm opzionale). Più che un'app di incontri — un modo per non partire più da soli.", "/assets/images/card-biker.webp", "Biker solitario — matching compagni di viaggio", "/matching/come-funziona", "Come funziona il matching", 800, 1200, "features.f6")}
  </div>
</section>

${COMP_SECTION}

<section class="cta-block">
  <h2 data-i18n-html="features.cta.heading">Provala adesso. <span style="color:var(--accent)">È gratis.</span></h2>
  <p data-i18n="features.cta.desc">Scarica BikerLink e in un minuto sei dentro con rider da tutto il mondo.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download" data-i18n="features.cta.btn">Scarica l'app</a></div>
</section>
`;
  return { meta, body };
}
