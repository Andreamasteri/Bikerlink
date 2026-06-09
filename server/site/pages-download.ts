import {
  type PageMeta,
  breadcrumbsJsonLd,
} from "./render";
import { icon } from "./pages-shared";

export function buildDownload(
  baseUrl: string,
): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/download",
    title: "Scarica BikerLink — Android, iOS (in arrivo), APK diretto",
    description:
      "Scarica BikerLink per Android dal Google Play, prova l'APK diretto, o scansiona il QR code con Expo Go. Versione iOS in arrivo.",
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Download", path: "/download" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "MobileApplication",
        name: "BikerLink",
        description: "App per motociclisti italiani: mappa biker live, MotoClub, SOS emergenza, matching, tracking GPS e contest fotografici.",
        url: `${baseUrl}/download`,
        inLanguage: "it-IT",
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Android",
        downloadUrl: `${baseUrl}/api/download/play`,
        installUrl: `${baseUrl}/api/download/play`,
        softwareVersion: "latest",
        author: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "EUR",
          availability: "https://schema.org/InStock",
        },
        featureList: [
          "Mappa biker live con posizione degli utenti online",
          "MotoClub: crea e gestisci club moto",
          "SOS emergenza con allerta ai biker nel raggio scelto",
          "Matching biker basato su 17 segnali di affinità",
          "Tracking GPS con telemetria: km, velocità, lean angle, G-force",
          "Contest fotografici settimanali",
          "Aggiornamenti OTA automatici",
        ],
      },
    ],
  };
  const body = `
<section class="page-hero">
  <div class="breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; Download</div>
  <h1 data-i18n-html="download.hero.h1">SCARICA <span class="accent">BIKERLINK</span></h1>
  <p class="lead" data-i18n="download.hero.lead">Disponibile su Android. iOS in arrivo. Scegli il canale che preferisci — sono tutti la stessa app, firmati dallo stesso certificato e con gli stessi dati account.</p>
</section>

<section class="section">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="download.channels.eyebrow">Canali ufficiali</span>
    <h2 class="section-title" data-i18n="download.channels.title">Tre modi per <span class="accent">iniziare</span></h2>
    <p class="section-lead" data-i18n="download.channels.lead">Tutti i canali pubblicano la stessa versione dell'app. Scegli in base al tuo dispositivo, alla disponibilità del Play Store nel tuo paese, o al tuo flusso di lavoro abituale. Gli aggiornamenti arrivano sempre, indipendentemente dal canale scelto.</p>
    <div class="grid grid-3">
      <article class="card">
        <div class="icon">${icon.download}</div>
        <h3 data-i18n="download.channels.card1.title">Google Play</h3>
        <p data-i18n="download.channels.card1.desc">Canale ufficiale per Android. Aggiornamenti automatici, recensioni, supporto Google.</p>
        <div style="margin-top:16px"><a class="btn btn-primary" href="/api/download/play" rel="noopener" data-i18n="download.channels.card1.btn">Apri Google Play</a></div>
        <div class="meta" data-i18n="download.channels.card1.meta">Android 8+ · ~25 MB</div>
      </article>
      <article class="card">
        <div class="icon">${icon.zap}</div>
        <h3 data-i18n="download.channels.card2.title">APK diretto</h3>
        <p data-i18n="download.channels.card2.desc">Se preferisci installare manualmente o sei in un paese senza Google Play. L'APK è firmato dallo stesso certificato del Play Store.</p>
        <div style="margin-top:16px"><a class="btn btn-outline" href="/api/download/apk/latest" rel="noopener" data-i18n="download.channels.card2.btn">Scarica APK</a></div>
        <div class="meta" data-i18n="download.channels.card2.meta">Aggiornato manualmente</div>
      </article>
      <article class="card">
        <div class="icon">${icon.bike}</div>
        <h3 data-i18n="download.channels.card3.title">iOS</h3>
        <p data-i18n="download.channels.card3.desc">La versione iOS è in beta interna. Iscriviti alla newsletter per essere avvisato al lancio sull'App Store.</p>
        <div style="margin-top:16px"><a class="btn btn-outline disabled" href="#" data-i18n="download.channels.card3.btn">Prossimamente</a></div>
        <div class="meta" data-i18n="download.channels.card3.meta">App Store</div>
      </article>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="download.expo.eyebrow">Sviluppatori &amp; Beta</span>
    <h2 class="section-title" data-i18n="download.expo.title">Prova con <span class="accent">Expo Go</span></h2>
    <div class="grid grid-2">
      <div class="prose">
        <p data-i18n-html="download.expo.p1">BikerLink è costruita con Expo. Se sei uno sviluppatore o vuoi provare le ultimissime build prima del rilascio ufficiale, puoi caricarle direttamente tramite l'app Expo Go.</p>
        <ul>
          <li data-i18n-html="download.expo.li1">Installa <strong>Expo Go</strong> dal Play Store o App Store.</li>
          <li data-i18n="download.expo.li2">Inquadra il QR code a lato (o sotto su mobile).</li>
          <li data-i18n="download.expo.li3">L'app si caricherà istantaneamente sul tuo dispositivo.</li>
        </ul>
        <p style="margin-top:16px"><a class="btn btn-outline" href="https://expo.dev/client" target="_blank" rel="noopener" data-i18n="download.expo.btn">Cos'è Expo Go?</a></p>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;padding:20px;background:#fff;border-radius:var(--radius);border:1px solid var(--border)">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=exp%3A%2F%2Fexpo.dev%2F%40andreamasteri%2Fbikerlink%3Frelease-channel%3Ddefault" alt="QR Code per Expo Go" width="240" height="240" loading="lazy" />
      </div>
    </div>
  </div>
</section>

<section class="section">
  <div class="section-inner prose">
    <h2 data-i18n="download.security.title">Note sulla sicurezza</h2>
    <p data-i18n-html="download.security.p1">La sicurezza dei tuoi dati e del tuo dispositivo è la nostra priorità. Tutte le versioni di BikerLink — che provengano dal Play Store o dall'APK diretto — sono firmate crittograficamente con lo stesso certificato di rilascio. Questo garantisce che l'app non sia stata manomessa e permette di passare da un canale all'altro senza perdere i dati (basta installare sopra la versione esistente).</p>
    <p data-i18n="download.security.p2">Non scaricare BikerLink da siti di terze parti non autorizzati. Gli unici canali sicuri sono quelli elencati in questa pagina.</p>
    <p data-i18n-html="download.security.p3">Per maggiori informazioni su come gestiamo i tuoi dati, consulta la <a href="/privacy">Privacy Policy</a>. Se hai problemi con l'installazione, scrivi al supporto tramite la pagina <a href="/contact">contatti</a>.</p>
  </div>
</section>

<section class="cta-block">
  <h2 data-i18n="download.cta.title">Tutto pronto?</h2>
  <p data-i18n="download.cta.desc">Scarica BikerLink, crea il tuo profilo e connettiti con la community.</p>
  <div class="btn-row"><a class="btn btn-primary" href="/download" data-i18n="download.cta.btn">Vai al Google Play</a></div>
</section>
`;
  return { meta, body };
}
