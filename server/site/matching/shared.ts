// ── SHARED MATCHING CSS ────────────────────────────────────────────────────────
export const MATCHING_CSS = `<style>
/* ── MATCHING HERO ── */
.match-hero{padding:120px 24px 64px;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(255,59,48,.18) 0%,transparent 70%),var(--bg);text-align:center;border-bottom:1px solid var(--border)}
.match-hero-eyebrow{font-size:13px;font-weight:700;letter-spacing:4px;color:var(--accent);text-transform:uppercase;margin-bottom:20px;display:inline-flex;align-items:center;gap:10px}
.match-hero-eyebrow::before,.match-hero-eyebrow::after{content:"";display:block;width:28px;height:1px;background:var(--accent)}
.match-hero h1{font-family:var(--font-display);font-size:clamp(48px,9vw,96px);line-height:.93;letter-spacing:4px;text-transform:uppercase;margin-bottom:20px}
.match-hero h1 .accent{color:var(--accent)}
.match-hero .lead{font-size:18px;color:var(--text2);max-width:680px;margin:0 auto 32px;line-height:1.75}
.match-breadcrumb{font-size:13px;letter-spacing:2px;color:var(--text3);text-transform:uppercase;margin-bottom:28px}
.match-breadcrumb a{color:var(--text3)}
@media (hover:hover) and (pointer:fine){.match-breadcrumb a:hover{color:var(--text2)}}

/* ── PROMISE CARDS ── */
.match-promises{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:48px}
@media(max-width:720px){.match-promises{grid-template-columns:1fr}}
.match-promise{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 24px;text-align:left;transition:border-color .2s}
@media (hover:hover) and (pointer:fine){.match-promise:hover{border-color:rgba(255,59,48,.35)}}
.match-promise-icon{font-size:28px;margin-bottom:14px}
.match-promise-title{font-family:var(--font-display);font-size:20px;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:8px}
.match-promise-desc{font-size:14px;color:var(--text2);line-height:1.6}

/* ── STATS ROW ── */
.match-stats{display:flex;flex-wrap:wrap;background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.match-stat{flex:1;min-width:160px;padding:28px 24px;text-align:center;border-right:1px solid var(--border)}
.match-stat:last-child{border-right:none}
.match-stat-val{font-family:var(--font-display);font-size:40px;letter-spacing:2px;color:var(--accent);line-height:1;margin-bottom:6px}
.match-stat-lbl{font-size:13px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase}
@media(max-width:640px){.match-stat{min-width:50%;border-right:none;border-bottom:1px solid var(--border)}.match-stat:last-child{border-bottom:none}}

/* ── STEP FLOW ── */
.match-flow{display:grid;gap:0;counter-reset:flow}
.match-step{display:grid;grid-template-columns:80px 1fr;gap:24px;align-items:flex-start;padding:36px 0;border-bottom:1px solid var(--border)}
.match-step:last-child{border-bottom:none}
.match-step-num{font-family:var(--font-display);font-size:56px;letter-spacing:2px;color:var(--accent);line-height:1;opacity:.6;text-align:center;padding-top:6px}
.match-step-body h3{font-family:var(--font-display);font-size:22px;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:10px}
.match-step-body p{font-size:15px;color:var(--text2);line-height:1.75;max-width:560px}
@media(max-width:600px){.match-step{grid-template-columns:50px 1fr;gap:14px}.match-step-num{font-size:36px}}

/* ── TYPES GRID ── */
.match-types-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:36px}
.match-type-card{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:20px 18px;display:flex;gap:14px;align-items:flex-start;transition:border-color .2s,transform .2s}
@media (hover:hover) and (pointer:fine){.match-type-card:hover{border-color:rgba(255,59,48,.35);transform:translateY(-2px)}}
.match-type-icon{font-size:22px;flex-shrink:0;line-height:1;margin-top:2px}
.match-type-name{font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:4px}
.match-type-desc{font-size:13px;color:var(--text2);line-height:1.5}

/* ── DECAY CHART ── */
.match-decay-chart{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:24px;margin:28px 0}
.match-decay-svg{width:100%;max-width:600px;height:180px;display:block;margin:0 auto}

/* ── AI TABLE ── */
.match-ai-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:4px;margin-top:24px}
.match-ai-table{width:100%;border-collapse:collapse;min-width:560px;font-size:14px}
.match-ai-table th,.match-ai-table td{padding:12px 16px;border-bottom:1px solid var(--border);text-align:left}
.match-ai-table thead th{background:var(--surface);font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3)}
.match-ai-table tbody tr:last-child td{border-bottom:none}
@media (hover:hover) and (pointer:fine){.match-ai-table tbody tr:hover td{background:rgba(255,255,255,.025)}}
.match-ai-table td:first-child{font-weight:600;color:var(--text)}
.match-ai-badge{display:inline-block;background:rgba(255,59,48,.12);color:var(--accent);font-size:11px;font-weight:700;letter-spacing:1px;padding:2px 8px;border-radius:2px;text-transform:uppercase}

/* ── KPI CARDS (investors) ── */
.match-kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}
@media(max-width:640px){.match-kpi-grid{grid-template-columns:1fr 1fr}}
.match-kpi{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:4px;padding:20px 18px;text-align:center}
.match-kpi-val{font-family:var(--font-display);font-size:36px;letter-spacing:2px;color:var(--accent);line-height:1;margin-bottom:4px}
.match-kpi-lbl{font-size:12px;font-weight:700;letter-spacing:2px;color:var(--text3);text-transform:uppercase;line-height:1.4}

/* ── AI BRAIN CARDS ── */
.match-ai-brains{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin:28px 0}
.match-ai-brain{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:22px 20px;transition:border-color .2s}
@media (hover:hover) and (pointer:fine){.match-ai-brain:hover{border-color:rgba(255,59,48,.35)}}
.match-ai-brain-icon{font-size:28px;margin-bottom:10px}
.match-ai-brain-title{font-family:var(--font-display);font-size:18px;letter-spacing:1px;text-transform:uppercase;color:var(--text);margin-bottom:6px}
.match-ai-brain-desc{font-size:13px;color:var(--text2);line-height:1.6}

/* ── SUB-NAV ── */
.match-subnav{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch}
.match-subnav-inner{max-width:var(--max);margin:0 auto;display:flex;gap:0}
.match-subnav a{display:inline-flex;align-items:center;padding:14px 18px;font-size:13px;font-weight:600;letter-spacing:.5px;color:var(--text3);text-decoration:none;text-transform:uppercase;border-bottom:2px solid transparent;transition:color .15s,border-color .15s;white-space:nowrap}
@media (hover:hover) and (pointer:fine){.match-subnav a:hover{color:var(--text)}}
.match-subnav a.active{color:var(--accent);border-color:var(--accent)}

/* ── PRIVACY LIST ── */
.match-privacy-list{list-style:none;display:flex;flex-direction:column;gap:10px;margin:20px 0}
.match-privacy-item{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;background:var(--surface);border:1px solid var(--border);border-radius:4px;font-size:14px;color:var(--text2);line-height:1.6}
.match-privacy-item .pi-icon{font-size:18px;flex-shrink:0;margin-top:1px}
.match-privacy-item strong{color:var(--text)}

/* ── ARCH DIAGRAM ── */
.match-arch{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:28px 24px;margin:24px 0;text-align:center}
.match-arch svg{max-width:640px;width:100%;height:auto}

/* ── PAGE IMG ── */
.match-page-img{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:4px;border:1px solid var(--border);margin:24px 0;display:block}
.match-page-img-sm{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;border:1px solid var(--border);margin:20px 0;display:block}
</style>`;

// ── SUB-NAV ───────────────────────────────────────────────────────────────────
export function matchSubnav(current: string): string {
  const links = [
    { href: "/matching", label: "Overview", i18n: "match.nav.overview" },
    { href: "/matching/come-funziona", label: "Come funziona", i18n: "match.nav.how" },
    { href: "/matching/tipi-di-match", label: "I 17 tipi", i18n: "match.nav.types" },
    { href: "/matching/come-impara", label: "Come impara", i18n: "match.nav.learn" },
    { href: "/matching/intelligenza-artificiale", label: "AI", i18n: "match.nav.ai" },
    { href: "/matching/privacy", label: "Privacy", i18n: "match.nav.privacy" },
    { href: "/matching/per-investitori", label: "Investitori", i18n: "match.nav.investors" },
  ];
  return `
<nav class="match-subnav" aria-label="Sezioni matching">
  <div class="match-subnav-inner">
    ${links.map(l => `<a href="${l.href}"${l.href === current ? ' class="active" aria-current="page"' : ''} data-i18n="${l.i18n}">${l.label}</a>`).join("")}
  </div>
</nav>`;
}

// ── PAGE 1: OVERVIEW (/matching) ──────────────────────────────────────────────
