import {
  type PageMeta,
  organizationJsonLd,
  breadcrumbsJsonLd,
} from "./render";

// SVG icon helpers (Feather-style, inline)
const icon = {
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

const HERO_STATS = `
<section class="section" aria-label="Statistiche piattaforma">
  <div class="section-inner">
    <div class="stats-row">
      <div class="stat"><div class="stat-value" id="stat-users">5.000+</div><div class="stat-label">Biker registrati</div></div>
      <div class="stat"><div class="stat-value">100%</div><div class="stat-label">Gratis, per sempre</div></div>
      <div class="stat"><div class="stat-value">24/7</div><div class="stat-label">SOS attivo</div></div>
      <div class="stat"><div class="stat-value">0€</div><div class="stat-label">Costi nascosti</div></div>
    </div>
  </div>
</section>`;

// ── HOME ──────────────────────────────────────────────────────────────────────
export function buildHome(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/",
    title: "BikerLink — App per motociclisti: GPS, Community, SOS",
    description:
      "App verticale per motociclisti: mappa biker live, MotoClub, SOS emergenza, contest foto. Gratis, italiana, in continua evoluzione.",
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
        image: `${baseUrl}/assets/images/playstore-icon.png`,
      },
    ],
  };
  const body = `
<section class="page-hero">
  <h1>BIKER<span class="accent">·</span>LINK<br/><span class="accent" style="font-size:.55em">U'll Never Ride Alone</span></h1>
  <p class="lead">La prima piattaforma social verticale dedicata ai motociclisti. Trova biker vicino a te, crea il tuo MotoClub, attiva l'SOS quando serve.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/download">Scarica l'app</a>
    <a class="btn btn-outline" href="/features">Scopri le funzionalità</a>
  </div>
</section>

${HERO_STATS}

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow">Cosa puoi fare</span>
    <h2 class="section-title">Tutto ciò che <span class="accent">un biker</span> vuole.</h2>
    <p class="section-lead">Sei funzioni che lavorano insieme: dalla mappa live agli SOS, dai MotoClub ai contest. Niente fronzoli, niente abbonamenti.</p>
    <div class="grid grid-3">
      <article class="card"><div class="icon">${icon.map}</div><h3>Mappa biker live</h3><p>Vedi chi è online vicino a te in tempo reale. Filtra per moto, brand, disponibilità a un giro.</p></article>
      <article class="card"><div class="icon">${icon.users}</div><h3>MotoClub</h3><p>Crea o entra in un club. Admin, codici invito, chat di gruppo dedicata.</p></article>
      <article class="card"><div class="icon">${icon.alert}</div><h3>SOS Biker</h3><p>Un tasto. La community vicina riceve la notifica con la tua posizione precisa.</p></article>
      <article class="card"><div class="icon">${icon.camera}</div><h3>Contest foto</h3><p>Concorsi fotografici settimanali. Mostra la tua moto, il tuo giro, vinci visibilità.</p></article>
      <article class="card"><div class="icon">${icon.gps}</div><h3>Tracking percorsi</h3><p>Registra i tuoi giri con velocità, km, G-force. Storico privato e statistiche.</p></article>
      <article class="card"><div class="icon">${icon.heart}</div><h3>Matching biker</h3><p>Trova compagni di viaggio compatibili per moto, stile di guida e gusti musicali.</p></article>
    </div>
    <div style="margin-top:32px"><a class="btn btn-outline" href="/features">Tutte le funzionalità →</a></div>
  </div>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow">Pensata per te</span>
    <h2 class="section-title">Niente abbonamenti.<br/><span class="accent">Niente compromessi.</span></h2>
    <div class="grid grid-3" style="margin-top:24px">
      <article class="card"><div class="icon">${icon.lock}</div><h3>Privacy reale</h3><p>Ghost Mode, fuzzing GPS, Fake Home. Scegli tu cosa rendere visibile.</p><div class="meta">GDPR · Italian-made</div></article>
      <article class="card"><div class="icon">${icon.zap}</div><h3>Veloce e leggera</h3><p>App nativa, caricamento progressivo, mappa ottimizzata anche con connessione lenta.</p><div class="meta">Android · iOS in arrivo</div></article>
      <article class="card"><div class="icon">${icon.shield}</div><h3>Community moderata</h3><p>Sistema di segnalazioni, moderazione automatica, EULA chiaro. Zero tolleranza per spam e abusi.</p><div class="meta">24/7</div></article>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner prose">
    <h2>Perché un'app dedicata ai motociclisti</h2>
    <p>I motociclisti italiani sono oltre 6 milioni, ma sui social tradizionali si perdono nel rumore. Forum verticali esistono da decenni e restano utili per le discussioni tecniche, però mancavano di mobilità: niente mappa live, niente coordinamento in tempo reale, niente notifiche di prossimità. BikerLink colma quel vuoto con un'app pensata da chi guida una moto, non da chi disegna prodotti generici.</p>
    <p>Il focus è sulla strada vera: organizzare un giro la domenica mattina, trovare qualcuno con la stessa moto per un confronto tecnico, condividere foto di un passo di montagna, ricevere aiuto se rimani a piedi. Tutte attività che già avvengono nei gruppi WhatsApp e nei forum, ma in modo frammentato. Avere uno strumento unico cambia l'esperienza quotidiana di chi vive la moto come passione, non come semplice mezzo di trasporto.</p>
    <p>Per saperne di più sulla nostra storia e sulla mission, leggi <a href="/about">chi siamo</a>. Per domande pratiche su privacy, costi e gestione account vai alle <a href="/faq">domande frequenti</a>.</p>
  </div>
</section>

<section class="cta-block">
  <h2>Pronto a non <span style="color:var(--accent)">guidare più da solo?</span></h2>
  <p>Iscriviti gratis, completa il profilo, e in 60 secondi sei sulla mappa con la rete italiana.</p>
  <div class="btn-row">
    <a class="btn btn-primary" href="/download">Scarica BikerLink</a>
    <a class="btn btn-outline" href="/faq">Domande frequenti</a>
  </div>
</section>
`;
  return { meta, body };
}

