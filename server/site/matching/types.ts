import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingTypes(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/tipi-di-match",
    title: "I 17 tipi di match BikerLink — Tutti i segnali di affinità spiegati",
    description: "Tutti i 17 segnali di affinità del sistema matching BikerLink: brand moto, distanza, musica, lean angle, route affinity, overlap temporale e altro. Spiegati in linguaggio semplice.",
    ogImage: `${baseUrl}/assets/images/matching/matching-hero.webp`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "I 17 tipi", path: "/matching/tipi-di-match" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "I 17 tipi di match di BikerLink",
        description: "Tutti i tipi di match calcolati da BikerLink: stile di guida, moto, percorsi, esperienza e altri segnali.",
        url: `${baseUrl}/matching/tipi-di-match`,
        inLanguage: "it-IT",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntityOfPage: `${baseUrl}/matching/tipi-di-match`,
      },
    ],
  };

  const types = [
    { icon: "🏍️", name: "Brand moto", desc: "Ti suggeriamo chi guida la tua marca preferita o una compatibile. Ducatisti con Ducatisti, BMW con BMW — ma anche combinazioni dichiarate come \"aperto a tutti\"." },
    { icon: "📍", name: "Distanza geohash", desc: "Non solo i km in linea d'aria: usiamo geohash a 5–6 cifre per zone di guida reale. Chi è nello stesso bacino stradale conta di più di chi è vicino ma su un'isola irraggiungibile." },
    { icon: "🎵", name: "Affinità musicale", desc: "Stessa musica = stesso ritmo. Analizziamo le preferenze musicali con embeddings semantici: \"metal\" e \"hard rock\" risultano vicini, anche senza parole identiche nel profilo." },
    { icon: "📐", name: "Lean angle (piega)", desc: "Chi ama le curve come te. Il lean angle medio estratto dalla telemetria del telefono (giroscopio + accelerometro) rivela lo stile reale — non quello dichiarato." },
    { icon: "💨", name: "G-force laterale", desc: "La forza laterale in curva è la firma del pilota. Chi ha G-force simile guida con lo stesso entusiasmo e ritmo — né troppo piano, né troppo veloce per te." },
    { icon: "🗺️", name: "Route affinity", desc: "Sovrapposizione geografica dei percorsi storici. Se avete percorso le stesse strade negli ultimi 3 mesi, probabilmente vi piace lo stesso tipo di paesaggio." },
    { icon: "⏰", name: "Overlap orario", desc: "Chi guida nelle tue stesse fasce orarie (mattina presto, weekend, sera). Se esci solo la domenica alle 7, ha senso conoscere chi fa lo stesso." },
    { icon: "🏁", name: "Stile di guida", desc: "Velocità media in percorso, accelerazioni, frenate — sintetizzati in un profilo di stile. Chi guida in modo simile è più compatibile per uscite in comune." },
    { icon: "🏛️", name: "Club condivisi", desc: "Essere nello stesso MotoClub o in club gemellati aumenta il match score. La community già costruita conta." },
    { icon: "🏷️", name: "Tag comuni", desc: "Hashtag nel profilo: #touring, #enduro, #track, #curvy. Chi condivide più tag ha più cose in comune su cui costruire una conversazione." },
    { icon: "📖", name: "Affinità bio", desc: "Embeddings semantici della descrizione libera. \"Amo i passi di montagna\" e \"Sono felice sulle curve alpine\" vengono letti come concetti simili." },
    { icon: "🌍", name: "Lingua e zona", desc: "Parlare la stessa lingua e stare nella stessa regione aumenta le chance di incontrarsi davvero. Ma non è un filtro bloccante — puoi cercare biker in tutto il paese." },
    { icon: "👤", name: "Fascia d'età", desc: "Opzionale e configurabile. Se non ti interessa filtrare per età, non pesa nulla. Se preferisci uscire con persone della tua generazione, il sistema lo rispetta." },
    { icon: "⭐", name: "Reputazione biker", desc: "Feedback degli utenti dopo le uscite, indice di risposta ai messaggi, segnalazioni zero. Un biker affidabile ha uno score di reputazione più alto." },
    { icon: "🔄", name: "Preferenze dichiarate", desc: "Cosa hai esplicitamente indicato: tipo di uscita preferita (touring, track, enduro), disponibilità a nuovi rider, se cerchi compagni o solo visibilità." },
    { icon: "📊", name: "Feedback storico", desc: "Il tuo storico di like/ignora/block. Chi hai già rifiutato non ti viene riproposto. Chi hai connesso con successo aiuta a calibrare i pesi futuri." },
    { icon: "🌡️", name: "Decay temporale", desc: "I match \"invecchiano\": un profilo non aggiornato da 90 giorni pesa meno. I biker attivi recentemente vengono proposti per primi." },
  ];

  const body = `
${matchSubnav("/matching/tipi-di-match")}

<section class="match-hero" aria-labelledby="types-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; I 17 tipi</div>
  <div class="match-hero-eyebrow">I segnali</div>
  <h1 id="types-h1">I <span class="accent">17</span> TIPI<br/>DI MATCH</h1>
  <p class="lead">Ogni match è il risultato di 17 segnali combinati. Qui trovi ognuno spiegato in linguaggio semplice — cosa misura, come funziona, e perché conta per trovare il compagno di giro giusto.</p>
</section>

<section class="section" aria-labelledby="types-grid-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Tutti i segnali</span>
    <h2 class="section-title" id="types-grid-h2">17 dimensioni.<br/><span class="accent">1 punteggio.</span></h2>
    <p class="section-lead">Ogni segnale ha un peso configurabile e — in futuro — un toggle utente per attivarlo o disattivarlo. Puoi scegliere cosa conta di più per te.</p>

    <!-- SVG categorization: 17 segnali raggruppati in 5 famiglie -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:24px;margin:28px 0;overflow-x:auto">
      <svg viewBox="0 0 720 220" role="img" aria-labelledby="cat-svg-title cat-svg-desc" style="width:100%;max-width:720px;height:auto;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">
        <title id="cat-svg-title">I 17 segnali raggruppati per famiglia</title>
        <desc id="cat-svg-desc">Distribuzione dei 17 segnali in 5 famiglie: Geo, Tempo, Musica/Bio, Strade/Telemetria, Behavior</desc>
        ${[
          {l:"GEO",       n:3, c:"#FF3B30", items:"distanza · zona · lingua"},
          {l:"TEMPO",     n:2, c:"#FF6B5B", items:"orari · decay"},
          {l:"SEMANTICA", n:3, c:"#FF8A7A", items:"bio · musica · tag"},
          {l:"STRADE",    n:5, c:"#FFA99A", items:"route · lean · G-force · stile · brand"},
          {l:"BEHAVIOR",  n:4, c:"#FFC6BA", items:"club · prefer · feedback · reput."},
        ].map((cat,i)=>{
          const x = 20 + i*140;
          const h = cat.n*22;
          return `<g><rect x="${x}" y="${190-h}" width="120" height="${h}" fill="${cat.c}" opacity="0.85" rx="2"/><text x="${x+60}" y="${185-h}" text-anchor="middle" fill="${cat.c}" font-size="13" font-weight="700" letter-spacing="1">${cat.l}</text><text x="${x+60}" y="${170-h}" text-anchor="middle" fill="#999" font-size="11">${cat.n} segnali</text><text x="${x+60}" y="208" text-anchor="middle" fill="#666" font-size="10">${cat.items}</text></g>`;
        }).join("")}
        <line x1="10" y1="190" x2="710" y2="190" stroke="#333" stroke-width="1"/>
      </svg>
    </div>

    <div class="match-types-grid" role="list">
      ${types.map((t, i) => `
      <div class="match-type-card" role="listitem">
        <div class="match-type-icon" aria-hidden="true">${t.icon}</div>
        <div>
          <div class="match-type-name">${String(i + 1).padStart(2, "0")} · ${t.name}</div>
          <div class="match-type-desc">${t.desc}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="weights-h2">
  <div class="section-inner">
    <span class="section-eyebrow">Pesi e controllo</span>
    <h2 class="section-title" id="weights-h2">Tu decidi<br/><span class="accent">cosa conta.</span></h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:center">
      <div class="prose" style="max-width:100%">
        <p>Ogni segnale ha un peso predefinito ottimizzato dai dati aggregati della community. Ma puoi personalizzarlo:</p>
        <ul>
          <li><strong>Toggle utente</strong> — disattiva completamente un segnale (es. non vuoi matching per musica)</li>
          <li><strong>Boost manuale</strong> — aumenta il peso di un segnale che per te è fondamentale (es. "voglio solo Ducatisti")</li>
          <li><strong>Preferenze negative</strong> — il sistema impara dai tuoi rifiuti e abbassa automaticamente il peso dei profili simili</li>
        </ul>
        <p>Il risultato: un sistema che parte ottimizzato per la media, ma si adatta al tuo profilo specifico nel tempo.</p>
      </div>
      <div>
        <!-- Radar chart: confronto pesi default vs personalizzato -->
        <svg viewBox="0 0 320 320" role="img" aria-labelledby="radar-svg-title radar-svg-desc" style="width:100%;max-width:320px;height:auto;display:block;margin:0 auto 18px" xmlns="http://www.w3.org/2000/svg">
          <title id="radar-svg-title">Radar chart: pesi default vs profilo personalizzato</title>
          <desc id="radar-svg-desc">Confronto su 6 assi (Moto, Geo, Musica, Tempo, Telemetria, Behavior) tra il peso default del sistema e un esempio di profilo utente personalizzato</desc>
          ${(()=>{
            const cx=160,cy=160,R=110;
            const axes=["Moto","Geo","Musica","Tempo","Telemetria","Behavior"];
            const def=[0.7,0.7,0.7,0.7,0.7,0.7];
            const user=[0.95,0.5,0.4,0.85,0.9,0.6];
            const pt=(v:number,i:number)=>{const a=-Math.PI/2+i*Math.PI*2/6;return [cx+Math.cos(a)*R*v,cy+Math.sin(a)*R*v];};
            let s="";
            [0.25,0.5,0.75,1].forEach(r=>{const pts=axes.map((_,i)=>pt(r,i).join(",")).join(" ");s+=`<polygon points="${pts}" fill="none" stroke="#333" stroke-width="1"/>`;});
            axes.forEach((_,i)=>{const [x,y]=pt(1,i);s+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#333" stroke-width="1"/>`;});
            const defPts=def.map((v,i)=>pt(v,i).join(",")).join(" ");
            const userPts=user.map((v,i)=>pt(v,i).join(",")).join(" ");
            s+=`<polygon points="${defPts}" fill="#888" fill-opacity="0.15" stroke="#888" stroke-width="1.5"/>`;
            s+=`<polygon points="${userPts}" fill="#FF3B30" fill-opacity="0.25" stroke="#FF3B30" stroke-width="2"/>`;
            axes.forEach((lbl,i)=>{const [x,y]=pt(1.18,i);s+=`<text x="${x}" y="${y+4}" text-anchor="middle" fill="#F0F0F0" font-size="11" font-weight="600">${lbl}</text>`;});
            return s;
          })()}
        </svg>
        <div style="display:flex;gap:18px;justify-content:center;font-size:12px;color:var(--text3);margin-bottom:18px"><span><span style="display:inline-block;width:10px;height:10px;background:#888;margin-right:6px;vertical-align:middle"></span>Default</span><span><span style="display:inline-block;width:10px;height:10px;background:#FF3B30;margin-right:6px;vertical-align:middle"></span>Tuo profilo</span></div>
        <div class="steps">
          <div class="step"><h3>Primo giorno</h3><p>Pesi standard ottimizzati per la community media. Già buoni risultati dal primo utilizzo.</p></div>
          <div class="step"><h3>Dopo 1 settimana</h3><p>Il feedback loop ha già aggiustato 3–5 segnali basandosi sui tuoi like e ignora.</p></div>
          <div class="step"><h3>Dopo 1 mese</h3><p>Il tuo profilo di preferenze è stabile. I match sono altamente personalizzati sul tuo stile.</p></div>
        </div>
      </div>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2>Vuoi capire come il sistema <span style="color:var(--accent)">impara?</span></h2>
  <p>Feedback loop, decay temporale, A/B testing — tutto spiegato nella sezione successiva.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/matching/come-impara">Come impara il sistema →</a>
    <a class="btn btn-outline" href="/matching/come-funziona">← Come funziona</a>
  </div>
</div>
`;
  return { meta, body };
}

// ── PAGE 4: COME IMPARA (/matching/come-impara) ───────────────────────────────
