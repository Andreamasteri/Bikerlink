import {
  type PageMeta,
  breadcrumbsJsonLd,
} from "./render";

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
    a: "Certo. Scrivici a bikerlinkapp@gmail.com indicando 'Partnership' o 'Press' nell'oggetto. Per gli investitori c'è una pagina dedicata su <a href='/matching/per-investitori'>metriche per investitori</a> con architettura tecnica, modello di business e contatti.",
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