// ── FEATURES ──────────────────────────────────────────────────────────────────
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
    iconKey: keyof typeof icon,
    href: string,
    cta: string,
  ) => `
<article class="feature-row">
  <div>
    <span class="tag">${tag}</span>
    <h2>${title}</h2>
    <p>${text}</p>
    <a class="btn btn-outline" href="${href}">${cta} →</a>
  </div>
  <div class="visual" aria-hidden="true">${icon[iconKey]}</div>
</article>`;
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Funzionalità</div>
  <h1>FUNZIO<span class="accent">NALITÀ</span></h1>
  <p class="lead">Sei moduli costruiti per il motociclista italiano. Niente filler — ogni feature risolve un problema reale.</p>
</section>

<section class="section">
  <div class="section-inner">
    ${feature("Mappa", "Vedi i biker vicino a te, in tempo reale", "Mappa interattiva con posizione live degli utenti online. Filtri per modello, brand, disponibilità a un giro. Heartbeat ogni 30 secondi per visibilità affidabile.", "map", "/community", "Vai alla community")}
    ${feature("MotoClub", "Crea il tuo club. Gestiscilo come vuoi.", "Sistema completo: creazione club, codici invito, pannello admin, approvazioni manuali o auto-join, chat di gruppo dedicata con hashtag e filtri. Pensato per veri equipaggi e gruppi locali.", "users", "/motoclub", "Scopri i MotoClub")}
    ${feature("SOS", "Un tasto. La rete ti trova.", "Quando attivi l'SOS, la tua posizione precisa viene inviata ai motociclisti entro il raggio scelto. Chat privata istantanea con chi accetta. Tutto integrato, niente numeri da chiamare in panico.", "alert", "/sos", "Come funziona l'SOS")}
    ${feature("Contest foto", "Mostra la tua moto. Vinci visibilità.", "Concorsi fotografici settimanali con voto degli iscritti. Categorie tematiche, classifica live, profili in evidenza per i vincitori. Pubblica la foto del tuo ultimo giro e raccontala.", "camera", "/community", "Vedi i contest")}
    ${feature("Tracking GPS", "Registra ogni giro. Senza limiti.", "Tracker preciso con km, velocità media, G-force longitudinale e accelerazione. Storico privato, statistiche cumulative, e modalità Ghost se non vuoi essere visibile durante il giro.", "gps", "/about", "Leggi la mission")}
    ${feature("Matching biker", "Trova compagni di viaggio compatibili.", "Algoritmo basato su moto posseduta, stile di guida, zona, e gusti musicali (integrazione Last.fm opzionale). Più che un'app di incontri — un modo per non partire più da soli.", "heart", "/faq", "Domande frequenti")}
  </div>
</section>

<section class="cta-block">
  <h2>Provala adesso. <span style="color:var(--accent)">È gratis.</span></h2>
  <p>Scarica BikerLink e in un minuto sei dentro con tutta la community italiana.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica l'app</a></div>
