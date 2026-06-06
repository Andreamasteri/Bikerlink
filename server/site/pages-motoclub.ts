import {
  type PageMeta,
  breadcrumbsJsonLd,
} from "./render";
import { icon } from "./pages-shared";

export function buildMotoclub(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/motoclub",
    title: "MotoClub su BikerLink — Crea, gestisci, ride insieme",
    description:
      "I MotoClub di BikerLink: crea un club, invita i tuoi compagni con codici, gestisci approvazioni e usa la chat di gruppo dedicata. Pensato per veri equipaggi.",
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "MotoClub", path: "/motoclub" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "MotoClub su BikerLink — Crea, gestisci, ride insieme",
        description: "I MotoClub di BikerLink: crea un club, invita i tuoi compagni con codici, gestisci approvazioni e usa la chat di gruppo dedicata. Pensato per veri equipaggi.",
        url: `${baseUrl}/motoclub`,
        inLanguage: "it-IT",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntity: {
          "@type": "SoftwareApplication",
          name: "BikerLink MotoClub",
          applicationCategory: "SocialNetworkingApplication",
          operatingSystem: "Android, iOS",
          description: "Sistema completo per la gestione di club moto: creazione club, codici invito, pannello admin con approvazioni, ruoli, moderazione chat e pianificazione eventi.",
          featureList: [
            "Creazione club con nome, logo, descrizione e area geografica",
            "Codici invito a uso singolo, multiplo o a scadenza",
            "Approvazioni manuali o auto-join configurabili",
            "Chat di gruppo dedicata con hashtag e moderazione",
            "Ruoli: Founder, admin co-gestori, membro",
            "Pianificazione giri/eventi con RSVP e condivisione percorso GPX",
          ],
          offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
        },
      },
    ],
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
