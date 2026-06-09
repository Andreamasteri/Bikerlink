import {
  type PageMeta,
  organizationJsonLd,
  breadcrumbsJsonLd,
} from "./render";
import { COMP_SECTION } from "./pages-shared";

export function buildAbout(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/about",
    title: "Chi siamo — La missione di BikerLink",
    description:
      "La storia di BikerLink: chi siamo, perché abbiamo costruito l'app social per motociclisti, la nostra mission e i nostri principi.",
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
  <h1 data-i18n-html="about.hero.h1">CHI <span class="accent">SIAMO</span></h1>
  <p class="lead" data-i18n="about.hero.lead">BikerLink è nato in Italia, costruito da motociclisti, per motociclisti. Senza fondi, senza fretta, ma con un piano chiaro.</p>
</section>

<section class="section">
  <div class="section-inner prose">
    <h2 data-i18n="about.story.title">La storia</h2>
    <p data-i18n="about.story.p1">BikerLink nasce nel 2025 da una frustrazione semplice: nessuna app social verticale per chi guida una moto. Forum vecchi, gruppi WhatsApp dispersivi, Strava troppo orientata al ciclismo, Waze inutile per il pillion. Mancava un posto dove i biker — italiani e non — potessero trovarsi, organizzarsi, aiutarsi.</p>
    <p data-i18n="about.story.p2">Abbiamo iniziato con la mappa live: vedere chi è online vicino a te, in tempo reale, è già più di quanto offrisse il mercato. Poi sono arrivati i MotoClub, la chat, il sistema di matching, e infine l'SOS — la feature che ci ha convinto che stavamo costruendo qualcosa di utile davvero.</p>

    <h2 data-i18n="about.mission.title">La mission</h2>
    <p data-i18n-html="about.mission.p1">Costruire la piattaforma verticale di riferimento per i motociclisti in Europa. <strong>Gratis nelle fasi iniziali, sempre senza pubblicità invasive, sempre con la privacy come priorità.</strong> Il revenue model — quando arriverà — sarà basato su partnership verticali (officine, brand moto) e feature premium opzionali, mai sulla vendita di dati personali.</p>

    <h2 data-i18n="about.team.title">Team</h2>
    <p data-i18n="about.team.p1">BikerLink è un progetto indipendente. Fondato e mantenuto da uno sviluppatore italiano motociclista. Il codice è scritto interamente in casa: backend Express + TypeScript, app React Native con Expo, database PostgreSQL su Neon. La community ci aiuta con feedback, segnalazioni e testing — e per ora basta.</p>
    <p data-i18n="about.team.p2">Se ti interessa contribuire (sviluppo, design, traduzioni, moderazione, partnership) scrivici. Cerchiamo persone, non CV.</p>

    <h2 data-i18n="about.principles.title">Principi</h2>
    <ul>
      <li data-i18n-html="about.principles.li1"><strong>Privacy by design.</strong> Ghost Mode, fuzzing GPS, Fake Home, posizione condivisa solo quando attivamente scelto.</li>
      <li data-i18n-html="about.principles.li2"><strong>Gratis sul serio.</strong> Niente paywall, niente trial, niente "premium" che limita features di base.</li>
      <li data-i18n-html="about.principles.li3"><strong>Italian-first.</strong> Sviluppato in Italia, ottimizzato per le strade e la community italiana — anche se aperto a tutti.</li>
      <li data-i18n-html="about.principles.li4"><strong>No ads invasive.</strong> Mai banner che coprono la mappa, mai pop-up, mai video forzati.</li>
      <li data-i18n-html="about.principles.li5"><strong>Open feedback.</strong> Ogni utente può scrivere direttamente, e leggiamo tutto.</li>
    </ul>

    <h2 data-i18n="about.contacts.title">Contatti</h2>
    <p data-i18n-html="about.contacts.p1">Per qualsiasi cosa — bug, partnership, stampa, investimenti — scrivici a <a href="mailto:bikerlinkapp@gmail.com">bikerlinkapp@gmail.com</a>. Rispondiamo in 48h max.</p>
    <p data-i18n-html="about.contacts.p2">Per gli investitori c'è una pagina dedicata: <a href="/matching/per-investitori">metriche per investitori</a>.</p>
  </div>
</section>

${COMP_SECTION}

<section class="cta-block">
  <h2 data-i18n="about.cta.title">Una <span style="color:var(--accent)">community</span> vera.</h2>
  <p data-i18n="about.cta.desc">Scarica BikerLink, prova le funzioni, e dicci cosa pensi.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download" data-i18n="about.cta.btn1">Scarica l'app</a><a class="btn btn-outline" href="/faq" data-i18n="about.cta.btn2">Hai domande?</a></div>
</section>
`;
  return { meta, body };
}

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
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <span data-i18n="contact.hero.breadcrumb">Contatti</span></div>
  <h1 data-i18n-html="contact.hero.h1">CONT<span class="accent">ATTI</span></h1>
  <p class="lead" data-i18n="contact.hero.lead">Per qualsiasi cosa — supporto, partnership, stampa, investimenti — siamo a un'email di distanza. Rispondiamo in 48 ore lavorative.</p>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="contact.channels.eyebrow">Canali</span>
    <h2 class="section-title" data-i18n="contact.channels.title">Come <span class="accent">raggiungerci</span></h2>
    <div class="grid grid-3">
      <article class="card">
        <h3 data-i18n="contact.channels.card1.title">Supporto utenti</h3>
        <p data-i18n="contact.channels.card1.desc">Bug, problemi di accesso, segnalazioni di altri utenti, eliminazione account. Indica nell'oggetto "Supporto" per una risposta più rapida.</p>
        <p style="margin-top:12px"><a class="btn btn-outline" href="mailto:bikerlinkapp@gmail.com?subject=Supporto" data-i18n="contact.channels.card1.btn">Scrivi al supporto</a></p>
      </article>
      <article class="card">
        <h3 data-i18n="contact.channels.card2.title">Partnership e brand</h3>
        <p data-i18n="contact.channels.card2.desc">Sei un'officina, una concessionaria, un brand moto o organizzi raduni? Scrivici per esplorare collaborazioni verticali e visibilità nella nostra rete.</p>
        <p style="margin-top:12px"><a class="btn btn-outline" href="mailto:bikerlinkapp@gmail.com?subject=Partnership" data-i18n="contact.channels.card2.btn">Proponi una partnership</a></p>
      </article>
      <article class="card">
        <h3 data-i18n="contact.channels.card3.title">Stampa e media</h3>
        <p data-i18n="contact.channels.card3.desc">Press kit, interviste, dati di crescita aggregati, materiale visivo per articoli. Risposta entro 24 ore per i giornalisti con scadenza editoriale.</p>
        <p style="margin-top:12px"><a class="btn btn-outline" href="mailto:bikerlinkapp@gmail.com?subject=Press" data-i18n="contact.channels.card3.btn">Richieste stampa</a></p>
      </article>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner prose">
    <h2 data-i18n="contact.info.title">Informazioni utili prima di scriverci</h2>
    <p data-i18n="contact.info.p1">Molte risposte sono già pubblicate. Prima di mandare un'email, prova a controllare:</p>
    <ul>
      <li data-i18n-html="contact.info.li1"><strong>Domande frequenti</strong> — privacy, gratuità, SOS, MotoClub, account: vai alla <a href="/faq">pagina FAQ</a>.</li>
      <li data-i18n-html="contact.info.li2"><strong>Privacy Policy</strong> — quali dati raccogliamo, dove finiscono, come cancellarli: leggi la <a href="/privacy">privacy policy</a>.</li>
      <li data-i18n-html="contact.info.li3"><strong>Termini di servizio</strong> — regole di comportamento, responsabilità, account: <a href="/terms">termini</a>.</li>
      <li data-i18n-html="contact.info.li4"><strong>Eliminazione account</strong> — puoi farlo direttamente dall'app o dalla <a href="/delete-account">pagina dedicata</a>.</li>
      <li data-i18n-html="contact.info.li5"><strong>Investitori</strong> — metriche, modello di business, contatti dedicati: <a href="/matching/per-investitori">metriche per investitori</a>.</li>
    </ul>

    <h2 data-i18n="contact.response.title">Tempi di risposta</h2>
    <p data-i18n-html="contact.response.p1">Le richieste di <strong>supporto utenti</strong> hanno priorità: rispondiamo entro 48 ore lavorative, spesso prima. Le richieste di <strong>partnership</strong> e <strong>investimento</strong> possono richiedere fino a 5 giorni lavorativi per una risposta sostanziale. Le richieste di <strong>stampa</strong> con scadenza editoriale chiara vengono gestite entro 24 ore.</p>
    <p data-i18n="contact.response.p2">Se non ricevi risposta entro i tempi indicati, controlla la cartella spam e rimandaci il messaggio.</p>

    <h2 data-i18n="contact.email.title">Email principale</h2>
    <p data-i18n-html="contact.email.p1">Per qualunque cosa: <a href="mailto:bikerlinkapp@gmail.com"><strong>bikerlinkapp@gmail.com</strong></a></p>
  </div>
</section>

<section class="cta-block">
  <h2 data-i18n="contact.cta.title">Prima di scriverci, <span style="color:var(--accent)">prova l'app.</span></h2>
  <p data-i18n="contact.cta.desc">Spesso la risposta è dentro BikerLink stessa. È gratis, bastano 60 secondi.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download" data-i18n="contact.cta.btn">Scarica BikerLink</a></div>
</section>
`;
  return { meta, body };
}