</section>
`;
  return { meta, body };
}

// ── SOS ───────────────────────────────────────────────────────────────────────
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
  <h1>SOS <span class="accent">BIKER</span></h1>
  <p class="lead">Un tasto. La community ti trova. Pensato per le emergenze stradali reali: guasti, foratura, incidente lieve, quando il 112 non basta e serve un altro biker accanto.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/download">Scarica l'app</a>
    <a class="btn btn-outline" href="#how">Come funziona</a>
  </div>
</section>

<section id="how" class="section">
  <div class="section-inner">
    <span class="section-eyebrow">Procedura</span>
    <h2 class="section-title">Come si <span class="accent">attiva</span></h2>
    <div class="steps">
      <div class="step"><div><h3>Apri l'app</h3><p>L'SOS è sempre raggiungibile dalla home — un tap, niente menù nascosti.</p></div></div>
      <div class="step"><div><h3>Tocca SOS</h3><p>Scegli il motivo (guasto, incidente, panne tecnica) e il raggio di ricerca (5–50 km).</p></div></div>
      <div class="step"><div><h3>Conferma</h3><p>La posizione GPS precisa viene inviata ai biker online nel raggio scelto. Notifica push immediata.</p></div></div>
      <div class="step"><div><h3>Coordina</h3><p>Quando un biker accetta, si apre una chat privata. Concordate l'intervento direttamente in app.</p></div></div>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow">Garanzie</span>
    <h2 class="section-title">Privacy e <span class="accent">sicurezza</span></h2>
    <div class="grid grid-3">
      <article class="card"><div class="icon">${icon.lock}</div><h3>Solo su attivazione</h3><p>La posizione precisa viene condivisa esclusivamente quando attivi l'SOS — mai prima, mai in background silenzioso.</p></article>
      <article class="card"><div class="icon">${icon.shield}</div><h3>Raggio scelto da te</h3><p>Decidi tu chi può vedere la tua emergenza: 5, 10, 30 o 50 km. Solo i biker dentro il raggio ricevono la notifica.</p></article>
      <article class="card"><div class="icon">${icon.alert}</div><h3>Annullabile sempre</h3><p>Annulli quando vuoi. Lo storico SOS viene cancellato automaticamente dopo 6 mesi.</p></article>
    </div>
    <div style="margin-top:32px;padding:20px;background:var(--surface);border-left:3px solid var(--accent);border-radius:var(--radius)">
      <p style="color:var(--text2);font-size:14px"><strong style="color:var(--text)">Importante:</strong> BikerLink non sostituisce i servizi di emergenza ufficiali. In caso di pericolo per la vita, chiama sempre il <strong style="color:var(--text)">112</strong>. L'SOS Biker è uno strumento complementare per assistenza tra motociclisti.</p>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner prose">
    <h2>Perché esiste questa funzione</h2>
    <p>Capita a chiunque viaggi su due ruote: una catena che salta in una zona senza copertura del soccorso stradale, una caduta a bassa velocità con la moto ribaltata su un fianco, una panne elettrica al tramonto su una statale poco trafficata. In quei momenti il 112 è la chiamata giusta solo se c'è un'emergenza medica reale. Per tutto il resto serve un altro paio di braccia, e quasi sempre un altro motociclista è la persona giusta perché conosce la moto, sa cosa cercare, e ha già vissuto situazioni simili.</p>
    <p>Il pulsante SOS di BikerLink nasce esattamente per quello scenario intermedio: non un'emergenza sanitaria, ma una difficoltà tecnica o logistica in cui serve aiuto fisico in poco tempo. La rete locale di iscritti riceve la notifica solo se è online e dentro il raggio che hai scelto. Nessun dato viene memorizzato oltre il necessario per coordinare l'intervento.</p>
    <p>Tutti i dettagli su privacy, ritenzione dei dati e limitazioni sono nella <a href="/privacy">Privacy Policy</a> e nelle <a href="/faq">domande frequenti</a>. Per qualsiasi dubbio o segnalazione contattaci tramite la pagina <a href="/contact">contatti</a>.</p>
  </div>
</section>

<section class="cta-block">
  <h2>Non guidare più da solo.</h2>
  <p>Con BikerLink hai sempre qualcuno vicino — anche quando ti serve davvero.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica BikerLink</a></div>
</section>
`;
  return { meta, body };
}

