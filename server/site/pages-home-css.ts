const HOME_CSS = `<style>
/* ── HERO PHOTO ──────────────────────────────────────────── */
.home-hero{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0}
.home-hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 30%;z-index:0}
.home-hero-overlay{position:absolute;inset:0;background:linear-gradient(160deg,rgba(5,5,5,0.72) 0%,rgba(10,10,10,0.55) 50%,rgba(5,5,5,0.80) 100%);z-index:1}
.home-hero-inner{position:relative;z-index:2;text-align:center;padding:100px 24px 80px;max-width:900px;margin:0 auto}
.home-hero-eyebrow{font-size:13px;font-weight:700;letter-spacing:4px;color:rgba(255,59,48,.9);text-transform:uppercase;margin-bottom:20px;display:flex;align-items:center;justify-content:center;gap:10px}
.home-hero-eyebrow::before,.home-hero-eyebrow::after{content:"";display:block;width:32px;height:1px;background:var(--accent);opacity:.7}
.home-hero-title{font-family:var(--font-display);font-size:clamp(72px,14vw,140px);line-height:.88;letter-spacing:6px;text-transform:uppercase;color:#fff;margin-bottom:8px;font-weight:900}
.home-hero-title .dot{color:var(--accent)}
.home-hero-sub{font-family:var(--font-display);font-size:clamp(18px,3.5vw,34px);letter-spacing:8px;color:rgba(240,240,240,.7);text-transform:uppercase;margin-bottom:28px;font-weight:600}
.home-hero-desc{font-size:17px;color:rgba(240,240,240,.75);max-width:580px;margin:0 auto 40px;line-height:1.75}
.home-hero-btns{display:flex;flex-wrap:wrap;gap:14px;justify-content:center}
.home-hero-scroll{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);z-index:2;display:flex;flex-direction:column;align-items:center;gap:8px;color:rgba(255,255,255,.35);font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase}
.home-hero-scroll span{width:1px;height:48px;background:linear-gradient(to bottom,rgba(255,255,255,.3),transparent);display:block}

/* ── STATS BAR ───────────────────────────────────────────── */
.home-stats{background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:0}
.home-stats-inner{max-width:var(--max);margin:0 auto;display:flex;flex-wrap:wrap}
.home-stat{flex:1;min-width:160px;padding:28px 24px;text-align:center;border-right:1px solid var(--border)}
.home-stat:last-child{border-right:none}
.home-stat-val{font-family:var(--font-display);font-size:40px;letter-spacing:2px;color:var(--accent);line-height:1;margin-bottom:6px}
.home-stat-lbl{font-size:13px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase}

/* ── SECOND SCENE ────────────────────────────────────────── */
.home-split{display:grid;grid-template-columns:1fr 1fr;min-height:88vh;overflow:hidden;border-bottom:1px solid var(--border)}
.home-split-content{display:flex;flex-direction:column;justify-content:center;padding:80px 60px 80px 80px;background:var(--bg)}
.home-split-eyebrow{font-size:13px;font-weight:700;letter-spacing:4px;color:var(--accent);text-transform:uppercase;margin-bottom:22px;display:flex;align-items:center;gap:10px}
.home-split-eyebrow::before{content:"";display:block;width:28px;height:1px;background:var(--accent)}
.home-split-title{font-family:var(--font-display);font-size:clamp(52px,7.5vw,96px);line-height:.9;letter-spacing:4px;text-transform:uppercase;color:var(--text);font-weight:900;margin-bottom:28px}
.home-split-title .accent{color:var(--accent)}
.home-split-body{font-size:17px;color:var(--text2);line-height:1.75;max-width:440px;margin-bottom:40px}
.home-split-btns{display:flex;flex-wrap:wrap;gap:12px}
.home-split-photo{position:relative;overflow:hidden}
.home-split-photo img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}
.home-split-photo::before{content:"";position:absolute;inset:0;background:linear-gradient(to right,var(--bg) 0%,transparent 28%);z-index:1;pointer-events:none}
@media(max-width:860px){
  .home-split{grid-template-columns:1fr;min-height:auto}
  .home-split-photo{aspect-ratio:16/9}
  .home-split-content{padding:52px 24px}
  .home-split-photo::before{background:linear-gradient(to bottom,var(--bg) 0%,transparent 18%)}
}

/* ── USERTYPE CARDS ──────────────────────────────────────── */
.home-who{padding:80px 24px;background:var(--bg-alt);border-bottom:1px solid var(--border)}
.home-who-inner{max-width:var(--max);margin:0 auto}
.home-who-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:48px}
.home-who-card{position:relative;aspect-ratio:3/4;overflow:hidden;cursor:pointer}
.home-who-card img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s cubic-bezier(.25,.46,.45,.94)}
@media (hover:hover) and (pointer:fine){.home-who-card:hover img{transform:scale(1.06)}}
.home-who-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(5,5,5,.95) 0%,rgba(5,5,5,.45) 45%,rgba(5,5,5,.15) 100%);transition:background .3s}
@media (hover:hover) and (pointer:fine){.home-who-card:hover .home-who-overlay{background:linear-gradient(to top,rgba(5,5,5,.98) 0%,rgba(5,5,5,.55) 50%,rgba(5,5,5,.2) 100%)}}
.home-who-num{position:absolute;top:20px;left:20px;font-family:var(--font-display);font-size:13px;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,.35);z-index:1}
.home-who-body{position:absolute;bottom:0;left:0;right:0;padding:28px 24px;z-index:1}
.home-who-label{font-size:13px;font-weight:700;letter-spacing:3px;color:var(--accent);text-transform:uppercase;margin-bottom:8px}
.home-who-name{font-family:var(--font-display);font-size:32px;letter-spacing:2px;text-transform:uppercase;color:#fff;margin-bottom:10px;font-weight:800}
.home-who-desc{font-size:13px;color:rgba(240,240,240,.65);line-height:1.6;max-height:0;overflow:hidden;transition:max-height .35s ease,opacity .35s}
@media (hover:hover) and (pointer:fine){.home-who-card:hover .home-who-desc{max-height:80px}}
@media(max-width:768px){.home-who-grid{grid-template-columns:1fr}.home-who-card{aspect-ratio:4/3}}

/* ── TELEMETRY / RACE MODE ───────────────────────────────── */
.home-tele{padding:0;overflow:hidden;border-bottom:1px solid var(--border)}
.home-tele-inner{display:grid;grid-template-columns:1fr 1fr;max-width:var(--max);margin:0 auto;min-height:560px}
.home-tele-content{padding:72px 60px;display:flex;flex-direction:column;justify-content:center;background:var(--bg-alt)}
.home-tele-photo{position:relative;overflow:hidden}
.home-tele-photo img{width:100%;height:100%;object-fit:cover;display:block}
.home-tele-photo::before{content:"";position:absolute;inset:0;background:linear-gradient(to left,rgba(5,5,5,0) 60%,var(--bg-alt) 100%);z-index:1;pointer-events:none}
@media(max-width:860px){
  .home-tele-inner{grid-template-columns:1fr}
  .home-tele-photo{aspect-ratio:16/9}
  .home-tele-content{padding:48px 24px}
  .home-tele-photo::before{background:linear-gradient(to bottom,rgba(5,5,5,0) 60%,var(--bg-alt) 100%)}
}

/* ── CONTEST PHOTO GRID ──────────────────────────────────── */
.home-contest{padding:80px 24px;background:var(--bg);border-bottom:1px solid var(--border)}
.home-contest-inner{max-width:var(--max);margin:0 auto}
.home-contest-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:48px}
.home-contest-card{position:relative;aspect-ratio:3/4;overflow:hidden;border:1px solid var(--border);transition:border-color .25s,transform .3s;border-radius:2px}
@media (hover:hover) and (pointer:fine){.home-contest-card:hover{border-color:rgba(255,59,48,.4);transform:translateY(-4px)}}
.home-contest-card img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s}
@media (hover:hover) and (pointer:fine){.home-contest-card:hover img{transform:scale(1.05)}}
.home-contest-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(5,5,5,.9) 0%,rgba(5,5,5,.3) 50%,transparent 100%)}
.home-contest-meta{position:absolute;bottom:0;left:0;right:0;padding:16px;display:flex;align-items:center;justify-content:space-between;z-index:1}
.home-contest-author{font-size:13px;font-weight:700;letter-spacing:.5px;color:rgba(240,240,240,.9)}
.home-contest-likes{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:var(--accent)}
.home-contest-rank{position:absolute;top:12px;left:12px;background:rgba(10,10,10,.85);border:1px solid rgba(255,255,255,.14);border-radius:2px;padding:4px 10px;font-size:13px;font-weight:700;letter-spacing:2px;color:rgba(240,240,240,.7);text-transform:uppercase;backdrop-filter:blur(8px);z-index:1}
.home-contest-rank.gold{border-color:rgba(255,215,0,.4);color:#FFD700}
.home-contest-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.home-contest-tag{font-size:13px;font-weight:700;letter-spacing:1px;color:var(--text3);background:var(--surface2);border:1px solid var(--border);padding:4px 12px;border-radius:2px;white-space:nowrap}
@media(max-width:768px){
  .home-contest-grid{grid-template-columns:1fr}
  .home-contest-card{aspect-ratio:16/9}
}

/* ── TELEMETRY METRICS ───────────────────────────────────── */
.home-tele-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;margin-top:28px;background:var(--border)}
.home-tele-metric{background:var(--surface);padding:20px 14px;text-align:center}
.home-tele-metric-val{font-family:var(--font-display);font-size:36px;letter-spacing:2px;color:var(--accent);line-height:1;font-weight:900}
.home-tele-metric-unit{font-size:13px;font-weight:700;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-top:2px}
.home-tele-metric-lbl{font-size:13px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-top:6px}
@media(max-width:860px){.home-tele-metrics{grid-template-columns:repeat(2,1fr)}}

/* ── BTN GHOST ───────────────────────────────────────────── */
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border-mid);font-size:13px;font-weight:700;letter-spacing:1px;padding:14px 28px;border-radius:var(--radius);display:inline-flex;align-items:center;gap:10px;text-transform:uppercase;text-decoration:none;transition:border-color .2s,color .2s,transform .15s}
@media (hover:hover) and (pointer:fine){.btn-ghost:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px);opacity:1}}

/* ── CARD IMAGE ──────────────────────────────────────────── */
.card .card-img{width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:calc(var(--radius) + 1px);margin-bottom:16px}
.card .card-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
@media (hover:hover) and (pointer:fine){.card:hover .card-img img{transform:scale(1.04)}}

/* ── MATCHING SECTION ────────────────────────────────────── */
.home-matching{padding:80px 24px;background:var(--bg-alt);border-bottom:1px solid var(--border)}
.home-matching-inner{max-width:var(--max);margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center}
.home-matching-signals{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:28px}
.home-matching-signal{background:var(--surface2);border:1px solid var(--border);border-radius:3px;padding:12px 10px;display:flex;align-items:center;gap:8px;transition:border-color .2s}
@media (hover:hover) and (pointer:fine){.home-matching-signal:hover{border-color:rgba(255,59,48,.35)}}
.home-matching-signal-icon{font-size:16px;flex-shrink:0}
.home-matching-signal-name{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text2)}
@media(max-width:860px){.home-matching-inner{grid-template-columns:1fr;gap:36px}.home-matching-signals{grid-template-columns:1fr 1fr 1fr}}
@media(max-width:560px){.home-matching-signals{grid-template-columns:1fr 1fr}}

/* ── AI TRIP PLANNING ────────────────────────────────────── */
.home-ai-plan{padding:0;overflow:hidden;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--surface)}
.home-ai-plan-inner{display:grid;grid-template-columns:1fr 1fr;max-width:var(--max);margin:0 auto;min-height:560px}
.home-ai-plan-photo{position:relative;overflow:hidden;order:1}
.home-ai-plan-photo img{width:100%;height:100%;object-fit:cover;display:block}
.home-ai-plan-photo::after{content:"";position:absolute;inset:0;background:linear-gradient(to right,rgba(18,18,18,0) 55%,var(--surface) 100%);pointer-events:none}
.home-ai-plan-content{order:2;padding:72px 60px 72px 52px;display:flex;flex-direction:column;justify-content:center;background:var(--surface)}
.home-ai-plan-title{font-family:var(--font-display);font-size:clamp(38px,5.5vw,68px);line-height:.95;letter-spacing:2px;text-transform:uppercase;color:var(--text);margin:16px 0 22px;font-weight:900}
.home-ai-plan-title strong{color:var(--accent);font-weight:900}
.home-ai-plan-body{font-size:16px;color:var(--text2);line-height:1.75;max-width:440px;margin-bottom:28px}
.home-ai-plan-features{list-style:none;display:flex;flex-direction:column;gap:12px;margin-bottom:4px}
.home-ai-plan-features li{font-size:14px;color:var(--text2);display:flex;align-items:flex-start;gap:10px;line-height:1.5}
.home-ai-plan-check{color:var(--accent);font-weight:900;font-size:15px;flex-shrink:0;margin-top:1px}
@media(max-width:860px){
  .home-ai-plan-inner{grid-template-columns:1fr}
  .home-ai-plan-photo{order:0;aspect-ratio:16/9}
  .home-ai-plan-photo::after{background:linear-gradient(to bottom,rgba(18,18,18,0) 55%,var(--surface) 100%)}
  .home-ai-plan-content{order:1;padding:48px 24px}
}
</style>`;

export default HOME_CSS;
