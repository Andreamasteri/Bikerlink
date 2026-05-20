import type { Request } from "express";

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  h1?: string;
  ogImage?: string;
  jsonld?: object | object[];
  noindex?: boolean;
  /** Extra <link>/<meta> tags appended to <head> for page-specific hints
   *  (e.g. preconnect for third-party origins used only on that page). */
  headExtras?: string;
}

export function getBaseUrl(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host") || "biker-link.replit.app";
  return `${protocol}://${host}`;
}

const SHARED_CSS = /* css */ `
:root{
  --accent:#FF3B30;--accent-hover:#FF6A00;--accent-dim:rgba(255,59,48,0.12);
  --accent-glow:rgba(255,59,48,0.30);--bg:#0A0A0A;--bg-alt:#0E0E0E;
  --surface:#121212;--surface2:#1A1A1A;--border:rgba(255,255,255,0.07);
  --border-mid:rgba(255,255,255,0.14);--text:#F0F0F0;--text2:#A3A3A3;
  --text3:#6A6A6A;--success:#22C55E;
  --font-display:'Barlow Condensed','Bebas Neue',sans-serif;
  --font-body:'Manrope',system-ui,-apple-system,sans-serif;
  --radius:3px;--max:1140px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{font-family:var(--font-body);background:var(--bg);color:var(--text);line-height:1.65;overflow-x:hidden}
a{color:var(--accent);text-decoration:none;transition:opacity .15s}
a:hover{opacity:.82}
img,svg{display:block;max-width:100%;height:auto}
button{font:inherit;cursor:pointer}
.skip-link{position:absolute;left:-9999px;top:0;background:var(--accent);color:#fff;padding:10px 18px;font-weight:700;z-index:10000}
.skip-link:focus{left:8px;top:8px;opacity:1}

/* MUSIC BAR */
.music-bar{position:fixed;top:0;left:0;right:0;z-index:1001;height:40px;display:flex;align-items:center;gap:10px;padding:0 16px;background:rgba(8,8,8,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,59,48,.15)}
.music-bar-icon{color:var(--accent);display:flex;align-items:center;flex-shrink:0;opacity:.8}
.music-bar-icon svg{width:14px;height:14px;fill:currentColor}
.music-bar-track{font-size:11px;font-weight:600;letter-spacing:.5px;color:var(--text2);flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:var(--font-body)}
.music-bar-btn{background:none;border:1px solid rgba(255,255,255,.1);color:var(--text2);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:border-color .15s,color .15s;padding:0;line-height:1}
.music-bar-btn:hover{border-color:var(--accent);color:var(--accent)}
.music-bar-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.music-bar-btn svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.music-bar-btn.play-btn svg.icon-play{display:block}.music-bar-btn.play-btn.playing svg.icon-play{display:none}
.music-bar-btn.play-btn svg.icon-pause{display:none}.music-bar-btn.play-btn.playing svg.icon-pause{display:block}
.music-bar-btn.mute-btn svg.icon-volume{display:block}.music-bar-btn.mute-btn.muted svg.icon-volume{display:none}
.music-bar-btn.mute-btn svg.icon-mute{display:none}.music-bar-btn.mute-btn.muted svg.icon-mute{display:block}
/* NAVBAR */
.navbar{position:fixed;top:40px;left:0;right:0;z-index:1000;height:64px;display:flex;align-items:center;background:rgba(10,10,10,.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}
.nav-inner{max-width:var(--max);margin:0 auto;padding:0 24px;width:100%;display:flex;align-items:center;gap:24px}
.nav-logo{font-family:var(--font-display);font-size:24px;letter-spacing:2px;color:var(--text);display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:700}
.nav-logo .dot{color:var(--accent)}
.nav-links{display:flex;align-items:center;gap:22px;margin-left:auto}
.nav-links a{font-size:13px;font-weight:600;letter-spacing:.5px;color:var(--text);text-transform:uppercase}
.nav-links a:hover,.nav-links a[aria-current="page"]{color:var(--text);opacity:1}
.nav-cta{font-size:13px;font-weight:700;letter-spacing:1px;padding:9px 18px;background:var(--accent);color:#fff !important;border-radius:var(--radius);text-transform:uppercase}
.nav-cta:hover{background:var(--accent-hover);opacity:1 !important}
.nav-planner-link{color:var(--accent) !important;font-weight:700 !important}
.nav-planner-link:hover{opacity:.8 !important}
.nav-burger{display:none;background:none;border:1px solid var(--border-mid);color:var(--text);width:40px;height:36px;border-radius:var(--radius);font-size:18px;align-items:center;justify-content:center;margin-left:auto}
.nav-burger:focus{outline:2px solid var(--accent)}
@media(max-width:860px){
  .nav-links{display:none;position:absolute;top:64px;left:0;right:0;flex-direction:column;background:rgba(10,10,10,.98);padding:18px 24px;gap:14px;border-bottom:1px solid var(--border);align-items:flex-start}
  .nav-links.open{display:flex}
  .nav-burger{display:inline-flex}
  .nav-cta{margin-top:6px}
}

/* MAIN/SECTIONS */
main{padding-top:104px;min-height:60vh}
.section{padding:80px 24px;position:relative}
.section-inner{max-width:var(--max);margin:0 auto}
.section.alt{background:var(--bg-alt);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.section-eyebrow{font-size:12px;font-weight:700;letter-spacing:3px;color:var(--accent);text-transform:uppercase;margin-bottom:14px;display:inline-flex;align-items:center;gap:10px}
.section-eyebrow::before{content:"";display:block;width:28px;height:1px;background:var(--accent)}
.section-title{font-family:var(--font-display);font-size:clamp(34px,5vw,56px);line-height:1.05;letter-spacing:1px;color:var(--text);margin-bottom:18px;text-transform:uppercase}
.section-title .accent{color:var(--accent)}
.section-lead{font-size:17px;color:var(--text2);max-width:680px;margin-bottom:36px}

/* COMPETITOR TABLE */
.comp-section{padding:80px 24px}
.comp-section .section-inner{max-width:var(--max);margin:0 auto}
.comp-highlights{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:40px 0}
@media(max-width:640px){.comp-highlights{grid-template-columns:1fr}}
.comp-highlight{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px 20px;display:flex;flex-direction:column;gap:10px}
.comp-highlight-icon{font-size:24px;line-height:1}
.comp-highlight-title{font-size:14px;font-weight:700;letter-spacing:.5px;color:var(--text)}
.comp-highlight-desc{font-size:13px;color:var(--text3);line-height:1.6}
.comp-highlight-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(255,59,48,.12);color:var(--accent);font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:20px;margin-top:auto;align-self:flex-start}
.comp-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:12px;margin-top:12px}
.comp-table{width:100%;border-collapse:collapse;min-width:560px}
.comp-table th,.comp-table td{padding:12px 14px;text-align:center;font-size:13px;border-bottom:1px solid var(--border)}
.comp-table td:first-child,.comp-table th:first-child{text-align:left;font-weight:600;color:var(--text);white-space:nowrap}
.comp-table thead th{background:var(--surface);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);position:sticky;top:0;z-index:1}
.comp-table thead th.col-bl{background:var(--accent);color:#fff;letter-spacing:1px}
.comp-table tbody tr:last-child td{border-bottom:none}
.comp-table tbody tr:hover td{background:rgba(255,255,255,.03)}
.comp-table tbody td.col-bl{background:rgba(255,59,48,.07);font-weight:700;color:var(--text)}
.comp-cell-check{color:#30d158;font-size:15px}
.comp-cell-cross{color:var(--text3);opacity:.5;font-size:15px}
.comp-cell-partial{color:#ffd60a;font-size:15px}

/* HERO */
.page-hero{padding:120px 24px 60px;background:radial-gradient(ellipse 70% 55% at 50% 0%,rgba(255,59,48,.14) 0%,transparent 70%),var(--bg);text-align:center;border-bottom:1px solid var(--border)}
.page-hero h1{font-family:var(--font-display);font-size:clamp(48px,9vw,96px);line-height:.95;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px}
.page-hero h1 .accent{color:var(--accent)}
.page-hero p.lead{font-size:18px;color:var(--text2);max-width:660px;margin:0 auto 28px}
.page-hero .breadcrumb{font-size:12px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:24px}
.page-hero .breadcrumb a{color:var(--text3)}
.page-hero .breadcrumb a:hover{color:var(--text2)}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 28px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:var(--radius);border:none;text-decoration:none;transition:transform .15s,box-shadow .15s,background .15s;font-family:var(--font-body);white-space:nowrap}
.btn:hover{transform:translateY(-2px);opacity:1}
.btn-primary{background:var(--accent);color:#fff !important}
.btn-primary:hover{background:var(--accent-hover);box-shadow:0 6px 24px var(--accent-glow)}
.btn-outline{background:transparent;color:var(--text);border:1px solid var(--border-mid)}
.btn-outline:hover{border-color:var(--accent);color:var(--accent)}
.btn-row{display:flex;flex-wrap:wrap;gap:12px}

/* CARDS GRID */
.grid{display:grid;gap:20px}
.grid-2{grid-template-columns:repeat(2,1fr)}
.grid-3{grid-template-columns:repeat(3,1fr)}
.grid-4{grid-template-columns:repeat(4,1fr)}
@media(max-width:900px){.grid-3,.grid-4{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;transition:border-color .2s,transform .2s}
.card:hover{border-color:var(--border-mid);transform:translateY(-2px)}
.card .icon{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);border:1px solid rgba(255,59,48,.25);border-radius:var(--radius);color:var(--accent);margin-bottom:16px}
.card .icon svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.card h3{font-family:var(--font-display);font-size:24px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;color:var(--text)}
.card p{font-size:14px;color:var(--text2);line-height:1.6}
.card .meta{margin-top:14px;font-size:11px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase}

/* STATS */
.stats-row{display:flex;flex-wrap:wrap;gap:32px;padding:24px;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius)}
.stat{flex:1;min-width:140px;text-align:center}
.stat-value{font-family:var(--font-display);font-size:42px;letter-spacing:2px;color:var(--accent);line-height:1}
.stat-label{font-size:11px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-top:6px}

/* CTA BLOCK */
.cta-block{text-align:center;padding:60px 24px;background:linear-gradient(180deg,var(--bg-alt) 0%,var(--bg) 100%);border-top:1px solid var(--border)}
.cta-block h2{font-family:var(--font-display);font-size:clamp(32px,5vw,48px);letter-spacing:2px;text-transform:uppercase;margin-bottom:14px}
.cta-block p{font-size:16px;color:var(--text2);max-width:560px;margin:0 auto 24px}
.cta-block .btn-row{justify-content:center}

/* PROSE (long content) */
.prose{max-width:760px;margin:0 auto}
.prose h2{font-family:var(--font-display);font-size:32px;letter-spacing:1.5px;text-transform:uppercase;margin:48px 0 18px;color:var(--text);padding-bottom:10px;border-bottom:1px solid var(--border)}
.prose h2:first-child{margin-top:0}
.prose h3{font-size:18px;font-weight:700;color:var(--text);margin:28px 0 10px}
.prose p{font-size:15px;color:var(--text2);margin-bottom:14px;line-height:1.75}
.prose ul,.prose ol{padding-left:22px;margin-bottom:16px;color:var(--text2)}
.prose li{margin-bottom:6px;font-size:15px;line-height:1.7}
.prose strong{color:var(--text)}
.prose a{text-decoration:underline;text-underline-offset:3px}

/* FAQ */
.faq details{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:0;margin-bottom:10px;overflow:hidden}
.faq details[open]{border-color:var(--border-mid)}
.faq summary{padding:18px 22px;cursor:pointer;font-weight:700;font-size:15px;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--accent);font-size:24px;font-weight:300;transition:transform .2s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq .answer{padding:0 22px 20px;font-size:14px;color:var(--text2);line-height:1.7}

/* FOOTER */
.footer{background:var(--bg-alt);border-top:1px solid var(--border);padding:56px 24px 28px;color:var(--text2);font-size:13px}
.footer-inner{max-width:var(--max);margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:36px}
@media(max-width:760px){.footer-inner{grid-template-columns:1fr 1fr;gap:28px}}
@media(max-width:420px){.footer-inner{grid-template-columns:1fr}}
.footer-brand{font-family:var(--font-display);font-size:26px;letter-spacing:2px;color:var(--text);margin-bottom:10px;font-weight:700}
.footer-brand .dot{color:var(--accent)}
.footer-tag{font-size:13px;color:var(--text3);max-width:280px;margin-bottom:14px}
.footer h4{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px}
.footer ul{list-style:none}
.footer ul li{margin-bottom:8px}
.footer ul a{color:var(--text2);font-size:13px}
.footer ul a:hover{color:var(--accent);opacity:1}
.footer-bottom{max-width:var(--max);margin:36px auto 0;padding-top:20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--text3)}

/* Feature row (alternating) */
.feature-row{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;margin-bottom:80px}
.feature-row:nth-child(even){direction:rtl}
.feature-row:nth-child(even) > *{direction:ltr}
@media(max-width:860px){.feature-row{grid-template-columns:1fr;gap:24px}.feature-row:nth-child(even){direction:ltr}}
.feature-row .visual{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;color:var(--accent);overflow:hidden}
.feature-row .visual img{width:100%;height:100%;object-fit:cover}
.feature-row .visual svg{width:64px;height:64px;stroke:currentColor;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.feature-row h2{font-family:var(--font-display);font-size:36px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px}
.feature-row p{font-size:15px;color:var(--text2);margin-bottom:14px;line-height:1.75}
.feature-row .tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:2px;color:var(--accent);text-transform:uppercase;margin-bottom:10px;padding:4px 10px;background:var(--accent-dim);border-radius:2px}

/* Steps */
.steps{display:grid;gap:16px;counter-reset:s}
.step{display:flex;gap:18px;align-items:flex-start;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.step::before{counter-increment:s;content:counter(s,decimal-leading-zero);font-family:var(--font-display);font-size:34px;color:var(--accent);min-width:48px;line-height:1;letter-spacing:1px}
.step h3{font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
.step p{font-size:14px;color:var(--text2);line-height:1.65}

/* Tabela */
.kv{width:100%;border-collapse:collapse;font-size:14px}
.kv th,.kv td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--border);color:var(--text2)}
.kv th{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent)}

/* World map (community) */
#world-map{height:420px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);overflow:hidden}
.map-legend{display:flex;gap:18px;flex-wrap:wrap;font-size:12px;color:var(--text3);margin-top:14px;letter-spacing:1px;text-transform:uppercase}
.map-legend .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent);margin-right:6px;vertical-align:middle;box-shadow:0 0 8px rgba(255,59,48,.6)}

/* Focus visibility */
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* LANG TOGGLE */
.lang-toggle{display:flex;align-items:center;background:var(--surface2);border:1px solid var(--border-mid);border-radius:3px;overflow:hidden;margin-left:10px;flex-shrink:0}
.lang-btn{font-size:11px;font-weight:700;letter-spacing:1px;padding:5px 9px;border:none;background:transparent;color:var(--text3);cursor:pointer;transition:all .15s;font-family:var(--font-body);line-height:1}
.lang-btn.active{background:var(--accent);color:#fff}
.lang-btn:hover:not(.active){color:var(--text)}
.nav-lang-mobile{display:none;margin-left:0;margin-top:6px}
@media(max-width:860px){.nav-lang-mobile{display:flex}}
`;