// ── MOTOCLUB ──────────────────────────────────────────────────────────────────
export function buildMotoclub(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/motoclub",
    title: "MotoClub su BikerLink — Crea, gestisci, ride insieme",
    description:
      "I MotoClub di BikerLink: crea un club, invita i tuoi compagni con codici, gestisci approvazioni e usa la chat di gruppo dedicata. Pensato per veri equipaggi.",
    jsonld: breadcrumbsJsonLd(baseUrl, [
      { name: "Home", path: "/" },
      { name: "MotoClub", path: "/motoclub" },
    ]),
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; MotoClub</div>
  <h1>MOTO<span class="accent">CLUB</span></h1>
  <p class="lead">Il tuo equipaggio merita più di una chat WhatsApp. MotoClub è il sistema completo per gestire un club moto: identità, governance, chat dedicata.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/download">Inizia adesso</a>
    <a class="btn btn-outline" href="#how">Come funziona</a>
  </div>
</section>

<section id="how" class="section">
  <div class="section-inner">
    <span class="section-eyebrow">In pratica</span>
    <h2 class="section-title">Tre modi di <span class="accent">stare insieme</span></h2>
    <div class="grid grid-3">
      <article class="card"><div class="icon">${icon.users}</div><h3>Crea il tuo club</h3><p>Nome, logo, descrizione, area geografica. Definisci se è aperto a tutti, su invito, o se richiede approvazione admin.</p><div class="meta">Founder = admin</div></article>
      <article class="card"><div class="icon">${icon.zap}</div><h3>Invita con un codice</h3><p>Genera codici invito a uso singolo o multiplo. Condividili nei tuoi canali e i nuovi membri entrano in un tap.</p><div class="meta">Auto-join opzionale</div></article>
      <article class="card"><div class="icon">${icon.message}</div><h3>Chat di gruppo dedicata</h3><p>Ogni club ha la sua chat. Hashtag per filtrare argomenti (#giro #meccanica #eventi), notifiche push solo per i membri.</p><div class="meta">Moderata</div></article>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow">Per chi è</span>
    <h2 class="section-title">Tre <span class="accent">esempi</span> reali</h2>
    <div class="grid grid-3">
      <article class="card"><h3>Equipaggi locali</h3><p>10–30 biker della stessa zona che organizzano giri ogni domenica. Chat dedicata, eventi, niente rumore da gruppo Telegram da 800 persone.</p></article>
      <article class="card"><h3>Club di brand</h3><p>Owners di una specifica moto (Ducati Multistrada, BMW GS, KTM Adventure…) che vogliono parlare di setup, mod, raduni di brand.</p></article>
      <article class="card"><h3>Community tematiche</h3><p>Donne in moto, viaggi off-road, café racer, sport touring. Crea il club che cercavi e non esisteva ancora.</p></article>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow">Governance</span>
    <h2 class="section-title">Strumenti per <span class="accent">admin</span></h2>
    <table class="kv" aria-label="Strumenti admin MotoClub">
      <tr><th>Approvazioni</th><td>Coda richieste di adesione con accept/reject. Notifica push agli admin.</td></tr>
      <tr><th>Ruoli</th><td>Founder, admin co-gestori, membro. Trasferimento di ownership disponibile.</td></tr>
      <tr><th>Codici invito</th><td>Multipli, a scadenza, riutilizzabili o one-shot. Tracking di chi ha usato cosa.</td></tr>
      <tr><th>Moderazione chat</th><td>Mute, ban temporaneo, segnalazioni. Log azioni admin tracciato.</td></tr>
      <tr><th>Eventi</th><td>Pianificazione giri/eventi del club, RSVP, condivisione percorso GPX.</td></tr>
    </table>
  </div>
</section>

<section class="cta-block">
  <h2>Costruisci il tuo <span style="color:var(--accent)">equipaggio</span>.</h2>
  <p>BikerLink ti dà gli strumenti. La community la fai tu.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica e crea il tuo club</a></div>
</section>
`;
  return { meta, body };
}

// ── COMMUNITY ─────────────────────────────────────────────────────────────────
export function buildCommunity(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/community",
    title: "Community BikerLink — Mappa mondiale biker, contest, eventi",
    description:
      "La community BikerLink raccoglie motociclisti da tutto il mondo. Mappa interattiva degli iscritti, contest fotografici settimanali, eventi, chat e profili.",
    jsonld: breadcrumbsJsonLd(baseUrl, [
      { name: "Home", path: "/" },
      { name: "Community", path: "/community" },
    ]),
    headExtras: `<link rel="preconnect" href="https://unpkg.com" crossorigin />
<link rel="preconnect" href="https://basemaps.cartocdn.com" crossorigin />`,
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Community</div>
  <h1>COMMU<span class="accent">NITY</span></h1>
  <p class="lead">Riders da tutta Italia (e oltre). Mostriamo dove sono, cosa fanno, e perché vale la pena unirsi. Una rete pensata per chi vive la strada in moto e cerca persone vere con cui condividerla.</p>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow">Mappa globale</span>
    <h2 class="section-title">Dove sono i nostri <span class="accent">biker</span></h2>
    <p class="section-lead">Distribuzione aggregata degli iscritti per paese. Aggiornata ogni 5 minuti. Nessun dato personale visibile — solo il conteggio.</p>
    <div id="world-map" role="img" aria-label="Mappa mondiale degli iscritti BikerLink per paese"></div>
    <div class="map-legend">
      <span><span class="dot"></span>Concentrazione biker (cerchio proporzionale al numero)</span>
    </div>
    <noscript><p style="margin-top:16px;color:var(--text3);font-size:13px">La mappa interattiva richiede JavaScript abilitato.</p></noscript>
  </div>
</section>

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow">Cosa succede</span>
    <h2 class="section-title">La community è <span class="accent">viva</span></h2>
    <div class="grid grid-3">
      <article class="card"><div class="icon">${icon.camera}</div><h3>Contest fotografici</h3><p>Ogni settimana un tema: giro più tortuoso, alba in moto, ritratto biker. Vota le foto degli altri, pubblica le tue.</p></article>
      <article class="card"><div class="icon">${icon.users}</div><h3>Eventi e raduni</h3><p>Sezione eventi con calendario, geolocalizzazione, RSVP. Organizza il tuo raduno o partecipa a quelli vicini.</p></article>
      <article class="card"><div class="icon">${icon.message}</div><h3>Chat sempre attive</h3><p>Chat private 1-to-1, chat di gruppo MotoClub, condivisione GPS volontaria in chat per ritrovarsi durante un giro.</p></article>
      <article class="card"><div class="icon">${icon.bike}</div><h3>Garage condiviso</h3><p>Mostra la tua moto. Storia, modifiche, foto. Connettiti con chi ha lo stesso modello.</p></article>
      <article class="card"><div class="icon">${icon.heart}</div><h3>Profili veri</h3><p>Nickname, bio, anno di nascita, regione. Foto profilo soggetta ad approvazione: niente bot, niente fake.</p></article>
      <article class="card"><div class="icon">${icon.shield}</div><h3>Moderazione attiva</h3><p>Segnalazioni con risposta entro 24h. Block list e mute personali sempre disponibili.</p></article>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner prose">
    <h2>Una rete che cresce, ogni settimana</h2>
    <p>BikerLink è una piattaforma in continua espansione. Ogni mese si registrano centinaia di nuovi utenti, prevalentemente dall'Italia ma anche da Francia, Spagna, Germania, Stati Uniti e Sud America. Non è un numero buttato lì: il backend traccia gli iscritti aggregati per paese e li mostra sulla mappa qui sopra in modo trasparente, senza esporre dati personali.</p>
    <p>L'obiettivo non è massimizzare il numero di account, ma costruire una rete attiva e di qualità. Per questo ogni profilo viene controllato in fase di approvazione foto, ogni richiesta di adesione a un club passa dagli admin, e ogni segnalazione viene letta entro 24 ore. È un equilibrio fragile, e funziona solo se chi entra rispetta le regole di base: rispetto reciproco, niente spam, niente contenuti illegali.</p>
    <p>Se vuoi capire come è nata BikerLink, chi la sviluppa e quali sono i principi guida, leggi la pagina <a href="/about">chi siamo</a>. Se invece hai dubbi pratici (privacy, costi, eliminazione account), trovi tutte le risposte nelle <a href="/faq">domande frequenti</a>.</p>
  </div>
</section>

<section class="cta-block">
  <h2>Unisciti.</h2>
  <p>Oltre 5.000 iscritti italiani sono già dentro. Tocca a te.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica BikerLink</a></div>
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

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
export function buildDownload(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/download",
    title: "Scarica BikerLink — Android, iOS (in arrivo), APK diretto",
    description:
      "Scarica BikerLink per Android dal Google Play, prova l'APK diretto, o scansiona il QR code con Expo Go. Versione iOS in arrivo.",
    jsonld: breadcrumbsJsonLd(baseUrl, [
      { name: "Home", path: "/" },
      { name: "Download", path: "/download" },
    ]),
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Download</div>
  <h1>SCARICA <span class="accent">BIKERLINK</span></h1>
  <p class="lead">Disponibile su Android. iOS in arrivo. Scegli il canale che preferisci — sono tutti la stessa app, firmati dallo stesso certificato e con gli stessi dati account.</p>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow">Canali ufficiali</span>
    <h2 class="section-title">Tre modi per <span class="accent">iniziare</span></h2>
    <p class="section-lead">Tutti i canali pubblicano la stessa versione dell'app. Scegli in base al tuo dispositivo, alla disponibilità del Play Store nel tuo paese, o al tuo flusso di lavoro abituale. Gli aggiornamenti arrivano sempre, indipendentemente dal canale scelto.</p>
    <div class="grid grid-3">
      <article class="card">
        <div class="icon">${icon.download}</div>
        <h3>Google Play</h3>
        <p>Canale ufficiale per Android. Aggiornamenti automatici, recensioni, supporto Google.</p>
        <div style="margin-top:16px"><a class="btn btn-primary" href="/api/download/play" rel="noopener">Apri Google Play</a></div>
        <div class="meta">Android 8+ · ~25 MB</div>
      </article>
      <article class="card">
        <div class="icon">${icon.zap}</div>
        <h3>APK diretto</h3>
        <p>Se preferisci installare manualmente o sei in un paese senza Google Play. L'APK è firmato dallo stesso certificato del Play Store.</p>
        <div style="margin-top:16px"><a class="btn btn-outline" href="/api/download/apk/latest" rel="noopener">Scarica APK</a></div>
        <div class="meta">Aggiornato manualmente</div>
      </article>
      <article class="card">
        <div class="icon">${icon.bike}</div>
        <h3>iOS</h3>
        <p>La versione iOS è in beta interna. Iscriviti alla newsletter per essere avvisato al lancio sull'App Store.</p>
        <div style="margin-top:16px"><a class="btn btn-outline" href="mailto:bikerlinkapp@gmail.com?subject=BikerLink%20iOS%20beta">Avvisami</a></div>
        <div class="meta">Q3 2026 (stimato)</div>
      </article>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow">Per chi sviluppa</span>
    <h2 class="section-title">Prova con <span class="accent">Expo Go</span></h2>
    <p class="section-lead">Se hai l'app Expo Go installata, puoi caricare BikerLink scansionando il QR generato dall'editor Replit, oppure inserendo l'URL del progetto. Modalità development-only — usa il Play Store per l'uso quotidiano.</p>
    <div class="steps">
      <div class="step"><div><h3>Installa Expo Go</h3><p>Disponibile gratis su Google Play e App Store.</p></div></div>
      <div class="step"><div><h3>Apri Expo Go</h3><p>Tocca "Scan QR code" dall'home.</p></div></div>
      <div class="step"><div><h3>Punta al QR del progetto</h3><p>Il QR si trova nella barra URL del progetto Replit. BikerLink si carica in 10–20 secondi.</p></div></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow">Requisiti</span>
    <h2 class="section-title">Cosa ti <span class="accent">serve</span></h2>
    <table class="kv" aria-label="Requisiti tecnici BikerLink">
      <tr><th>Android</th><td>Versione 8.0 (Oreo) o superiore. Servizi Google Play attivi. Spazio richiesto: circa 25 MB.</td></tr>
      <tr><th>iOS</th><td>iOS 15 o superiore (in beta interna). Lancio App Store stimato per Q3 2026.</td></tr>
      <tr><th>Permessi</th><td>Posizione (per mappa live e SOS), notifiche push (per chat ed eventi), fotocamera (opzionale, per contest). Tutti rifiutabili in qualsiasi momento dalle impostazioni di sistema.</td></tr>
      <tr><th>Connessione</th><td>4G/5G o Wi-Fi. La mappa funziona anche con segnale debole grazie al caching delle tile.</td></tr>
      <tr><th>Costi</th><td>Zero. Niente abbonamenti, niente trial, niente vendita di dati per finanziarsi.</td></tr>
    </table>
  </div>
</section>

<section class="cta-block">
  <h2>Tutto qui. <span style="color:var(--accent)">Buon ride.</span></h2>
  <p>Per qualsiasi problema con il download scrivici a <a href="mailto:bikerlinkapp@gmail.com">bikerlinkapp@gmail.com</a> oppure visita la pagina <a href="/contact">contatti</a>.</p>
</section>
`;
  return { meta, body };
}

// ── ABOUT ─────────────────────────────────────────────────────────────────────
export function buildAbout(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/about",
    title: "Chi siamo — BikerLink, app italiana per motociclisti",
    description:
      "BikerLink nasce da motociclisti, per motociclisti. La nostra storia, la mission, il team e come contattarci. Made in Italy, gratis, in continua evoluzione.",
    jsonld: [
      organizationJsonLd(baseUrl),
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "About", path: "/about" },
      ]),
    ],
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; About</div>
  <h1>CHI <span class="accent">SIAMO</span></h1>
  <p class="lead">BikerLink è nato in Italia, costruito da motociclisti, per motociclisti. Senza fondi, senza fretta, ma con un piano chiaro.</p>
