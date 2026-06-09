import { type PageMeta, breadcrumbsJsonLd } from "../render";
import { MATCHING_CSS, matchSubnav } from "./shared";

export function buildMatchingLearning(baseUrl: string): { meta: PageMeta; body: string } {
  const meta: PageMeta = {
    path: "/matching/come-impara",
    title: "Come impara il matching BikerLink — Feedback loop, decay e A/B testing",
    description: "Il sistema di matching BikerLink impara dai tuoi sì e dai tuoi no: feedback loop continuo, decay temporale, A/B testing e preferenze negative. Spiegato con esempi reali.",
    ogImage: `${baseUrl}/assets/images/playstore-feature-graphic.png`,
    headExtras: MATCHING_CSS,
    jsonld: [
      breadcrumbsJsonLd(baseUrl, [
        { name: "Home", path: "/" },
        { name: "Matching", path: "/matching" },
        { name: "Come impara", path: "/matching/come-impara" },
      ]),
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Come impara il matching di BikerLink",
        description: "Come il sistema di matching di BikerLink apprende dai tuoi feedback e migliora i suggerimenti nel tempo.",
        url: `${baseUrl}/matching/come-impara`,
        inLanguage: "it-IT",
        datePublished: "2024-10-01",
        dateModified: "2025-05-15",
        publisher: { "@type": "Organization", name: "BikerLink", url: baseUrl },
        mainEntityOfPage: `${baseUrl}/matching/come-impara`,
      },
    ],
  };

  const body = `
${matchSubnav("/matching/come-impara")}

<section class="match-hero" aria-labelledby="learn-h1">
  <div class="match-breadcrumb"><a href="/">Home</a> &nbsp;/&nbsp; <a href="/matching">Matching</a> &nbsp;/&nbsp; <span data-i18n="match.learn.breadcrumb">Come impara</span></div>
  <div class="match-hero-eyebrow" data-i18n="match.learn.eyebrow">Apprendimento continuo</div>
  <h1 id="learn-h1" data-i18n-html="match.learn.h1">IL SISTEMA<br/><span class="accent">IMPARA</span><br/>DA TE</h1>
  <p class="lead" data-i18n="match.learn.lead">Ogni tuo sì, ogni tuo no, ogni connessione avviata alimenta un ciclo di miglioramento continuo. Il matching diventa più preciso ogni giorno.</p>
</section>

<section class="section" aria-labelledby="feedback-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.learn.fb.eyebrow">Feedback loop</span>
    <h2 class="section-title" id="feedback-h2" data-i18n="match.learn.fb.title">Il sistema impara dai tuoi sì e no.</h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:flex-start">
      <div class="prose" style="max-width:100%">
        <p data-i18n="match.learn.fb.p1">Ogni interazione è un segnale di apprendimento:</p>
        <ul>
          <li data-i18n-html="match.learn.fb.li1"><strong>Like / Connessione avviata</strong> → il profilo viene usato come "positivo" per ricalibrate i pesi del tuo modello personale</li>
          <li data-i18n-html="match.learn.fb.li2"><strong>Ignora / Skip</strong> → segnale negativo debole; il sistema evita profili simili nelle prossime 48h</li>
          <li data-i18n-html="match.learn.fb.li3"><strong>Block</strong> → segnale negativo forte; quel profilo non tornerà mai, e il tipo di profilo viene penalizzato</li>
          <li data-i18n-html="match.learn.fb.li4"><strong>Connessione con chat attiva</strong> → segnale positivo forte; hai incontrato qualcuno con cui hai conversato davvero</li>
        </ul>
        <p style="margin-top:16px" data-i18n="match.learn.fb.p2">Esempio reale: hai ignorato 5 scooter di fila? Il sistema abbassa automaticamente il peso del brand "scooter" nel tuo profilo — senza che tu debba configurare nulla.</p>
      </div>
      <div>
        <!-- SVG feedback loop circolare -->
        <svg viewBox="0 0 340 280" role="img" aria-labelledby="loop-svg-title loop-svg-desc" style="width:100%;max-width:340px;height:auto;display:block;margin:0 auto 16px" xmlns="http://www.w3.org/2000/svg">
          <title id="loop-svg-title">Ciclo di feedback loop del matching</title>
          <desc id="loop-svg-desc">Diagramma circolare a 4 nodi: Proposta match → Interazione utente → Aggiornamento pesi → Match migliori, e ritorno</desc>
          <defs>
            <marker id="loop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#FF3B30"/>
            </marker>
          </defs>
          ${(()=>{
            const cx=170,cy=140,R=95;
            const nodes=[{l:"Proposta",lk:"match.learn.loop.n1.l",s:"match",sk:"match.learn.loop.n1.s"},{l:"Interazione",lk:"match.learn.loop.n2.l",s:"like/skip",sk:"match.learn.loop.n2.s"},{l:"Aggiorna",lk:"match.learn.loop.n3.l",s:"pesi",sk:"match.learn.loop.n3.s"},{l:"Migliori",lk:"match.learn.loop.n4.l",s:"match",sk:"match.learn.loop.n4.s"}];
            let s="";
            nodes.forEach((n,i)=>{const a=-Math.PI/2+i*Math.PI/2;const x=cx+Math.cos(a)*R;const y=cy+Math.sin(a)*R;s+=`<circle cx="${x}" cy="${y}" r="42" fill="#1A1A1A" stroke="#FF3B30" stroke-width="2"/><text x="${x}" y="${y-3}" text-anchor="middle" fill="#F0F0F0" font-size="13" font-weight="700" data-i18n="${n.lk}">${n.l}</text><text x="${x}" y="${y+13}" text-anchor="middle" fill="#999" font-size="11" data-i18n="${n.sk}">${n.s}</text>`;});
            for(let i=0;i<4;i++){const a1=-Math.PI/2+i*Math.PI/2;const a2=-Math.PI/2+(i+1)*Math.PI/2;const x1=cx+Math.cos(a1)*(R-40);const y1=cy+Math.sin(a1)*(R-40);const x2=cx+Math.cos(a2)*(R-40);const y2=cy+Math.sin(a2)*(R-40);s+=`<path d="M ${x1} ${y1} A ${R-40} ${R-40} 0 0 1 ${x2} ${y2}" fill="none" stroke="#FF3B30" stroke-width="2" marker-end="url(#loop-arrow)" opacity="0.7"/>`;}
            s+=`<text x="${cx}" y="${cy+4}" text-anchor="middle" fill="#FF3B30" font-size="11" font-weight="700" letter-spacing="2">LOOP</text>`;
            return s;
          })()}
        </svg>
        <div class="match-arch" style="text-align:left">
          <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-bottom:18px" data-i18n="match.learn.loop.label">Ciclo di apprendimento</div>
          <div class="steps" style="gap:10px">
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px" data-i18n="match.learn.loop.s1.h3">Proposta match</h3><p style="font-size:13px" data-i18n="match.learn.loop.s1.p">Il sistema propone i top candidati con score attuale</p></div>
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px" data-i18n="match.learn.loop.s2.h3">Interazione utente</h3><p style="font-size:13px" data-i18n="match.learn.loop.s2.p">Like, ignora, block, chat — ogni azione è registrata</p></div>
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px" data-i18n="match.learn.loop.s3.h3">Aggiornamento pesi</h3><p style="font-size:13px" data-i18n="match.learn.loop.s3.p">I pesi personali vengono ricalibrati in background</p></div>
            <div class="step" style="padding:14px 16px"><h3 style="font-size:16px" data-i18n="match.learn.loop.s4.h3">Match migliori</h3><p style="font-size:13px" data-i18n="match.learn.loop.s4.p">La prossima sessione parte con un modello più preciso</p></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="decay-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.learn.decay.eyebrow">Decay temporale</span>
    <h2 class="section-title" id="decay-h2" data-i18n="match.learn.decay.title">I match invecchiano.</h2>
    <p class="section-lead" data-i18n="match.learn.decay.lead">Un biker non attivo da 3 mesi non è il tuo compagno di giro ideale. Il decay temporale penalizza progressivamente i profili inattivi.</p>

    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:center">
      <div class="match-decay-chart" aria-label="Curva di decay esponenziale">
        <div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:12px;text-align:center" data-i18n="match.learn.decay.chart.title">Score decay nel tempo (inattività)</div>
        <svg class="match-decay-svg" viewBox="0 0 400 160" aria-hidden="true">
          <defs>
            <linearGradient id="decayGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#FF3B30" stop-opacity="0.4"/>
              <stop offset="100%" stop-color="#FF3B30" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <!-- Area fill -->
          <path d="M 30 20 Q 120 25 180 70 Q 250 110 370 148 L 370 148 L 30 148 Z" fill="url(#decayGrad)"/>
          <!-- Curve line -->
          <path d="M 30 20 Q 120 25 180 70 Q 250 110 370 148" fill="none" stroke="#FF3B30" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Axes -->
          <line x1="30" y1="148" x2="380" y2="148" stroke="#333" stroke-width="1"/>
          <line x1="30" y1="10" x2="30" y2="148" stroke="#333" stroke-width="1"/>
          <!-- Labels -->
          <text x="30" y="10" fill="#666" font-size="11" text-anchor="middle">100%</text>
          <text x="200" y="165" fill="#666" font-size="11" text-anchor="middle" data-i18n="match.learn.decay.chart.axis">Giorni di inattività →</text>
          <text x="110" y="165" fill="#666" font-size="10" text-anchor="middle">30gg</text>
          <text x="200" y="165" fill="#666" font-size="10" text-anchor="middle">60gg</text>
          <text x="290" y="165" fill="#666" font-size="10" text-anchor="middle">90gg</text>
          <text x="380" y="100" fill="#FF3B30" font-size="11" text-anchor="end">≈0%</text>
          <!-- Dots -->
          <circle cx="30" cy="20" r="3" fill="#FF3B30"/>
          <circle cx="110" cy="55" r="3" fill="#FF3B30"/>
          <circle cx="200" cy="95" r="3" fill="#FF3B30"/>
          <circle cx="290" cy="128" r="3" fill="#FF3B30"/>
        </svg>
        <p style="text-align:center;font-size:13px;color:var(--text3);margin-top:8px" data-i18n="match.learn.decay.chart.note">Dopo 90 giorni di inattività, il profilo non viene più proposto</p>
      </div>
      <div class="prose" style="max-width:100%">
        <h3 data-i18n="match.learn.decay.h3a">Come funziona il decay</h3>
        <p data-i18n="match.learn.decay.p1">Il punteggio finale di ogni candidato viene moltiplicato per un fattore di decay basato sull'inattività:</p>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:14px 18px;margin:12px 0;font-family:monospace;font-size:14px;color:var(--accent)">
          decay = e<sup>(-λ × giorni_inattivi)</sup>
        </div>
        <p data-i18n="match.learn.decay.p2">Il parametro λ è configurabile dall'admin. Il decay default porta a ~50% dopo 30 giorni, ~10% dopo 60, ~0% dopo 90.</p>
        <h3 style="margin-top:20px" data-i18n="match.learn.decay.h3b">Cosa conta come "attività"</h3>
        <ul>
          <li data-i18n="match.learn.decay.li1">Apertura dell'app</li>
          <li data-i18n="match.learn.decay.li2">Aggiornamento del profilo</li>
          <li data-i18n="match.learn.decay.li3">Tracking GPS di un giro</li>
          <li data-i18n="match.learn.decay.li4">Invio o ricezione di messaggi</li>
          <li data-i18n="match.learn.decay.li5">Partecipazione a un contest</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="ab-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.learn.ab.eyebrow">A/B testing</span>
    <h2 class="section-title" id="ab-h2" data-i18n="match.learn.ab.title">Sperimentiamo per migliorare.</h2>
    <div class="grid grid-2" style="margin-top:32px;gap:40px;align-items:flex-start">
      <div class="prose" style="max-width:100%">
        <p data-i18n="match.learn.ab.p1">Il sistema di matching non è statico. Usiamo A/B testing continuo per migliorare gli algoritmi:</p>
        <ul>
          <li data-i18n="match.learn.ab.li1">Una parte degli utenti riceve l'algoritmo attuale (gruppo A)</li>
          <li data-i18n="match.learn.ab.li2">Un'altra parte riceve una variante sperimentale (gruppo B)</li>
          <li data-i18n="match.learn.ab.li3">Misuriamo le connessioni avviate, le chat attive, il tasso di risposta</li>
          <li data-i18n="match.learn.ab.li4">Se il gruppo B ottiene risultati migliori, la variante diventa il nuovo standard</li>
        </ul>
        <p style="margin-top:16px" data-i18n-html="match.learn.ab.p2">In linguaggio semplice: <em>"a volte proviamo due algoritmi su gruppi diversi per vedere quale ti fa trovare compagni migliori. Non lo noti mai, ma i tuoi match migliorano costantemente."</em></p>
      </div>
      <div>
        <div class="match-arch">
          <div data-lang-block="it">
            <div class="mermaid">
sequenceDiagram
  participant U as Utente
  participant R as Router A/B
  participant A as Algo Attuale
  participant B as Algo Variante
  participant M as Metriche
  U->>R: Richiesta match
  R->>A: 50% utenti
  R->>B: 50% utenti
  A->>U: Match lista A
  B->>U: Match lista B
  U->>M: Interazioni
  M->>R: Statistiche
  Note over M,R: Se B &gt; A → B diventa standard
            </div>
          </div>
          <div data-lang-block="en" style="display:none">
            <div class="mermaid">
sequenceDiagram
  participant U as User
  participant R as A/B Router
  participant A as Current Algo
  participant B as Variant Algo
  participant M as Metrics
  U->>R: Match request
  R->>A: 50% users
  R->>B: 50% users
  A->>U: Match list A
  B->>U: Match list B
  U->>M: Interactions
  M->>R: Statistics
  Note over M,R: If B &gt; A → B becomes standard
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section alt" aria-labelledby="neg-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.learn.neg.eyebrow">Preferenze negative</span>
    <h2 class="section-title" id="neg-h2" data-i18n="match.learn.neg.title">Puoi escludere.</h2>
    <p class="section-lead" data-i18n="match.learn.neg.lead">Non ti piacciono certi tipi di biker o di moto? Il sistema impara dai tuoi no — automaticamente o su tua richiesta esplicita.</p>
    <div class="grid grid-2" style="margin-top:32px;gap:32px">
      <div>
        <h3 style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px" data-i18n="match.learn.neg.h3a">Apprendimento automatico</h3>
        <div class="match-privacy-list">
          <div class="match-privacy-item"><span class="pi-icon">🔄</span><div data-i18n="match.learn.neg.auto.li1">Hai ignorato 5 scooter → il sistema abbassa automaticamente il peso "scooter" nel tuo profilo</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🔄</span><div data-i18n="match.learn.neg.auto.li2">Hai bloccato 2 utenti dello stesso club → il club viene de-prioritizzato nei tuoi match</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🔄</span><div data-i18n="match.learn.neg.auto.li3">Non hai mai avviato chat con utenti over 60 → la fascia viene progressivamente penalizzata</div></div>
        </div>
      </div>
      <div>
        <h3 style="font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:16px" data-i18n="match.learn.neg.h3b">Controllo esplicito</h3>
        <div class="match-privacy-list">
          <div class="match-privacy-item"><span class="pi-icon">⚙️</span><div data-i18n-html="match.learn.neg.ctrl.li1"><strong>Filtri profilo</strong> — Escludi tipo di moto, fascia d'età, sesso direttamente dalle preferenze</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🚫</span><div data-i18n-html="match.learn.neg.ctrl.li2"><strong>Block utente</strong> — Blocca un utente specifico; non lo vedrai mai più nei match</div></div>
          <div class="match-privacy-item"><span class="pi-icon">🔕</span><div data-i18n-html="match.learn.neg.ctrl.li3"><strong>Silenzia tipo</strong> — "Non voglio più vedere biker con moto &lt;50cc" — salvato nelle preferenze</div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="digest-h2">
  <div class="section-inner">
    <span class="section-eyebrow" data-i18n="match.learn.digest.eyebrow">Recap settimanale</span>
    <h2 class="section-title" id="digest-h2" data-i18n="match.learn.digest.title">Il digest del lunedì.</h2>
    <div class="prose" style="max-width:680px">
      <p data-i18n="match.learn.digest.lead">Ogni lunedì mattina, il sistema genera un digest personalizzato con i tuoi top match della settimana: i biker con cui hai più affinità che non hai ancora contattato, i nuovi iscritti nella tua zona, e le uscite in programma nei club vicini.</p>
      <p data-i18n="match.learn.digest.p2">Non è spam — è un riassunto intelligente che tiene vivo il matching anche quando non apri l'app tutti i giorni.</p>
    </div>
  </div>
</section>

<div class="cta-block">
  <h2 data-i18n="match.learn.cta.title">Curioso di sapere <span style="color:var(--accent)">come funziona l'AI?</span></h2>
  <p data-i18n="match.learn.cta.desc">6 sistemi AI specializzati, 8 modelli in cascata, 4 provider con failover. La pagina più tecnica del manuale.</p>
  <div class="btn-row" style="justify-content:center">
    <a class="btn btn-primary" href="/matching/intelligenza-artificiale" data-i18n="match.learn.cta.btn1">Il cervello AI →</a>
    <a class="btn btn-outline" href="/matching/tipi-di-match" data-i18n="match.learn.cta.btn2">← I 17 tipi</a>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" defer></script>
<script>document.addEventListener('DOMContentLoaded',function(){if(window.mermaid){mermaid.initialize({startOnLoad:true,theme:'dark',themeVariables:{primaryColor:'#1A1A1A',primaryTextColor:'#F0F0F0',primaryBorderColor:'#FF3B30',lineColor:'#666',background:'#0A0A0A'}});}});</script>
`;
  return { meta, body };
}

// ── PAGE 5: INTELLIGENZA ARTIFICIALE (/matching/intelligenza-artificiale) ─────