// Minify the inline stylesheet: strip CSS comments, collapse newlines and
// consecutive spaces. Keeps semantics unchanged.
const SHARED_CSS_MIN = SHARED_CSS
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s*\n\s*/g, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s*([{}:;,>])\s*/g, "$1")
  .trim();

function jsonldScript(jsonld?: object | object[]): string {
  if (!jsonld) return "";
  const arr = Array.isArray(jsonld) ? jsonld : [jsonld];
  return arr
    .map(
      (o) =>
        `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`,
    )
    .join("");
}

function navbar(currentPath: string): string {
  const link = (href: string, label: string, key: string) => {
    const active = href === currentPath ? ' aria-current="page"' : "";
    return `<a href="${href}"${active} data-i18n="${key}">${label}</a>`;
  };
  return `
<header class="navbar" role="banner">
  <div class="nav-inner">
    <a href="/" class="nav-logo" aria-label="BIKER·LINK home">BIKER<span class="dot">·</span>LINK</a>
    <button class="nav-burger" id="navBurger" aria-label="Menu" aria-controls="navLinks" aria-expanded="false"><span aria-hidden="true">☰</span><span class="sr-only">Menu</span></button>
    <nav id="navLinks" class="nav-links" aria-label="Navigazione principale">
      ${link("/features", "Funzionalità", "nav.features")}
      ${link("/sos", "SOS", "nav.sos")}
      ${link("/motoclub", "MotoClub", "nav.motoclub")}
      ${link("/community", "Community", "nav.community")}
      ${link("/about", "About", "nav.about")}
      ${link("/faq", "FAQ", "nav.faq")}
      <a href="/accedi?next=/pianifica" id="navPlannerLink" class="nav-planner-link" data-i18n="nav.planner">🤖 Pianifica Giro</a>
      <a href="/download" class="nav-cta" aria-label="Scarica app" data-i18n="nav.download">Scarica app</a>
      <div class="lang-toggle nav-lang-mobile" role="group" aria-label="Seleziona lingua">
        <button class="lang-btn" id="langIT_m" aria-pressed="true" onclick="setLang('it')">IT</button>
        <button class="lang-btn" id="langEN_m" aria-pressed="false" onclick="setLang('en')">EN</button>
      </div>
    </nav>
    <div class="lang-toggle" role="group" aria-label="Seleziona lingua">
      <button class="lang-btn" id="langIT" aria-pressed="true" onclick="setLang('it')">IT</button>
      <button class="lang-btn" id="langEN" aria-pressed="false" onclick="setLang('en')">EN</button>
    </div>
  </div>
</header>
<script>
(function(){
  var b=document.getElementById('navBurger'),n=document.getElementById('navLinks');
  if(b&&n){
    b.addEventListener('click',function(){
      var o=n.classList.toggle('open');
      b.setAttribute('aria-expanded',o?'true':'false');
    });
  }

  var T={
    it:{
      'nav.features':'Funzionalità','nav.sos':'SOS','nav.motoclub':'MotoClub',
      'nav.community':'Community','nav.about':'About','nav.faq':'FAQ',
      'nav.planner':'🤖 Pianifica Giro',
      'nav.download':'Scarica app',
      'footer.product':'Prodotto','footer.company':'Azienda','footer.legal':'Legale',
      'footer.features':'Funzionalità','footer.sos':'SOS Biker','footer.motoclub':'MotoClub',
      'footer.community':'Community','footer.dl':'Scarica l\'app',
      'footer.about':'Chi siamo','footer.faq':'Domande frequenti',
      'footer.contact':'Contatti','footer.investors':'Investitori',
      'footer.privacy':'Privacy Policy','footer.terms':'Termini di Servizio',
      'footer.delete':'Elimina account',
      'footer.tag':'La prima piattaforma verticale per motociclisti. Community, GPS live, MotoClub, SOS — gratis per sempre.',
      'footer.dl-btn':'Scarica l\'app',
      'footer.rights':'Tutti i diritti riservati.',
      'footer.tagline':'Made for riders, by riders.'
    },
    en:{
      'nav.features':'Features','nav.sos':'SOS','nav.motoclub':'MotoClub',
      'nav.community':'Community','nav.about':'About','nav.faq':'FAQ',
      'nav.planner':'🤖 AI Planner',
      'nav.download':'Download app',
      'footer.product':'Product','footer.company':'Company','footer.legal':'Legal',
      'footer.features':'Features','footer.sos':'SOS Biker','footer.motoclub':'MotoClub',
      'footer.community':'Community','footer.dl':'Download app',
      'footer.about':'About us','footer.faq':'FAQ',
      'footer.contact':'Contact','footer.investors':'Investors',
      'footer.privacy':'Privacy Policy','footer.terms':'Terms of Service',
      'footer.delete':'Delete account',
      'footer.tag':'The first vertical platform for motorcyclists. Community, live GPS, MotoClub, SOS — free forever.',
      'footer.dl-btn':'Download app',
      'footer.rights':'All rights reserved.',
      'footer.tagline':'Made for riders, by riders.'
    }
  };

  function applyLang(lang){
    var d=T[lang]||T.it;
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      var k=el.getAttribute('data-i18n');
      if(d[k]!==undefined) el.textContent=d[k];
    });
    var btnIT=document.getElementById('langIT'),btnEN=document.getElementById('langEN');
    if(btnIT&&btnEN){
      btnIT.classList.toggle('active',lang==='it');
      btnEN.classList.toggle('active',lang==='en');
      btnIT.setAttribute('aria-pressed',lang==='it'?'true':'false');
      btnEN.setAttribute('aria-pressed',lang==='en'?'true':'false');
    }
    var btnITm=document.getElementById('langIT_m'),btnENm=document.getElementById('langEN_m');
    if(btnITm&&btnENm){
      btnITm.classList.toggle('active',lang==='it');
      btnENm.classList.toggle('active',lang==='en');
      btnITm.setAttribute('aria-pressed',lang==='it'?'true':'false');
      btnENm.setAttribute('aria-pressed',lang==='en'?'true':'false');
    }
    document.documentElement.lang=lang==='en'?'en':'it';
  }

  window.setLang=function(lang){
    try{localStorage.setItem('bl_lang',lang);}catch(e){}
    applyLang(lang);
  };

  var saved;
  try{saved=localStorage.getItem('bl_lang');}catch(e){}
  applyLang(saved==='en'?'en':'it');

  // Upgrade planner link to /pianifica if already logged in
  var pl=document.getElementById('navPlannerLink');
  if(pl){
    fetch('/api/auth/me',{credentials:'include'}).then(function(r){
      if(r.ok) pl.setAttribute('href','/pianifica');
    }).catch(function(){});
  }
})();
</script>`;
}