</section>

<section class="section">
  <div class="section-inner prose">
    <h2>La storia</h2>
    <p>BikerLink nasce nel 2025 da una frustrazione semplice: nessuna app social verticale per chi guida una moto. Forum vecchi, gruppi WhatsApp dispersivi, Strava troppo orientata al ciclismo, Waze inutile per il pillion. Mancava un posto dove i biker — italiani e non — potessero trovarsi, organizzarsi, aiutarsi.</p>
    <p>Abbiamo iniziato con la mappa live: vedere chi è online vicino a te, in tempo reale, è già più di quanto offrisse il mercato. Poi sono arrivati i MotoClub, la chat, il sistema di matching, e infine l'SOS — la feature che ci ha convinto che stavamo costruendo qualcosa di utile davvero.</p>

    <h2>La mission</h2>
    <p>Costruire la piattaforma verticale di riferimento per i motociclisti in Europa. <strong>Gratis nelle fasi iniziali, sempre senza pubblicità invasive, sempre con la privacy come priorità.</strong> Il revenue model — quando arriverà — sarà basato su partnership verticali (officine, brand moto) e feature premium opzionali, mai sulla vendita di dati personali.</p>

    <h2>Team</h2>
    <p>BikerLink è un progetto indipendente. Fondato e mantenuto da uno sviluppatore italiano motociclista. Il codice è scritto interamente in casa: backend Express + TypeScript, app React Native con Expo, database PostgreSQL su Neon. La community ci aiuta con feedback, segnalazioni e testing — e per ora basta.</p>
    <p>Se ti interessa contribuire (sviluppo, design, traduzioni, moderazione, partnership) scrivici. Cerchiamo persone, non CV.</p>

    <h2>Principi</h2>
    <ul>
      <li><strong>Privacy by design.</strong> Ghost Mode, fuzzing GPS, Fake Home, posizione condivisa solo quando attivamente scelto.</li>
      <li><strong>Gratis sul serio.</strong> Niente paywall, niente trial, niente "premium" che limita features di base.</li>
      <li><strong>Italian-first.</strong> Sviluppato in Italia, ottimizzato per le strade e la community italiana — anche se aperto a tutti.</li>
      <li><strong>No ads invasive.</strong> Mai banner che coprono la mappa, mai pop-up, mai video forzati.</li>
      <li><strong>Open feedback.</strong> Ogni utente può scrivere direttamente, e leggiamo tutto.</li>
    </ul>

    <h2>Contatti</h2>
    <p>Per qualsiasi cosa — bug, partnership, stampa, investimenti — scrivici a <a href="mailto:bikerlinkapp@gmail.com">bikerlinkapp@gmail.com</a>. Rispondiamo in 48h max.</p>
    <p>Per gli investitori c'è una pagina dedicata: <a href="/investors">/investors</a>.</p>
  </div>
