import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingPrivacy(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/privacy",
    title: "Privacy del matching BikerLink — Cosa raccogliamo e cosa non facciamo",
    description: "Privacy del sistema di matching BikerLink: dati raccolti, nessuna vendita a terzi, nessuna profilazione pubblicitaria, come disattivare ogni tipo di segnale. GDPR compliant.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Privacy", path: "/matching/privacy" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Privacy del matching BikerLink",
        description: "Quali dati usa il matching di BikerLink, come vengono protetti e quali sono i tuoi diritti.",
        url: `${baseUrl}/matching/privacy`,
        inLanguage: "it-IT",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntityOfPage: `${baseUrl}/matching/privacy`,
      },
    ],
  };

  const body = `
${matchSubnav("/matching/privacy")}

<section class="match-hero" aria-labelledby="priv-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; Privacy</div>
  <div class="match-hero-eyebrow">Trasparenza</div>
  <h1 id="priv-h1">COSA SAPPIAMO<br/><span class="accent">DI TE</span><br/>E PERCHÉ</h1>
  <p class="lead">Nessuna sorpresa. Nessuna vendita. Ecco esattamente cosa raccogliamo per farti incontrare i biker giusti, cosa non facciamo mai, e come controllare tutto.</p>
</section>

<section class="section" aria-labelledby="collect-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Cosa raccogliamo</span>
    <h2 class="section-title" id="collect-h2">I dati che<br/><span class="accent">usiamo.</span></h2>
    <p class="section-lead">Raccogliamo solo ciò che serve per calcolare le affinità. Niente di più.</p>

    <ul class="match-privacy-list" aria-label="Dati raccolti">
      <li class="match-privacy-item"><span class="pi-icon">🏍️</span><div><strong>Moto e preferenze dichiarate</strong> — Brand, modello, stile di guida, tipo di uscite. Li fornisci tu esplicitamente nel profilo.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">📍</span><div><strong>GPS e percorsi</strong> — Solo se attivi il tracking. Registriamo le coordinate durante il giro e le usiamo per calcolare route affinity e zone di guida. Il GPS non è mai attivo in background senza consenso.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">📐</span><div><strong>Telemetria di guida</strong> — Lean angle e G-force dal giroscopio e accelerometro del telefono. Solo durante il tracking attivo.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">🎵</span><div><strong>Gusti musicali</strong> — Testo libero nel profilo. Usiamo AI per estrarne le affinità semantiche. Non colleghiamo il tuo Spotify o Last.fm senza consenso esplicito.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">👤</span><div><strong>Bio e interessi</strong> — Il testo libero che scrivi nel profilo. Viene elaborato con embeddings per trovare affinità concettuali.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">💬</span><div><strong>Segnali di feedback</strong> — Like, ignora, block. Non i contenuti delle conversazioni — solo le azioni di matching.</div></li>
      <li class="match-privacy-item"><span class="pi-icon">⏰</span><div><strong>Fasce orarie</strong> — Estratte dai timestamp dei giri. Solo se tracking attivo.</div></li>
    </ul>
  </div>
</section>

<section class="section alt" aria-labelledby="noncollect-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Cosa NON facciamo</span>
    <h2 class="section-title" id="noncollect-h2">Le nostre<br/><span class="accent">linee rosse.</span></h2>

    <ul class="match-privacy-list" aria-label="Cosa non facciamo mai">
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No vendita dati a terzi</strong> — I tuoi dati non vengono mai venduti o ceduti a inserzionisti, assicurazioni, case produttrici o chiunque altro. Mai.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No profilazione pubblicitaria</strong> — Non usiamo i dati di matching per mostrarti pubblicità. Il matching è per il matching — punto.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No condivisione identità</strong> — La tua posizione reale non viene mai condivisa con altri utenti senza il tuo consenso esplicito. Ghost Mode è sempre disponibile.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No raccolta in background</strong> — Il GPS non si attiva mai senza che tu apra l'app e attivi esplicitamente il tracking. Nessun tracciamento silenzioso.</div></li>
      <li class="match-privacy-item" style="border-color:rgba(255,59,48,.2)"><span class="pi-icon">🚫</span><div><strong>No AI autonoma su dati sensibili</strong> — Le decisioni che riguardano i tuoi dati personali vengono sempre supervisionate da operatori umani.</div></li>
    </ul>
  </div>
</section>

<section class="section" aria-labelledby="control-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Il tuo controllo</span>
    <h2 class="section-title" id="control-h2">Puoi disattivare<br/><span class="accent">tutto.</span></h2>
    <p class="section-lead">Ogni tipo di segnale ha un toggle. Puoi disattivarne uno, alcuni, o tutti — il sistema funziona comunque con i dati rimasti.</p>

    <div class="grid grid-2" style="margin-top:28px;gap:20px">
      ${[
        { icon: "📍", signal: "Tracking GPS", action: "Disattiva dalle impostazioni app — il GPS smette di raccogliere dati immediatamente" },
        { icon: "📐", signal: "Telemetria guida", action: "Toggle separato da GPS — puoi tracciare il percorso senza lean angle e G-force" },
        { icon: "🎵", signal: "Musica nel matching", action: "Rimuovi i gusti musicali dal profilo — il segnale musica viene ignorato" },
        { icon: "👤", signal: "Bio nel matching", action: "Cancella la bio o attiva il toggle \"escludi bio dal matching\" nelle impostazioni" },
        { icon: "👁️", signal: "Visibilità sulla mappa", action: "Ghost Mode — sei online ma invisibile agli altri. Puoi ancora vedere e fare matching" },
        { icon: "📊", signal: "Feedback loop", action: "Nelle impostazioni avanzate puoi resettare il tuo storico di feedback e ripartire da zero" },
      ].map(c => `
      <div class="match-privacy-item">
        <span class="pi-icon">${c.icon}</span>
        <div><strong>${c.signal}</strong><br/><span style="font-size:13px">${c.action}</span></div>
      </div>`).join("")}
    </div>

    <div style="margin-top:36px;padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:4px">
      <h3 style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">Eliminazione completa</h3>
      <p style="font-size:14px;color:var(--text2);line-height:1.7">Puoi eliminare il tuo account e tutti i dati associati in qualsiasi momento: dall'app vai su <strong>Profilo → Modifica → Elimina account</strong>. I dati vengono rimossi entro 30 giorni (esclusi i log obbligatori per legge). In alternativa, scrivi a <a href="mailto:bikerlinkapp@gmail.com">bikerlinkapp@gmail.com</a>.</p>
    </div>
  </div>
</section>

<section class="section alt" aria-label="Link Privacy Policy">
  <div class="section-inner" style="text-align:center">
    <span class="section-eyebrow">Documento completo</span>
    <h2 class="section-title">Privacy Policy<br/><span class="accent">completa.</span></h2>
    <p class="section-lead">Per tutti i dettagli legali, le basi giuridiche del trattamento (GDPR art. 6), i tempi di conservazione e i tuoi diritti come interessato.</p>
    <a class="btn btn-primary" href="/privacy">Leggi la Privacy Policy completa →</a>
  </div>
</section>

<div class="cta-block">
  <h2>Hai altre <span style="color:var(--accent)">domande sulla privacy?</span></h2>
  <p>Scrivici a bikerlinkapp@gmail.com — rispondiamo entro 48 ore.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="mailto:bikerlinkapp@gmail.com">Scrivici</a>
    <a class="btn btn-outline" href="/matching/come-impara">← Come impara</a>
    <a class="btn btn-outline" href="/matching/per-investitori">Versione tecnica →</a>
  </div>
</div>
`;
  return { meta, body };
}

// ── PAGE 7: PER INVESTITORI (/matching/per-investitori) ───────────────────────