function footer(): string {
  const year = new Date().getFullYear();
  return `
<footer class="footer" role="contentinfo">
  <div class="footer-inner">
    <div>
      <div class="footer-brand">BIKER<span class="dot">·</span>LINK</div>
      <p class="footer-tag" data-i18n="footer.tag">La prima piattaforma verticale per motociclisti. Community, GPS live, MotoClub, SOS — gratis per sempre.</p>
      <div class="btn-row" style="margin-top:8px">
        <a class="btn btn-primary" href="/download" data-i18n="footer.dl-btn">Scarica l'app</a>
      </div>
      <div style="margin-top:14px;display:flex;align-items:center;gap:16px">
        <a href="https://www.youtube.com/@Bikerlink-f4k" target="_blank" rel="noopener" aria-label="Canale YouTube BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#FF0000'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </a>
        <a href="https://www.instagram.com/bikerlink.app" target="_blank" rel="noopener" aria-label="Instagram BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#E1306C'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        </a>
        <a href="https://www.facebook.com/bikerlink" target="_blank" rel="noopener" aria-label="Pagina Facebook BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#1877F2'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.532-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
        </a>
        <a href="https://t.me/bikerlink" target="_blank" rel="noopener" aria-label="Canale Telegram BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#2AABEE'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
        </a>
        <a href="https://www.tiktok.com/@bikerlink" target="_blank" rel="noopener" aria-label="TikTok BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#010101'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.27 8.27 0 0 0 4.84 1.55V6.79a4.85 4.85 0 0 1-1.07-.1z"/></svg>
        </a>
        <a href="https://www.linkedin.com/company/bikerlink" target="_blank" rel="noopener" aria-label="LinkedIn BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#0A66C2'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        </a>
      </div>
    </div>
    <div>
      <h2 style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px" data-i18n="footer.product">Prodotto</h2>
      <ul>
        <li><a href="/features" data-i18n="footer.features">Funzionalità</a></li>
        <li><a href="/sos" data-i18n="footer.sos">SOS Biker</a></li>
        <li><a href="/motoclub" data-i18n="footer.motoclub">MotoClub</a></li>
        <li><a href="/community" data-i18n="footer.community">Community</a></li>
        <li><a href="/download" data-i18n="footer.dl">Scarica l'app</a></li>
      </ul>
    </div>
    <div>
      <h2 style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px" data-i18n="footer.company">Azienda</h2>
      <ul>
        <li><a href="/about" data-i18n="footer.about">Chi siamo</a></li>
        <li><a href="/faq" data-i18n="footer.faq">Domande frequenti</a></li>
        <li><a href="/contact" data-i18n="footer.contact">Contatti</a></li>
        <li><a href="/investors" data-i18n="footer.investors">Investitori</a></li>
      </ul>
    </div>
    <div>
      <h2 style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px" data-i18n="footer.legal">Legale</h2>
      <ul>
        <li><a href="/privacy" data-i18n="footer.privacy">Privacy Policy</a></li>
        <li><a href="/terms" data-i18n="footer.terms">Termini di Servizio</a></li>
        <li><a href="/delete-account" data-i18n="footer.delete">Elimina account</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${year} BikerLink. <span data-i18n="footer.rights">Tutti i diritti riservati.</span></span>
    <span data-i18n="footer.tagline">Made for riders, by riders.</span>
  </div>
</footer>`;
}

