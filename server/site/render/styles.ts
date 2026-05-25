export const SHARED_CSS = /* css */ `
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
a{color:var(--accent);text-decoration:none;transition:opacity .15s,transform .1s}
@media (hover:hover) and (pointer:fine){a:hover{opacity:.82}}
a:active,button:active{transform:scale(.96);opacity:.85}
img,svg{display:block;max-width:100%;height:auto}
button{font:inherit;cursor:pointer}
.skip-link{position:absolute;left:-9999px;top:0;background:var(--accent);color:#fff;padding:10px 18px;font-weight:700;z-index:10000}
.skip-link:focus{left:8px;top:8px;opacity:1}

/* MUSIC BAR */
.music-bar{position:fixed;top:env(safe-area-inset-top);left:0;right:0;z-index:1001;height:40px;display:flex;align-items:center;gap:10px;padding:0 16px;background:rgba(8,8,8,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,59,48,.15)}
.music-bar-icon{color:var(--accent);display:flex;align-items:center;flex-shrink:0;opacity:.8}
.music-bar-icon svg{width:14px;height:14px;fill:currentColor}
.music-bar-track{font-size:13px;font-weight:600;letter-spacing:.5px;color:var(--text2);flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:var(--font-body)}
.music-bar-btn{background:none;border:1px solid rgba(255,255,255,.1);color:var(--text2);width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:border-color .15s,color .15s;padding:0;line-height:1}
@media (hover:hover) and (pointer:fine){.music-bar-btn:hover{border-color:var(--accent);color:var(--accent)}}
.music-bar-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.music-bar-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.music-bar-btn.play-btn svg.icon-play{display:block}.music-bar-btn.play-btn.playing svg.icon-play{display:none}
.music-bar-btn.play-btn svg.icon-pause{display:none}.music-bar-btn.play-btn.playing svg.icon-pause{display:block}
.music-bar-btn.mute-btn svg.icon-volume{display:block}.music-bar-btn.mute-btn.muted svg.icon-volume{display:none}
.music-bar-btn.mute-btn svg.icon-mute{display:none}.music-bar-btn.mute-btn.muted svg.icon-mute{display:block}
/* NAVBAR */
.navbar{position:fixed;top:calc(40px + env(safe-area-inset-top));left:0;right:0;z-index:1000;height:64px;display:flex;align-items:center;background:rgba(10,10,10,.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--border)}
.nav-inner{max-width:var(--max);margin:0 auto;padding:0 24px;width:100%;display:flex;align-items:center;gap:24px}
.nav-logo{font-family:var(--font-display);font-size:24px;letter-spacing:2px;color:var(--text);display:flex;align-items:center;gap:8px;white-space:nowrap;font-weight:700}
.nav-logo .dot{color:var(--accent)}
.nav-links{display:flex;align-items:center;gap:22px;margin-left:auto}
.nav-links a{font-size:14px;font-weight:600;letter-spacing:.5px;color:var(--text);text-transform:uppercase}
@media (hover:hover) and (pointer:fine){.nav-links a:hover{color:var(--text);opacity:1}}
.nav-links a[aria-current="page"]{color:var(--text);opacity:1}
.nav-cta{font-size:14px;font-weight:700;letter-spacing:1px;padding:12px 20px;background:var(--accent);color:#fff !important;border-radius:var(--radius);text-transform:uppercase;min-height:44px;display:inline-flex;align-items:center}
@media (hover:hover) and (pointer:fine){.nav-cta:hover{background:var(--accent-hover);opacity:1 !important}}
.nav-planner-link{color:var(--accent) !important;font-weight:700 !important}
@media (hover:hover) and (pointer:fine){.nav-planner-link:hover{opacity:.8 !important}}
.nav-burger{display:none;background:none;border:1px solid var(--border-mid);color:var(--text);width:44px;height:44px;border-radius:var(--radius);font-size:20px;align-items:center;justify-content:center;margin-left:auto}
.nav-burger:focus{outline:2px solid var(--accent)}
@media(max-width:860px){
  .nav-links{display:none;position:absolute;top:64px;left:0;right:0;flex-direction:column;background:rgba(10,10,10,.98);padding:18px 24px;gap:6px;border-bottom:1px solid var(--border);align-items:flex-start}
  .nav-links.open{display:flex}
  .nav-links a{padding:12px 4px;line-height:1.4;min-height:44px;display:flex;align-items:center;width:100%}
  .nav-burger{display:inline-flex}
  .nav-cta{margin-top:6px}
}

/* MAIN/SECTIONS */
main{padding-top:calc(104px + env(safe-area-inset-top));min-height:60vh}
.section{padding:80px 24px;position:relative}
.section-inner{max-width:var(--max);margin:0 auto}
.section.alt{background:var(--bg-alt);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.section-eyebrow{font-size:13px;font-weight:700;letter-spacing:3px;color:var(--accent);text-transform:uppercase;margin-bottom:14px;display:inline-flex;align-items:center;gap:10px}
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
.comp-highlight-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(255,59,48,.12);color:var(--accent);font-size:13px;font-weight:700;letter-spacing:1px;padding:3px 10px;border-radius:20px;margin-top:auto;align-self:flex-start}
.comp-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:12px;margin-top:12px}
.comp-table{width:100%;border-collapse:collapse;min-width:560px}
.comp-table th,.comp-table td{padding:12px 14px;text-align:center;font-size:13px;border-bottom:1px solid var(--border)}
.comp-table td:first-child,.comp-table th:first-child{text-align:left;font-weight:600;color:var(--text);white-space:nowrap}
.comp-table thead th{background:var(--surface);font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);position:sticky;top:0;z-index:1}
.comp-table thead th.col-bl{background:var(--accent);color:#fff;letter-spacing:1px}
.comp-table tbody tr:last-child td{border-bottom:none}
@media (hover:hover) and (pointer:fine){.comp-table tbody tr:hover td{background:rgba(255,255,255,.03)}}
.comp-table tbody td.col-bl{background:rgba(255,59,48,.07);font-weight:700;color:var(--text)}
.comp-cell-check{color:#30d158;font-size:15px}
.comp-cell-cross{color:var(--text3);opacity:.5;font-size:15px}
.comp-cell-partial{color:#ffd60a;font-size:15px}

/* HERO */
.page-hero{padding:120px 24px 60px;background:radial-gradient(ellipse 70% 55% at 50% 0%,rgba(255,59,48,.14) 0%,transparent 70%),var(--bg);text-align:center;border-bottom:1px solid var(--border)}
.page-hero h1{font-family:var(--font-display);font-size:clamp(48px,9vw,96px);line-height:.95;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px}
.page-hero h1 .accent{color:var(--accent)}
.page-hero p.lead{font-size:18px;color:var(--text2);max-width:660px;margin:0 auto 28px}
.page-hero .breadcrumb{font-size:13px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:24px}
.page-hero .breadcrumb a{color:var(--text3)}
@media (hover:hover) and (pointer:fine){.page-hero .breadcrumb a:hover{color:var(--text2)}}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 28px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:var(--radius);border:none;text-decoration:none;transition:transform .15s,box-shadow .15s,background .15s;font-family:var(--font-body);white-space:nowrap}
@media (hover:hover) and (pointer:fine){.btn:hover{transform:translateY(-2px);opacity:1}}
.btn-primary{background:var(--accent);color:#fff !important}
@media (hover:hover) and (pointer:fine){.btn-primary:hover{background:var(--accent-hover);box-shadow:0 6px 24px var(--accent-glow)}}
.btn-outline{background:transparent;color:var(--text);border:1px solid var(--border-mid)}
@media (hover:hover) and (pointer:fine){.btn-outline:hover{border-color:var(--accent);color:var(--accent)}}
.btn-row{display:flex;flex-wrap:wrap;gap:12px}

/* CARDS GRID */
.grid{display:grid;gap:20px}
.grid-2{grid-template-columns:repeat(2,1fr)}
.grid-3{grid-template-columns:repeat(3,1fr)}
.grid-4{grid-template-columns:repeat(4,1fr)}
@media(max-width:900px){.grid-3,.grid-4{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;transition:border-color .2s,transform .2s}
@media (hover:hover) and (pointer:fine){.card:hover{border-color:var(--border-mid);transform:translateY(-2px)}}
.card .icon{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);border:1px solid rgba(255,59,48,.25);border-radius:var(--radius);color:var(--accent);margin-bottom:16px}
.card .icon svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.card h3{font-family:var(--font-display);font-size:24px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;color:var(--text)}
.card p{font-size:14px;color:var(--text2);line-height:1.6}
.card .meta{margin-top:14px;font-size:13px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase}

/* STATS */
.stats-row{display:flex;flex-wrap:wrap;gap:32px;padding:24px;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--radius)}
.stat{flex:1;min-width:140px;text-align:center}
.stat-value{font-family:var(--font-display);font-size:42px;letter-spacing:2px;color:var(--accent);line-height:1}
.stat-label{font-size:13px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-top:6px}

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
.footer h4{font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin-bottom:14px}
.footer ul{list-style:none}
.footer ul li{margin-bottom:8px}
.footer ul a{color:var(--text2);font-size:13px}
@media (hover:hover) and (pointer:fine){.footer ul a:hover{color:var(--accent);opacity:1}}
.footer-bottom{max-width:var(--max);margin:36px auto 0;padding-top:20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--text3)}

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
.feature-row .tag{display:inline-block;font-size:13px;font-weight:700;letter-spacing:2px;color:var(--accent);text-transform:uppercase;margin-bottom:10px;padding:4px 10px;background:var(--accent-dim);border-radius:2px}

/* Steps */
.steps{display:grid;gap:16px;counter-reset:s}
.step{display:flex;gap:18px;align-items:flex-start;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.step::before{counter-increment:s;content:counter(s,decimal-leading-zero);font-family:var(--font-display);font-size:34px;color:var(--accent);min-width:48px;line-height:1;letter-spacing:1px}
.step h3{font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
.step p{font-size:14px;color:var(--text2);line-height:1.65}

/* Tabela */
.kv{width:100%;border-collapse:collapse;font-size:14px}
.kv th,.kv td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--border);color:var(--text2)}
.kv th{font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent)}

/* World map (community) */
#world-map{height:420px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);overflow:hidden}
.map-legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--text3);margin-top:14px;letter-spacing:1px;text-transform:uppercase}
.map-legend .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent);margin-right:6px;vertical-align:middle;box-shadow:0 0 8px rgba(255,59,48,.6)}

/* Focus visibility */
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* LANG TOGGLE */
.lang-toggle{display:flex;align-items:center;background:var(--surface2);border:1px solid var(--border-mid);border-radius:3px;overflow:hidden;margin-left:10px;flex-shrink:0}
.lang-btn{font-size:13px;font-weight:700;letter-spacing:1px;padding:14px 14px;border:none;background:transparent;color:var(--text3);cursor:pointer;transition:all .15s;font-family:var(--font-body);line-height:1;min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center}
.lang-btn.active{background:var(--accent);color:#fff}
@media (hover:hover) and (pointer:fine){.lang-btn:hover:not(.active){color:var(--text)}}
.nav-lang-mobile{display:none;margin-left:0;margin-top:6px}
@media(max-width:860px){.nav-lang-mobile{display:flex}}
`;
