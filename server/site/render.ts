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

/* NAVBAR */
.navbar{position:fixed;top:0;left:0;right:0;z-index:1000;height:64px;display:flex;align-items:center;background:rgba(10,10,10,.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}
.nav-inner{max-width:var(--max);margin:0 auto;padding:0 24px;width:100%;display:flex;align-items:center;gap:24px}
.nav-logo{font-family:var(--font-display);font-size:24px;letter-spacing:2px;color:var(--text);display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:700}
.nav-logo .dot{color:var(--accent)}
.nav-links{display:flex;align-items:center;gap:22px;margin-left:auto}
.nav-links a{font-size:13px;font-weight:600;letter-spacing:.5px;color:var(--text);text-transform:uppercase}
.nav-links a:hover,.nav-links a[aria-current="page"]{color:var(--text);opacity:1}
.nav-cta{font-size:13px;font-weight:700;letter-spacing:1px;padding:9px 18px;background:var(--accent);color:#fff !important;border-radius:var(--radius);text-transform:uppercase}
.nav-cta:hover{background:var(--accent-hover);opacity:1 !important}
.nav-burger{display:none;background:none;border:1px solid var(--border-mid);color:var(--text);width:40px;height:36px;border-radius:var(--radius);font-size:18px;align-items:center;justify-content:center;margin-left:auto}
.nav-burger:focus{outline:2px solid var(--accent)}
@media(max-width:860px){
  .nav-links{display:none;position:absolute;top:64px;left:0;right:0;flex-direction:column;background:rgba(10,10,10,.98);padding:18px 24px;gap:14px;border-bottom:1px solid var(--border);align-items:flex-start}
  .nav-links.open{display:flex}
  .nav-burger{display:inline-flex}
  .nav-cta{margin-top:6px}
}

/* MAIN/SECTIONS */
main{padding-top:64px;min-height:60vh}
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
  const link = (href: string, label: string) => {
    const active = href === currentPath ? ' aria-current="page"' : "";
    return `<a href="${href}"${active}>${label}</a>`;
  };
  return `
<header class="navbar" role="banner">
  <div class="nav-inner">
    <a href="/" class="nav-logo" aria-label="BIKER·LINK home">BIKER<span class="dot">·</span>LINK</a>
    <button class="nav-burger" id="navBurger" aria-label="Menu" aria-controls="navLinks" aria-expanded="false"><span aria-hidden="true">☰</span><span class="sr-only">Menu</span></button>
    <nav id="navLinks" class="nav-links" aria-label="Navigazione principale">
      ${link("/features", "Funzionalità")}
      ${link("/sos", "SOS")}
      ${link("/motoclub", "MotoClub")}
      ${link("/community", "Community")}
      ${link("/about", "About")}
      ${link("/faq", "FAQ")}
      <a href="/download" class="nav-cta" aria-label="Scarica app">Scarica app</a>
    </nav>
  </div>
</header>
<script>
(function(){
  var b=document.getElementById('navBurger'),n=document.getElementById('navLinks');
  if(!b||!n)return;
  b.addEventListener('click',function(){
    var o=n.classList.toggle('open');
    b.setAttribute('aria-expanded',o?'true':'false');
  });
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
      <p class="footer-tag">La prima piattaforma verticale per motociclisti. Community, GPS live, MotoClub, SOS — gratis per sempre.</p>
      <div class="btn-row" style="margin-top:8px">
        <a class="btn btn-primary" href="/download">Scarica l'app</a>
      </div>
      <div style="margin-top:14px;display:flex;align-items:center;gap:16px">
        <a href="https://www.youtube.com/@Bikerlink-f4k" target="_blank" rel="noopener" aria-label="Canale YouTube BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#FF0000'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </a>
        <a href="https://www.instagram.com/bikerlink.app" target="_blank" rel="noopener" aria-label="Instagram BikerLink" style="display:inline-flex;align-items:center;color:var(--text3);text-decoration:none;transition:color .2s" onmouseover="this.style.color='#E1306C'" onmouseout="this.style.color='var(--text3)'">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
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
      <h2 style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px">Prodotto</h2>
      <ul>
        <li><a href="/features">Funzionalità</a></li>
        <li><a href="/sos">SOS Biker</a></li>
        <li><a href="/motoclub">MotoClub</a></li>
        <li><a href="/community">Community</a></li>
        <li><a href="/download">Scarica l'app</a></li>
      </ul>
    </div>
    <div>
      <h2 style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px">Azienda</h2>
      <ul>
        <li><a href="/about">Chi siamo</a></li>
        <li><a href="/faq">Domande frequenti</a></li>
        <li><a href="/contact">Contatti</a></li>
        <li><a href="/investors">Investitori</a></li>
      </ul>
    </div>
    <div>
      <h2 style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px">Legale</h2>
      <ul>
        <li><a href="/privacy">Privacy Policy</a></li>
        <li><a href="/terms">Termini di Servizio</a></li>
        <li><a href="/delete-account">Elimina account</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${year} BikerLink. Tutti i diritti riservati.</span>
    <span>Made for riders, by riders.</span>
  </div>
</footer>`;
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