function musicBar(): string {
  const tracks = [
    { src: "/music/chill-road-1.mp3", label: "Chill Road #1" },
    { src: "/music/chill-road-2.mp3", label: "Chill Road #2" },
    { src: "/music/chill-road-3.mp3", label: "Chill Road #3" },
    { src: "/music/chill-road-4.mp3", label: "Chill Road #4" },
  ];
  const tracksJson = JSON.stringify(tracks);
  return `
<div class="music-bar" role="region" aria-label="Player musica ambient">
  <span class="music-bar-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
  </span>
  <span class="music-bar-track" id="musicTrackName">Chill Road #1</span>
  <button class="music-bar-btn play-btn" id="musicPlayBtn" aria-label="Play / Pausa" title="Play / Pausa">
    <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>
  </button>
  <button class="music-bar-btn mute-btn" id="musicMuteBtn" aria-label="Muto / Volume" title="Muto / Volume">
    <svg class="icon-volume" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    <svg class="icon-mute" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
  </button>
</div>
<script>
(function(){
  var TRACKS=${tracksJson};
  var idx=0,playing=false,muted=false;
  var audio=new Audio();
  audio.preload='none';

  var playBtn=document.getElementById('musicPlayBtn');
  var muteBtn=document.getElementById('musicMuteBtn');
  var trackName=document.getElementById('musicTrackName');

  function loadTrack(i){
    idx=i%TRACKS.length;
    audio.src=TRACKS[idx].src;
    if(trackName)trackName.textContent=TRACKS[idx].label;
  }

  function restoreState(){
    try{
      var s=JSON.parse(localStorage.getItem('bl_music')||'{}');
      idx=(s.idx||0)%TRACKS.length;
      muted=!!s.muted;
    }catch(e){idx=0;muted=false;}
    audio.muted=muted;
    if(muteBtn)muteBtn.classList.toggle('muted',muted);
    loadTrack(idx);
  }

  function saveState(){
    try{localStorage.setItem('bl_music',JSON.stringify({idx:idx,muted:muted}));}catch(e){}
  }

  function setPlaying(p){
    playing=p;
    if(playBtn)playBtn.classList.toggle('playing',playing);
  }

  audio.addEventListener('ended',function(){
    loadTrack(idx+1);
    audio.play().then(function(){setPlaying(true);}).catch(function(){setPlaying(false);});
    saveState();
  });

  if(playBtn){
    playBtn.addEventListener('click',function(){
      if(!playing){
        if(!audio.src||audio.src===''){loadTrack(idx);}
        audio.play().then(function(){setPlaying(true);saveState();}).catch(function(){setPlaying(false);});
      }else{
        audio.pause();
        setPlaying(false);
        saveState();
      }
    });
  }

  if(muteBtn){
    muteBtn.addEventListener('click',function(){
      muted=!muted;
      audio.muted=muted;
      muteBtn.classList.toggle('muted',muted);
      saveState();
    });
  }

  restoreState();
})();
</script>`;
}

