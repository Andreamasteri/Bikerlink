import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingTypes(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/tipi-di-match",
    title: "I 17 tipi di match BikerLink — Tutti i segnali di affinità spiegati",
    description: "Tutti i 17 segnali di affinità del sistema matching BikerLink: brand moto, distanza, musica, lean angle, route affinity, overlap temporale e altro. Spiegati in linguaggio semplice.",
    ogImage: `${baseUrl}/assets/images/playstore-feature-graphic.png`,
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
        datePublished: "2024-10-01",
        dateModified: "2025-05-15",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntityOfPage: `${baseUrl}/matching/tipi-di-match`,
      },
    ],
  };

  const types = [
    { icon: "🏍️", nameKey: "match.types.t1.name", name: "Brand moto", descKey: "match.types.t1.desc", desc: "Ti suggeriamo chi guida la tua marca preferita o una compatibile. Ducatisti con Ducatisti, BMW con BMW — ma anche combinazioni dichiarate come \"aperto a tutti\"." },
    { icon: "📍", nameKey: "match.types.t2.name", name: "Distanza geohash", descKey: "match.types.t2.desc", desc: "Non solo i km in linea d'aria: usiamo geohash a 5–6 cifre per zone di guida reale. Chi è nello stesso bacino stradale conta di più di chi è vicino ma su un'isola irraggiungibile." },
    { icon: "🎵", nameKey: "match.types.t3.name", name: "Affinità musicale", descKey: "match.types.t3.desc", desc: "Stessa musica = stesso ritmo. Analizziamo le preferenze musicali con embeddings semantici: \"metal\" e \"hard rock\" risultano vicini, anche senza parole identiche nel profilo." },
    { icon: "📐", nameKey: "match.types.t4.name", name: "Lean angle (piega)", descKey: "match.types.t4.desc", desc: "Chi ama le curve come te. Il lean angle medio estratto dalla telemetria del telefono (giroscopio + accelerometro) rivela lo stile reale — non quello dichiarato." },
    { icon: "💨", nameKey: "match.types.t5.name", name: "G-force laterale", descKey: "match.types.t5.desc", desc: "La forza laterale in curva è la firma del pilota. Chi ha G-force simile guida con lo stesso entusiasmo e ritmo — né troppo piano, né troppo veloce per te." },
    { icon: "🗺️", nameKey: "match.types.t6.name", name: "Route affinity", descKey: "match.types.t6.desc", desc: "Sovrapposizione geografica dei percorsi storici. Se avete percorso le stesse strade negli ultimi 3 mesi, probabilmente vi piace lo stesso tipo di paesaggio." },
    { icon: "⏰", nameKey: "match.types.t7.name", name: "Overlap orario", descKey: "match.types.t7.desc", desc: "Chi guida nelle tue stesse fasce orarie (mattina presto, weekend, sera). Se esci solo la domenica alle 7, ha senso conoscere chi fa lo stesso." },
    { icon: "🏁", nameKey: "match.types.t8.name", name: "Stile di guida", descKey: "match.types.t8.desc", desc: "Velocità media in percorso, accelerazioni, frenate — sintetizzati in un profilo di stile. Chi guida in modo simile è più compatibile per uscite in comune." },
    { icon: "🏛️", nameKey: "match.types.t9.name", name: "Club condivisi", descKey: "match.types.t9.desc", desc: "Essere nello stesso MotoClub o in club gemellati aumenta il match score. La community già costruita conta." },
    { icon: "🏷️", nameKey: "match.types.t10.name", name: "Tag comuni", descKey: "match.types.t10.desc", desc: "Hashtag nel profilo: #touring, #enduro, #track, #curvy. Chi condivide più tag ha più cose in comune su cui costruire una conversazione." },
    { icon: "📖", nameKey: "match.types.t11.name", name: "Affinità bio", descKey: "match.types.t11.desc", desc: "Embeddings semantici della descrizione libera. \"Amo i passi di montagna\" e \"Sono felice sulle curve alpine\" vengono letti come concetti simili." },
    { icon: "🌍", nameKey: "match.types.t12.name", name: "Lingua e zona", descKey: "match.types.t12.desc", desc: "Parlare la stessa lingua e stare nella stessa regione aumenta le chance di incontrarsi davvero. Ma non è un filtro bloccante — puoi cercare biker in tutto il paese." },
    { icon: "👤", nameKey: "match.types.t13.name", name: "Fascia d'età", descKey: "match.types.t13.desc", desc: "Opzionale e configurabile. Se non ti interessa filtrare per età, non pesa nulla. Se preferisci uscire con persone della tua generazione, il sistema lo rispetta." },
    { icon: "⭐", nameKey: "match.types.t14.name", name: "Reputazione biker", descKey: "match.types.t14.desc", desc: "Feedback degli utenti dopo le uscite, indice di risposta ai messaggi, segnalazioni zero. Un biker affidabile ha uno score di reputazione più alto." },
    { icon: "🔄", nameKey: "match.types.t15.name", name: "Preferenze dichiarate", descKey: "match.types.t15.desc", desc: "Cosa hai esplicitamente indicato: tipo di uscita preferita (touring, track, enduro), disponibilità a nuovi rider, se cerchi compagni o solo visibilità." },
    { icon: "📊", nameKey: "match.types.t16.name", name: "Feedback storico", descKey: "match.types.t16.desc", desc: "Il tuo storico di like/ignora/block. Chi hai già rifiutato non ti viene riproposto. Chi hai connesso con successo aiuta a calibrare i pesi futuri." },
    { icon: "🌡️", nameKey: "match.types.t17.name", name: "Decay temporale", descKey: "match.types.t17.desc", desc: "I match \"invecchiano\": un profilo non aggiornato da 90 giorni pesa meno. I biker attivi recentemente vengono proposti per primi." },
  ];

  const body = `
${matchSubnav("/matching/tipi-di-match")}

<section class="match-hero" aria-labelledby="types-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; <span data-i18n="match.types.breadcrumb">I 17 tipi</span></div>
  <div class="match-hero-eyebrow" data-i18n="match.types.eyebrow">I segnali</div>
  <h1 id="types-h1" data-i18n-html="match.types.h1">I <span class="accent">17</span> TIPI<br/>DI MATCH</h1>
  <p class="lead" data-i18n="match.types.lead">Ogni match è il risultato di 17 segnali combinati. Qui trovi ognuno spiegato in linguaggio semplice — cosa misura, come funziona, e perché conta per trovare il compagno di giro giusto.</p>
</section>

<section class="section" aria-labelledby="types-grid-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.types.grid.eyebrow">Tutti i segnali</span>
    <h2 class="section-title" id="types-grid-h2" data-i18n="match.types.grid.title">17 dimensioni. 1 punteggio.</h2>
    <p class="section-lead" data-i18n="match.types.grid.lead">Ogni segnale ha un peso configurabile e — in futuro — un toggle utente per attivarlo o disattivarlo. Puoi scegliere cosa conta di più per te.</p>

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
          <div class="match-type-name">${String(i + 1).padStart(2, "0")} · <span data-i18n="${t.nameKey}">${t.name}</span></div>
          <div class="match-type-desc" data-i18n="${t.descKey}">${t.desc}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="weights-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.types.weights.eyebrow">Pesi e controllo</span>
    <h2 class="section-title" id="weights-h2" data-i18n="match.types.weights.title">Tu decidi cosa conta.</h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:center">
      <div class="prose" style="max-width:100%">
        <p data-i18n="match.types.weights.p1">Ogni segnale ha un peso predefinito ottimizzato dai dati aggregati della community. Ma puoi personalizzarlo:</p>
        <ul>
          <li data-i18n-html="match.types.weights.li1"><strong>Toggle utente</strong> — disattiva completamente un segnale (es. non vuoi matching per musica)</li>
          <li data-i18n-html="match.types.weights.li2"><strong>Boost manuale</strong> — aumenta il peso di un segnale che per te è fondamentale (es. "voglio solo Ducatisti")</li>
          <li data-i18n-html="match.types.weights.li3"><strong>Preferenze negative</strong> — il sistema impara dai tuoi rifiuti e abbassa automaticamente il peso dei profili simili</li>
        </ul>
        <p data-i18n="match.types.weights.p2">Il risultato: un sistema che parte ottimizzato per la media, ma si adatta al tuo profilo specifico nel tempo.</p>
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
          <div class="step"><h3 data-i18n="match.tl.d1.h3">Primo giorno</h3><p data-i18n="match.tl.d1.p">Pesi standard ottimizzati per la community media. Già buoni risultati dal primo utilizzo.</p></div>
          <div class="step"><h3 data-i18n="match.tl.w1.h3">Dopo 1 settimana</h3><p data-i18n="match.tl.w1.p">Il feedback loop ha già aggiustato 3–5 segnali basandosi sui tuoi like e ignora.</p></div>
          <div class="step"><h3 data-i18n="match.tl.m1.h3">Dopo 1 mese</h3><p data-i18n="match.tl.m1.p">Il tuo profilo di preferenze è stabile. I match sono altamente personalizzati sul tuo stile.</p></div>
        </div>
      </div>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2 data-i18n="match.types.cta.title">Vuoi capire come il sistema <span style="color:var(--accent)">impara?</span></h2>
  <p data-i18n="match.types.cta.desc">Feedback loop, decay temporale, A/B testing — tutto spiegato nella sezione successiva.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/matching/come-impara" data-i18n="match.types.cta.btn1">Come impara il sistema →</a>
    <a class="btn btn-outline" href="/matching/come-funziona" data-i18n="match.types.cta.btn2">← Come funziona</a>
  </div>
</div>
`;
  return { meta, body };
}

// ── PAGE 4: COME IMPARA (/matching/come-impara) ───────────────────────────────