</section>

<section class="cta-block">
  <h2>Una <span style="color:var(--accent)">community</span> vera.</h2>
  <p>Scarica BikerLink, prova le funzioni, e dicci cosa pensi.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica l'app</a><a class="btn btn-outline" href="/faq">Hai domande?</a></div>
</section>
`;
  return { meta, body };
}

// ── CONTACT ───────────────────────────────────────────────────────────────────
export function buildContact(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/contact",
    title: "Contatti BikerLink — supporto, partnership, stampa",
    description:
      "Contatti BikerLink: email diretta a supporto e partnership, tempi di risposta, sezioni dedicate per investitori e media. Rispondiamo entro 48 ore lavorative.",
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Contatti", path: "/contact" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "ContactPage",
        name: "Contatti BikerLink",
        url: `${baseUrl}/contact`,
      },
    ],
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Contatti</div>
  <h1>CONT<span class="accent">ATTI</span></h1>
  <p class="lead">Per qualsiasi cosa — supporto, partnership, stampa, investimenti — siamo a un'email di distanza. Rispondiamo in 48 ore lavorative.</p>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow">Canali</span>
    <h2 class="section-title">Come <span class="accent">raggiungerci</span></h2>
    <div class="grid grid-3">
      <article class="card">
        <h3>Supporto utenti</h3>
        <p>Bug, problemi di accesso, segnalazioni di altri utenti, eliminazione account. Indica nell'oggetto "Supporto" per una risposta più rapida.</p>
        <p style="margin-top:12px"><a class="btn btn-outline" href="mailto:bikerlinkapp@gmail.com?subject=Supporto">Scrivi al supporto</a></p>
      </article>
      <article class="card">
        <h3>Partnership e brand</h3>
        <p>Sei un'officina, una concessionaria, un brand moto o organizzi raduni? Scrivici per esplorare collaborazioni verticali e visibilità nella nostra rete.</p>
        <p style="margin-top:12px"><a class="btn btn-outline" href="mailto:bikerlinkapp@gmail.com?subject=Partnership">Proponi una partnership</a></p>
      </article>
      <article class="card">
        <h3>Stampa e media</h3>
        <p>Press kit, interviste, dati di crescita aggregati, materiale visivo per articoli. Risposta entro 24 ore per i giornalisti con scadenza editoriale.</p>
        <p style="margin-top:12px"><a class="btn btn-outline" href="mailto:bikerlinkapp@gmail.com?subject=Press">Richieste stampa</a></p>
      </article>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner prose">
    <h2>Informazioni utili prima di scriverci</h2>
    <p>Molte risposte sono già pubblicate. Prima di mandare un'email, prova a controllare:</p>
    <ul>
      <li><strong>Domande frequenti</strong> — privacy, gratuità, SOS, MotoClub, account: vai alla <a href="/faq">pagina FAQ</a>.</li>
      <li><strong>Privacy Policy</strong> — quali dati raccogliamo, dove finiscono, come cancellarli: leggi la <a href="/privacy">privacy policy</a>.</li>
      <li><strong>Termini di servizio</strong> — regole di comportamento, responsabilità, account: <a href="/terms">termini</a>.</li>
      <li><strong>Eliminazione account</strong> — puoi farlo direttamente dall'app o dalla <a href="/delete-account">pagina dedicata</a>.</li>
      <li><strong>Investitori</strong> — metriche, modello di business, contatti dedicati: <a href="/investors">pagina investitori</a>.</li>
    </ul>

    <h2>Tempi di risposta</h2>
    <p>Le richieste di <strong>supporto utenti</strong> hanno priorità: rispondiamo entro 48 ore lavorative, spesso prima. Le richieste di <strong>partnership</strong> e <strong>investimento</strong> possono richiedere fino a 5 giorni lavorativi per una risposta sostanziale. Le richieste di <strong>stampa</strong> con scadenza editoriale chiara vengono gestite entro 24 ore.</p>
    <p>Se non ricevi risposta entro i tempi indicati, controlla la cartella spam e rimandaci il messaggio.</p>

    <h2>Email principale</h2>
    <p>Per qualunque cosa: <a href="mailto:bikerlinkapp@gmail.com"><strong>bikerlinkapp@gmail.com</strong></a></p>
  </div>
</section>

<section class="cta-block">
  <h2>Prima di scriverci, <span style="color:var(--accent)">prova l'app.</span></h2>
  <p>Spesso la risposta è dentro BikerLink stessa. È gratis, bastano 60 secondi.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica BikerLink</a></div>
</section>
`;
  return { meta, body };
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "BikerLink è davvero gratis?",
    a: "Sì. Niente paywall, niente trial, niente abbonamenti obbligatori. Le feature core (mappa, MotoClub, chat, SOS, contest) sono e resteranno gratuite. In futuro potranno arrivare feature premium opzionali, ma mai limitando l'esperienza di base.",
  },
  {
    q: "Vendete i miei dati a terzi?",
    a: "No. Non vendiamo dati personali, non condividiamo identità o posizioni con inserzionisti, non facciamo profilazione pubblicitaria. Trovi tutti i dettagli nella Privacy Policy: quali dati raccogliamo, perché, e per quanto tempo.",
  },
  {
    q: "Il GPS è sempre attivo? Consuma batteria?",
    a: "Il GPS si attiva solo quando apri l'app o quando attivi tracking/SOS. Niente raccolta in background silenziosa. Puoi disattivare la visibilità in qualsiasi momento con Ghost Mode, o falsare la tua posizione con Position Fuzzing e Fake Home.",
  },
  {
    q: "Come funziona l'SOS Biker?",
    a: "Premi il tasto SOS, scegli motivo e raggio (5–50 km), conferma. La tua posizione viene inviata ai biker online dentro il raggio. Quando uno accetta, si apre una chat privata. L'SOS non sostituisce il 112 — è uno strumento complementare per assistenza tra motociclisti.",
  },
  {
    q: "Posso creare un MotoClub privato?",
    a: "Sì. Quando crei il club scegli se è aperto, su invito, o ad approvazione manuale. Puoi generare codici invito personalizzati e gestire le richieste dal pannello admin. Ogni club ha la sua chat di gruppo dedicata.",
  },
  {
    q: "C'è la versione iOS?",
    a: "L'app iOS è in beta interna e arriverà sull'App Store nei prossimi mesi. Nel frattempo puoi provarla via Expo Go scansionando il QR del progetto. Iscriviti alla newsletter per essere avvisato al lancio ufficiale.",
  },
  {
    q: "Come segnalo un utente o un contenuto inappropriato?",
    a: "Tieni premuto sul messaggio o sul profilo e tocca 'Segnala'. La segnalazione arriva ai moderatori che rispondono entro 24h. Puoi anche bloccare o silenziare un utente in modo autonomo dal suo profilo.",
  },
  {
    q: "Posso eliminare il mio account?",
    a: "Sì, in qualsiasi momento. Dall'app: Profilo → Modifica profilo → Elimina account. In alternativa scrivi a bikerlinkapp@gmail.com. I dati vengono eliminati entro 30 giorni (esclusi i log che dobbiamo conservare per obblighi di legge).",
  },
  {
    q: "Funziona fuori dall'Italia?",
    a: "Sì, l'app è disponibile in tutto il mondo. La community più attiva è italiana (siamo nati qui), ma utenti europei e nordafricani stanno crescendo. Le mappe e il routing curvy funzionano in tutta Europa.",
  },
  {
    q: "Posso contattarvi per una partnership o per i media?",
    a: "Certo. Scrivici a bikerlinkapp@gmail.com indicando 'Partnership' o 'Press' nell'oggetto. Per gli investitori c'è una pagina dedicata su /investors con metriche, modello di business e contatti.",
  },
];

export function buildFaq(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/faq",
    title: "FAQ BikerLink — Privacy, gratuità, account, supporto",
    description:
      "Domande frequenti su BikerLink: gratuità reale, privacy GPS, funzionamento SOS, MotoClub, eliminazione account, supporto. Tutte le risposte in una pagina.",
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "FAQ", path: "/faq" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQ_ITEMS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; FAQ</div>
  <h1>DOMANDE <span class="accent">FREQUENTI</span></h1>
  <p class="lead">Tutte le risposte alle domande più comuni. Se non trovi quella che cerchi, scrivici a <a href="mailto:bikerlinkapp@gmail.com">bikerlinkapp@gmail.com</a>.</p>
</section>

<section class="section">
  <div class="section-inner faq">
    ${FAQ_ITEMS.map(
      (f) =>
        `<details><summary>${f.q}</summary><div class="answer">${f.a}</div></details>`,
    ).join("\n")}
  </div>
</section>

<section class="cta-block">
  <h2>Tutto chiaro?</h2>
  <p>Scarica BikerLink e prova tu stesso. È gratis, e bastano 60 secondi.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download">Scarica l'app</a></div>
</section>
`;
  return { meta, body };
}
