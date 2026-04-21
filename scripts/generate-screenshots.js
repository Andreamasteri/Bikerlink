#!/usr/bin/env node
/**
 * BikerLink — App Store Screenshot Generator
 * Generates 3 screens x 3 sizes = 9 PNG screenshots
 * Sizes: iPhone 6.5" (1284x2778), iPhone 5.5" (1242x2208), iPad 12.9" (2048x2732)
 * NOTE: No emoji used — relies only on vector shapes + Latin text for
 *       compatibility with the libvips/pango headless renderer.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'images', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [
  { name: '6.5inch', w: 1284, h: 2778 },
  { name: '5.5inch', w: 1242, h: 2208 },
  { name: 'ipad-12.9inch', w: 2048, h: 2732 },
];

const C = {
  bg:      '#0A0A0A',
  bg2:     '#141414',
  bg3:     '#1E1E1E',
  bg4:     '#282828',
  border:  '#2A2A2A',
  gold:    '#D4A017',
  goldLt:  '#E8B820',
  text:    '#EBEBEB',
  textSub: '#888888',
  blue:    '#4A9EFF',
  pink:    '#FF6B9D',
  green:   '#5CB85C',
  red:     '#E54545',
  orange:  '#FF8C00',
  purple:  '#9B59B6',
};

function e(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Rounded rect helper ──────────────────────────────────────────────────────
function rr(x, y, w, h, r, fill, stroke = 'none', sw = 0) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

// ─── Circle helper ────────────────────────────────────────────────────────────
function circle(cx, cy, r, fill) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

// ─── Text helper ──────────────────────────────────────────────────────────────
function txt(x, y, content, size, fill, anchor = 'start', weight = '400') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Liberation Sans, DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${size}" fill="${fill}" font-weight="${weight}">${e(content)}</text>`;
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function statusBar(w) {
  const top = 62;
  // Dynamic island pill
  const diPill = rr(w / 2 - 70, 10, 140, 36, 18, '#000000');
  // Time
  const time = txt(w / 2, top, '9:41', 30, C.text, 'middle', '600');
  // Signal bars
  let bars = '';
  [14, 20, 26, 32].forEach((bh, i) => {
    bars += rr(58 + i * 14, top - bh + 4, 9, bh, 2, C.text);
  });
  // WiFi arcs (simplified as three arcs)
  const wfx = w - 160;
  const wfy = top - 10;
  const wifi = `
    <path d="M${wfx - 22} ${wfy} Q${wfx} ${wfy - 28} ${wfx + 22} ${wfy}" stroke="${C.text}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M${wfx - 14} ${wfy + 8} Q${wfx} ${wfy - 12} ${wfx + 14} ${wfy + 8}" stroke="${C.text}" stroke-width="5" fill="none" stroke-linecap="round"/>
    ${circle(wfx, wfy + 18, 5, C.text)}
  `;
  // Battery
  const bx = w - 120;
  const by = top - 30;
  const battery = `
    ${rr(bx, by, 58, 26, 6, 'none', C.text, 3)}
    <rect x="${bx + 58}" y="${by + 8}" width="6" height="10" rx="2" fill="${C.text}"/>
    ${rr(bx + 3, by + 3, 46, 20, 4, C.green)}
  `;
  return `${diPill}${time}${bars}${wifi}${battery}`;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function tabBar(w, h, activeTab) {
  const labels = ['Mappa', 'Chat', 'Match', 'Contest', 'Profilo'];
  const keys   = ['map',   'chat', 'match', 'contest', 'profile'];
  const icons  = [
    // map — crosshair
    (cx, cy, col) => `<circle cx="${cx}" cy="${cy - 16}" r="18" fill="none" stroke="${col}" stroke-width="4"/>
      <line x1="${cx}" y1="${cy - 40}" x2="${cx}" y2="${cy + 8}" stroke="${col}" stroke-width="4"/>
      <line x1="${cx - 24}" y1="${cy - 16}" x2="${cx + 24}" y2="${cy - 16}" stroke="${col}" stroke-width="4"/>`,
    // chat — speech bubble
    (cx, cy, col) => `<rect x="${cx - 22}" y="${cy - 38}" width="44" height="32" rx="10" fill="${col}"/>
      <polygon points="${cx - 8},${cy - 8} ${cx + 8},${cy - 8} ${cx},${cy + 2}" fill="${col}"/>`,
    // match — flame
    (cx, cy, col) => `<path d="M${cx} ${cy + 4} Q${cx - 20} ${cy - 10} ${cx - 12} ${cy - 30} Q${cx - 4} ${cy - 10} ${cx} ${cy - 20} Q${cx + 4} ${cy - 38} ${cx + 20} ${cy - 38} Q${cx + 4} ${cy - 18} ${cx + 22} ${cy - 4} Q${cx + 14} ${cy - 18} ${cx} ${cy + 4}Z" fill="${col}"/>`,
    // contest — star
    (cx, cy, col) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 22 : 10;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${cx + Math.cos(a) * r},${cy - 18 + Math.sin(a) * r}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${col}"/>`;
    },
    // profile — person
    (cx, cy, col) => `${circle(cx, cy - 32, 14, col)}
      <path d="M${cx - 20} ${cy + 4} Q${cx - 20} ${cy - 12} ${cx} ${cy - 12} Q${cx + 20} ${cy - 12} ${cx + 20} ${cy + 4}" fill="${col}"/>`,
  ];

  const tabH = 130;
  const y = h - tabH;
  const tw = w / labels.length;
  let out = `${rr(0, y, w, tabH, 0, C.bg2)}
    <line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${C.border}" stroke-width="1"/>`;

  labels.forEach((label, i) => {
    const cx = tw * i + tw / 2;
    const isActive = keys[i] === activeTab;
    const col = isActive ? C.gold : C.textSub;
    const iconY = y + 58;
    out += icons[i](cx, iconY, col);
    out += txt(cx, y + 108, label, 22, col, 'middle', isActive ? '700' : '400');
    if (isActive) {
      out += rr(cx - 26, y - 5, 52, 5, 2.5, C.gold);
    }
  });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 1 — Mappa (Community Map)
// ─────────────────────────────────────────────────────────────────────────────
function svgMap(w, h) {
  const headerH = 270;
  const mapTop  = headerH;
  const mapH    = h - mapTop - 140;

  // Map background tiles
  let tiles = '';
  const ts = 200;
  for (let x = 0; x < w; x += ts) {
    for (let y = mapTop; y < mapTop + mapH; y += ts) {
      const shade = ((Math.floor(x / ts) + Math.floor((y - mapTop) / ts)) % 2 === 0) ? '#111111' : '#0D0D0D';
      tiles += rr(x, y, ts, ts, 0, shade);
    }
  }

  // Road lines
  const roads = `
    <line x1="0" y1="${mapTop + mapH * 0.30}" x2="${w}" y2="${mapTop + mapH * 0.33}" stroke="#222" stroke-width="18"/>
    <line x1="0" y1="${mapTop + mapH * 0.30}" x2="${w}" y2="${mapTop + mapH * 0.33}" stroke="#2A2A2A" stroke-width="8" stroke-dasharray="60,40"/>
    <line x1="${w * 0.46}" y1="${mapTop}" x2="${w * 0.50}" y2="${mapTop + mapH}" stroke="#1E1E1E" stroke-width="24"/>
    <line x1="${w * 0.46}" y1="${mapTop}" x2="${w * 0.50}" y2="${mapTop + mapH}" stroke="#2A2A2A" stroke-width="10" stroke-dasharray="60,40"/>
    <line x1="0" y1="${mapTop + mapH * 0.65}" x2="${w}" y2="${mapTop + mapH * 0.63}" stroke="#1A1A1A" stroke-width="12"/>
    <line x1="${w * 0.72}" y1="${mapTop}" x2="${w * 0.68}" y2="${mapTop + mapH}" stroke="#1A1A1A" stroke-width="14"/>
  `;

  // Rider pin
  function riderPin(cx, cy, color, name, sub) {
    return `
      <ellipse cx="${cx}" cy="${cy + 55}" rx="20" ry="7" fill="rgba(0,0,0,0.45)"/>
      ${circle(cx, cy, 40, color + '33')}
      ${circle(cx, cy, 28, color)}
      ${rr(cx - 4, cy - 12, 8, 16, 2, '#fff')}
      ${circle(cx, cy + 10, 4, '#fff')}
      ${rr(cx - 88, cy - 104, 176, 62, 14, C.bg3 + 'F5')}
      <polygon points="${cx - 10},${cy - 44} ${cx + 10},${cy - 44} ${cx},${cy - 30}" fill="${C.bg3}"/>
      ${txt(cx, cy - 76, name, 24, C.text, 'middle', '700')}
      ${txt(cx, cy - 52, sub,  22, C.textSub, 'middle', '400')}
    `;
  }

  const riders = `
    ${riderPin(Math.round(w * 0.22), Math.round(mapTop + mapH * 0.27), C.blue,  'Marco_B',   'Ducati Monster')}
    ${riderPin(Math.round(w * 0.70), Math.round(mapTop + mapH * 0.40), C.pink,  'Sofia_Z',   '2 km da te')}
    ${riderPin(Math.round(w * 0.14), Math.round(mapTop + mapH * 0.60), C.blue,  'Luca_R',    'Honda CBR')}
    ${riderPin(Math.round(w * 0.82), Math.round(mapTop + mapH * 0.22), C.green, 'MotoClub',  '12 membri')}
    ${riderPin(Math.round(w * 0.55), Math.round(mapTop + mapH * 0.70), C.orange,'SOS ALERT', '5 km')}
  `;

  // My position
  const myX = Math.round(w * 0.48);
  const myY = Math.round(mapTop + mapH * 0.50);
  const myPin = `
    ${circle(myX, myY, 46, C.gold + '26')}
    ${circle(myX, myY, 30, C.gold)}
    ${circle(myX, myY, 14, '#fff')}
    ${circle(myX, myY, 6,  C.gold)}
  `;

  // Header
  const header = `
    ${rr(0, 0, w, headerH, 0, C.bg2)}
    <line x1="0" y1="${headerH}" x2="${w}" y2="${headerH}" stroke="${C.border}" stroke-width="1"/>
    ${txt(58, 180, 'BikerLink', 56, C.gold, 'start', '800')}
    ${txt(58, 224, "La community dei motociclisti", 26, C.textSub, 'start', '400')}
    ${rr(w - 360, mapTop - 240, 132, 58, 29, C.blue + '33')}
    ${txt(w - 294, mapTop - 202, 'Biker', 24, C.blue, 'middle', '600')}
    ${rr(w - 218, mapTop - 240, 112, 58, 29, C.pink + '33')}
    ${txt(w - 162, mapTop - 202, 'Zav.', 24, C.pink, 'middle', '600')}
    ${rr(w - 96, mapTop - 240, 68, 58, 29, C.bg3)}
    ${txt(w - 62, mapTop - 202, '=', 28, C.textSub, 'middle', '700')}
  `;

  // Badge
  const badge = `
    ${rr(50, mapTop + mapH - 104, 310, 72, 36, C.bg3 + 'F5')}
    ${circle(95, mapTop + mapH - 68, 20, C.blue)}
    ${txt(124, mapTop + mapH - 58, '23 biker vicini', 26, C.text, 'start', '700')}
  `;

  // Caption
  const caption = `
    ${rr(0, h - 270, w, 130, 0, 'rgba(0,0,0,0.78)')}
    ${txt(w / 2, h - 220, 'Trova biker vicino a te', 36, C.gold, 'middle', '800')}
    ${txt(w / 2, h - 178, 'Mappa in tempo reale della community', 28, C.text, 'middle', '400')}
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${rr(0, 0, w, h, 0, C.bg)}
    ${tiles}${roads}${riders}${myPin}
    ${header}${badge}${caption}
    ${statusBar(w)}
    ${tabBar(w, h, 'map')}
  </svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 2 — Chat
// ─────────────────────────────────────────────────────────────────────────────
function svgChat(w, h) {
  const headerH = 280;
  const convs = [
    { initials: 'MB', name: 'Marco B.',    msg: 'Domani giro in Mugello?',         time: '10:42', unread: 2,  col: C.blue,   sub: 'Ducati Monster 937' },
    { initials: 'SZ', name: 'Sofia Z.',    msg: 'Grazie per il passaggio ieri!',   time: '09:18', unread: 0,  col: C.pink,   sub: 'Kawasaki Z900' },
    { initials: 'DC', name: 'Ducati Club', msg: 'Weekend: Firenze - Siena',        time: 'ieri',  unread: 5,  col: C.red,    sub: 'Gruppo  28 membri' },
    { initials: 'LR', name: 'Luca R.',     msg: 'Che moto hai nel garage?',        time: 'ieri',  unread: 0,  col: C.green,  sub: 'Honda CBR 600RR' },
    { initials: 'GP', name: 'Giulia P.',   msg: 'Ok per sabato! Ci vediamo 9:00',  time: 'lun',   unread: 0,  col: C.purple, sub: 'Yamaha R6' },
    { initials: 'RF', name: 'Roberto F.',  msg: 'Foto del Passo dello Stelvio',    time: 'dom',   unread: 0,  col: C.orange, sub: 'BMW GS 1250' },
  ];

  const itemH = Math.floor((h - headerH - 140) / convs.length);

  let convList = '';
  convs.forEach((c, i) => {
    const y  = headerH + i * itemH;
    const cx = 82;
    const cy = y + itemH / 2;
    convList += `
      ${rr(0, y, w, itemH, 0, i % 2 === 0 ? C.bg : C.bg2)}
      <line x1="110" y1="${y + itemH}" x2="${w - 40}" y2="${y + itemH}" stroke="${C.border}" stroke-width="1"/>
      ${circle(cx, cy, 50, c.col + '33')}
      ${circle(cx, cy, 38, c.col)}
      ${txt(cx, cy + 14, c.initials, 28, '#fff', 'middle', '700')}
      ${txt(168, cy - 24, c.name, 32, C.text, 'start', '700')}
      ${txt(w - 50, cy - 24, c.time, 24, C.textSub, 'end', '400')}
      ${txt(168, cy + 6,  c.sub,  22, C.gold, 'start', '400')}
      ${txt(168, cy + 36, c.msg.substring(0, 36) + (c.msg.length > 36 ? '...' : ''), 26, C.textSub, 'start', '400')}
      ${c.unread > 0 ? `${circle(w - 58, cy + 16, 24, C.gold)}${txt(w - 58, cy + 24, String(c.unread), 24, '#000', 'middle', '700')}` : ''}
    `;
  });

  const header = `
    ${rr(0, 0, w, headerH, 0, C.bg2)}
    <line x1="0" y1="${headerH}" x2="${w}" y2="${headerH}" stroke="${C.border}" stroke-width="1"/>
    ${txt(56, 164, 'Chat', 56, C.text, 'start', '800')}
    ${rr(50, 186, w - 100, 68, 34, C.bg3)}
    ${txt(104, 230, 'Cerca conversazione...', 28, C.textSub, 'start', '400')}
    ${circle(80, 220, 14, C.textSub + '66')}
    <line x1="70" y1="210" x2="90" y2="230" stroke="${C.textSub}" stroke-width="4" stroke-linecap="round"/>
  `;

  const caption = `
    ${rr(0, h - 270, w, 130, 0, 'rgba(0,0,0,0.78)')}
    ${txt(w / 2, h - 220, 'Connettiti con la community', 36, C.gold, 'middle', '800')}
    ${txt(w / 2, h - 178, 'Chat privata e gruppi MotoClub', 28, C.text, 'middle', '400')}
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${rr(0, 0, w, h, 0, C.bg)}
    ${header}${convList}${caption}
    ${statusBar(w)}
    ${tabBar(w, h, 'chat')}
  </svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 3 — Profilo
// ─────────────────────────────────────────────────────────────────────────────
function svgProfile(w, h) {
  // Section label helper
  function sec(x, y, label) {
    return `${rr(x, y, 190, 4, 2, C.gold)}
      ${txt(x, y + 44, label.toUpperCase(), 24, C.gold, 'start', '700')}`;
  }

  // Stat box
  function statBox(x, y, val, label) {
    const bw = Math.floor((w - 100 - 30) / 4);
    return `${rr(x, y, bw, 132, 18, C.bg3, C.border, 1)}
      ${txt(x + bw / 2, y + 72, val, 40, C.gold, 'middle', '800')}
      ${txt(x + bw / 2, y + 108, label, 22, C.textSub, 'middle', '400')}`;
  }

  // Person icon in avatar
  const avCx = w / 2;
  const avCy = 278;
  const personIcon = `
    ${circle(avCx, avCy - 22, 38, C.text + 'CC')}
    <path d="M${avCx - 52} ${avCy + 40} Q${avCx - 52} ${avCy - 4} ${avCx} ${avCy - 4} Q${avCx + 52} ${avCy - 4} ${avCx + 52} ${avCy + 40}" fill="${C.text + 'CC'}"/>
  `;

  const bw = Math.floor((w - 100 - 30) / 4);

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${rr(0, 0, w, h, 0, C.bg)}
    ${rr(0, 0, w, 530, 0, C.bg2)}

    <!-- Avatar -->
    ${circle(avCx, avCy, 102, C.bg3)}
    <circle cx="${avCx}" cy="${avCy}" r="102" fill="none" stroke="${C.gold}" stroke-width="5"/>
    ${personIcon}
    <!-- Verified badge -->
    ${circle(avCx + 74, avCy + 68, 30, C.bg2)}
    ${circle(avCx + 74, avCy + 68, 24, C.green)}
    <path d="M${avCx + 62} ${avCy + 68} L${avCx + 72} ${avCy + 79} L${avCx + 88} ${avCy + 58}" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

    <!-- Name + location -->
    ${txt(w / 2, 420, 'Marco Bianchi', 50, C.text, 'middle', '800')}
    ${txt(w / 2, 460, 'Firenze, Toscana', 28, C.textSub, 'middle', '400')}

    <!-- Action buttons -->
    ${rr(w / 2 - 240, 490, 220, 72, 36, C.gold)}
    ${txt(w / 2 - 130, 534, 'Scrivi', 30, '#000', 'middle', '700')}
    ${rr(w / 2 + 20, 490, 220, 72, 36, C.bg3, C.border, 1)}
    ${txt(w / 2 + 130, 534, 'Proponi giro', 26, C.text, 'middle', '600')}

    <!-- Stats row -->
    ${statBox(50, 590, '142', 'Giri')}
    ${statBox(50 + bw + 10, 590, '8.420', 'km totali')}
    ${statBox(50 + (bw + 10) * 2, 590, '4.9', 'Rating')}
    ${statBox(50 + (bw + 10) * 3, 590, '38', 'Match')}

    <!-- Garage section -->
    ${sec(50, 765, 'Il Garage')}
    ${rr(50, 812, w - 100, 180, 18, C.bg3, C.border, 1)}
    ${circle(118, 902, 44, C.bg4)}
    <path d="M88 910 Q118 888 148 910" stroke="${C.gold}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="100" cy="920" rx="10" ry="10" fill="${C.textSub}"/>
    <ellipse cx="136" cy="920" rx="10" ry="10" fill="${C.textSub}"/>
    ${txt(178, 878, 'Ducati Monster 937', 34, C.text, 'start', '700')}
    ${txt(178, 914, '2023   Rosso Ducati   Sport Naked', 24, C.textSub, 'start', '400')}
    ${txt(178, 950, '937 cc  |  111 cv  |  193 kg', 24, C.gold, 'start', '400')}

    ${rr(50, 1004, w - 100, 150, 18, C.bg3, C.border, 1)}
    ${circle(118, 1078, 44, C.bg4)}
    <path d="M88 1086 Q118 1064 148 1086" stroke="${C.green}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="100" cy="1096" rx="10" ry="10" fill="${C.textSub}"/>
    <ellipse cx="136" cy="1096" rx="10" ry="10" fill="${C.textSub}"/>
    ${txt(178, 1054, 'Kawasaki Z900 RS', 34, C.text, 'start', '700')}
    ${txt(178, 1090, '2021   Caffe   Neo Retro', 26, C.textSub, 'start', '400')}
    ${txt(178, 1124, '948 cc  |  111 cv  |  193 kg', 24, C.gold, 'start', '400')}

    <!-- Riding style -->
    ${sec(50, 1195, 'Stile di guida')}
    ${[['Montagna', C.blue], ['Autostrada', C.green], ['Rock / Metal', C.purple], ['Rilassato', C.gold], ['Touring', C.orange]].map(([tag, col], i) => {
      const tx = 50 + (i % 3) * 340;
      const ty = 1250 + Math.floor(i / 3) * 78;
      return `${rr(tx, ty, 316, 62, 31, col + '22', col, 1)}
        ${txt(tx + 158, ty + 42, tag, 24, col, 'middle', '600')}`;
    }).join('')}

    <!-- Last ride -->
    ${sec(50, 1440, 'Ultimo giro')}
    ${rr(50, 1490, w - 100, 210, 18, C.bg3, C.border, 1)}
    ${txt(100, 1546, 'Firenze  -  Siena via Chianti', 32, C.text, 'start', '700')}
    ${txt(100, 1584, 'Ieri   |   2h 15min   |   92 km', 26, C.textSub, 'start', '400')}
    ${txt(100, 1620, 'Vmax: 147 km/h   |   Avg: 61 km/h', 26, C.textSub, 'start', '400')}
    ${[55, 80, 60, 90, 70, 100, 85, 65, 95, 75].map((pct, i) =>
      rr(w - 300 + i * 26, 1690 - pct * 0.75, 20, pct * 0.75, 4, C.gold, 'none', 0)
    ).join('')}

    <!-- Caption -->
    ${rr(0, h - 270, w, 130, 0, 'rgba(0,0,0,0.78)')}
    ${txt(w / 2, h - 220, 'Il tuo profilo biker', 36, C.gold, 'middle', '800')}
    ${txt(w / 2, h - 178, 'Garage, statistiche e stile di guida', 28, C.text, 'middle', '400')}

    ${statusBar(w)}
    ${tabBar(w, h, 'profile')}
  </svg>`;

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate all screenshots
// ─────────────────────────────────────────────────────────────────────────────
const screens = [
  { key: '01-mappa',   svgFn: svgMap },
  { key: '02-chat',    svgFn: svgChat },
  { key: '03-profilo', svgFn: svgProfile },
];

async function generate() {
  const jobs = [];
  for (const size of SIZES) {
    for (const screen of screens) {
      const svg = screen.svgFn(size.w, size.h);
      const filename = `screenshot-${size.name}-${screen.key}.png`;
      const outPath = path.join(OUT_DIR, filename);
      jobs.push(
        sharp(Buffer.from(svg))
          .png({ compressionLevel: 9 })
          .toFile(outPath)
          .then(() => console.log(`  ${filename}`))
          .catch(err => console.error(`FAIL ${filename}: ${err.message}`))
      );
    }
  }
  await Promise.all(jobs);
  console.log('\nDone! Screenshots saved to assets/images/screenshots/');
}

generate();