export function renderPage(
  meta: PageMeta,
  bodyHtml: string,
  baseUrl: string,
): string {
  const url = `${baseUrl}${meta.path}`;
  const ogImage = meta.ogImage || `${baseUrl}/assets/images/playstore-icon.png`;
  const robots = meta.noindex ? "noindex, nofollow" : "index, follow";
  const titleSafe = meta.title.replace(/</g, "&lt;");
  const descSafe = meta.description.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titleSafe}</title>
<meta name="description" content="${descSafe}" />
<meta name="robots" content="${robots}" />
<meta name="theme-color" content="#0A0A0A" />
<link rel="canonical" href="${url}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<link rel="apple-touch-icon" href="/assets/images/playstore-icon.png" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="BikerLink" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${titleSafe}" />
<meta property="og:description" content="${descSafe}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:locale" content="it_IT" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${titleSafe}" />
<meta name="twitter:description" content="${descSafe}" />
<meta name="twitter:image" content="${ogImage}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>${SHARED_CSS_MIN}</style>
${meta.headExtras || ""}
${jsonldScript(meta.jsonld)}
</head>
<body>
<a class="skip-link" href="#main-content">Salta al contenuto</a>
${musicBar()}
${navbar(meta.path)}
<main id="main-content" role="main">
${bodyHtml}
</main>
${footer()}
</body>
</html>`;
}

export function organizationJsonLd(baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BikerLink",
    url: baseUrl,
    logo: `${baseUrl}/assets/images/playstore-icon.png`,
    email: "bikerlinkapp@gmail.com",
    sameAs: [],
    description:
      "Piattaforma verticale per motociclisti: community, GPS live, MotoClub, SOS e contest fotografici.",
  };
}

export function breadcrumbsJsonLd(
  baseUrl: string,
  items: { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${baseUrl}${it.path}`,
    })),
  };
}
