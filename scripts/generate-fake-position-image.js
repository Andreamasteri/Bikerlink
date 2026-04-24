const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const W = 1600, H = 1100;

function lines(cx, startY, lineHeight, arr, fontSize, color, weight) {
  weight = weight || 'normal';
  return arr.map((t, i) =>
    `<text x="${cx}" y="${startY + i * lineHeight}"
      font-family="DejaVu Sans" font-size="${fontSize}" font-weight="${weight}"
      fill="${color}" text-anchor="middle">${t}</text>`
  ).join('\n  ');
}

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="90" result="blur"/>
    </filter>
  </defs>

  <!-- ── BACKGROUND ── -->
  <rect width="${W}" height="${H}" fill="#0D0D0D"/>

  <!-- Red glow blobs top-left -->
  <ellipse cx="180" cy="160" rx="520" ry="380" fill="#CC2200" opacity="0.55" filter="url(#glow)"/>
  <ellipse cx="60" cy="60" rx="250" ry="200" fill="#FF3300" opacity="0.35" filter="url(#glow)"/>

  <!-- ── TITLE ── -->
  <text x="${W / 2}" y="100"
    font-family="DejaVu Sans" font-size="72" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">Posizione Fake &#x2013; Quando Usarla</text>

  <!-- Thin horizontal rule under title -->
  <line x1="60" y1="138" x2="${W - 60}" y2="138" stroke="#3A3A3A" stroke-width="1"/>

  <!-- ── VERTICAL SEPARATORS ── -->
  <line x1="533" y1="155" x2="533" y2="${H - 60}" stroke="#4A4A4A" stroke-width="1"/>
  <line x1="1067" y1="155" x2="1067" y2="${H - 60}" stroke="#4A4A4A" stroke-width="1"/>


  <!-- ═══════════════════════════════════════════════
       COLUMN 1  (cx=267) — SHIELD (quartered)
       Icon center: (267, 360)
       ═══════════════════════════════════════════════ -->

  <!-- Outer shield body (filled red) -->
  <path d="M 267,260
    C 252,255 197,272 197,315
    C 197,360 215,420 267,450
    C 319,420 337,360 337,315
    C 337,272 282,255 267,260 Z"
    fill="#C0392B"/>

  <!-- Quadrant dividers (dark lines across the shield) -->
  <line x1="267" y1="262" x2="267" y2="448" stroke="#1A1A1A" stroke-width="5"/>
  <line x1="199" y1="355" x2="335" y2="355" stroke="#1A1A1A" stroke-width="5"/>

  <!-- Top-right and bottom-left quadrants slightly darker for depth -->
  <path d="M 267,260 C 282,255 337,272 337,315 C 337,335 330,350 267,355 L 267,260 Z"
    fill="#A93226" opacity="0.6"/>
  <path d="M 267,355 C 247,355 215,375 197,400 C 202,425 230,440 267,450 L 267,355 Z"
    fill="#A93226" opacity="0.6"/>

  <!-- Column 1 text -->
  ${lines(267, 510, 44, [
    'Usa la posizione Fake per',
    'proteggere la tua privacy',
    'in casa, Ufficio',
    'e Luoghi sensibili'
  ], 34, '#FFFFFF')}


  <!-- ═══════════════════════════════════════════════
       COLUMN 2  (cx=800) — HOUSE + SHIELD OVERLAY
       Icon center: (800, 360)
       ═══════════════════════════════════════════════ -->

  <!-- House: roof (triangle) -->
  <polygon points="800,245 700,340 900,340" fill="#C0392B"/>

  <!-- House: chimney -->
  <rect x="840" y="255" width="28" height="55" fill="#C0392B"/>

  <!-- House: walls -->
  <rect x="710" y="335" width="180" height="130" fill="#C0392B"/>

  <!-- House: door (dark) -->
  <rect x="775" y="390" width="50" height="75" rx="4" fill="#1A1A1A"/>

  <!-- Small shield overlay bottom-right of house -->
  <path d="M 878,350
    C 872,348 850,354 850,370
    C 850,385 860,395 878,400
    C 896,395 906,385 906,370
    C 906,354 884,348 878,350 Z"
    fill="#E74C3C" stroke="#1A1A1A" stroke-width="2"/>

  <!-- Shield inner check mark -->
  <polyline points="864,372 873,381 893,362"
    fill="none" stroke="#1A1A1A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Column 2 text -->
  ${lines(800, 510, 44, [
    'Non far sapere',
    'agli altri',
    'dove vivi'
  ], 34, '#FFFFFF')}


  <!-- ═══════════════════════════════════════════════
       COLUMN 3  (cx=1333) — BIKER + MAP + BIKERLINK
       ═══════════════════════════════════════════════ -->

  <!-- Biker: helmet/head -->
  <ellipse cx="1333" cy="248" rx="26" ry="24" fill="#C0392B"/>
  <!-- Visor strip -->
  <rect x="1313" y="255" width="40" height="9" rx="4" fill="#1A1A1A"/>

  <!-- Body: torso leaning forward -->
  <line x1="1333" y1="272" x2="1310" y2="315" stroke="#C0392B" stroke-width="11" stroke-linecap="round"/>

  <!-- Handlebar arm -->
  <line x1="1310" y1="315" x2="1282" y2="300" stroke="#C0392B" stroke-width="9" stroke-linecap="round"/>
  <line x1="1282" y1="300" x2="1272" y2="285" stroke="#C0392B" stroke-width="7" stroke-linecap="round"/>

  <!-- Seat / pedal leg -->
  <line x1="1333" y1="272" x2="1358" y2="320" stroke="#C0392B" stroke-width="9" stroke-linecap="round"/>
  <line x1="1358" y1="320" x2="1380" y2="340" stroke="#C0392B" stroke-width="8" stroke-linecap="round"/>

  <!-- Rear frame -->
  <line x1="1310" y1="315" x2="1295" y2="365" stroke="#C0392B" stroke-width="7" stroke-linecap="round"/>
  <line x1="1333" y1="272" x2="1295" y2="365" stroke="#C0392B" stroke-width="5" stroke-linecap="round"/>

  <!-- Chain stay to rear wheel -->
  <line x1="1310" y1="315" x2="1380" y2="365" stroke="#C0392B" stroke-width="6" stroke-linecap="round"/>

  <!-- Front fork -->
  <line x1="1282" y1="300" x2="1245" y2="360" stroke="#C0392B" stroke-width="7" stroke-linecap="round"/>

  <!-- Front wheel -->
  <circle cx="1245" cy="365" r="42" fill="none" stroke="#C0392B" stroke-width="9"/>
  <circle cx="1245" cy="365" r="10" fill="#C0392B"/>

  <!-- Rear wheel -->
  <circle cx="1380" cy="365" r="42" fill="none" stroke="#C0392B" stroke-width="9"/>
  <circle cx="1380" cy="365" r="10" fill="#C0392B"/>

  <!-- Speed lines (motion) -->
  <line x1="1230" y1="280" x2="1175" y2="280" stroke="#C0392B" stroke-width="4" opacity="0.7" stroke-linecap="round"/>
  <line x1="1225" y1="300" x2="1160" y2="300" stroke="#C0392B" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
  <line x1="1230" y1="318" x2="1170" y2="318" stroke="#C0392B" stroke-width="2" opacity="0.4" stroke-linecap="round"/>

  <!-- Column 3 text -->
  ${lines(1333, 490, 44, [
    'Ricordati di disattivarla',
    'all\'occorrenza!'
  ], 34, '#FFFFFF')}

  <!-- ── BIKERLINK LOGO AREA (bottom-right, col 3) ── -->
  <!-- Map icon -->
  <!-- Map fold shape -->
  <polygon points="1248,720 1308,700 1368,720 1368,790 1308,770 1248,790"
    fill="#D4B896" stroke="#C0392B" stroke-width="2"/>
  <!-- Map crease line -->
  <line x1="1308" y1="700" x2="1308" y2="770" stroke="#C0392B" stroke-width="2" opacity="0.5"/>
  <line x1="1278" y1="710" x2="1278" y2="780" stroke="#C0392B" stroke-width="1" opacity="0.3"/>
  <line x1="1338" y1="710" x2="1338" y2="780" stroke="#C0392B" stroke-width="1" opacity="0.3"/>
  <!-- Pin on map -->
  <circle cx="1308" cy="730" r="12" fill="#C0392B"/>
  <line x1="1308" y1="742" x2="1308" y2="758" stroke="#C0392B" stroke-width="5" stroke-linecap="round"/>

  <!-- BikerLink text -->
  <text x="1333" y="830"
    font-family="DejaVu Sans" font-size="42" font-weight="bold"
    fill="#FFFFFF" text-anchor="middle">BikerLink</text>

</svg>`;

async function main() {
  const outPath = path.join('attached_assets', '03-posizione-fake-quando_corrected.png');
  fs.mkdirSync('attached_assets', { recursive: true });

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  console.log(`Generated: ${outPath} (${meta.width}x${meta.height})`);
}

main().catch(err => { console.error(err); process.exit(1); });
