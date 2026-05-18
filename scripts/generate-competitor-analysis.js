const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ORANGE = '#FF6B35';
const DARK_BLUE = '#1A1A2E';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F5F5F5';
const DARK_GRAY = '#333333';
const MID_GRAY = '#888888';
const GREEN = '#2ECC71';
const RED = '#E74C3C';
const YELLOW = '#F39C12';

const OUTPUT_DIR = path.join(__dirname, '..', 'server', 'public');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ASSETS_DIR = path.join(OUTPUT_DIR, 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const competitors = ['BikerLink', 'Calimoto', 'Kurviger', 'Wheelo', 'Motobit', 'Motoplanner'];

const comparisonData = [
  {
    feature: 'Routing curvy',
    values: ['✓ GraphHopper self-hosted', '✓ Proprietario su GH', '✓ GraphHopper', '✓ Google Maps', '✓ Proprietario OSM', '✗ Basic only'],
    checks: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  },
  {
    feature: 'Round trip automatico',
    values: ['✓', '✓', '✓ max 300km', '✗', '✓', '✗'],
    checks: ['yes', 'yes', 'partial', 'no', 'yes', 'no'],
  },
  {
    feature: 'AI linguaggio naturale',
    values: ['✓ Gemini Flash (gratis)', '✗', '✗', '✗', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'no', 'no', 'no'],
  },
  {
    feature: 'Meteo sul percorso',
    values: ['✓ Open-Meteo (gratis)', '✗', '✗', '✓ 5 giorni', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'partial', 'no', 'no'],
  },
  {
    feature: 'POI lungo percorso',
    values: ['✓ Overpass (gratis)', '~ Limitato', '✓', '✓', '~ Pagamento', '✓ Passi montagna'],
    checks: ['yes', 'partial', 'yes', 'yes', 'partial', 'partial'],
  },
  {
    feature: 'Giri multi-giorno',
    values: ['✓ Auto-suddivisione', '✗', '✗', '✗', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'no', 'no', 'no'],
  },
  {
    feature: 'Sensori lean angle',
    values: ['✓ già in app', '✗', '✗', '✗', '✓ Premium', '✗'],
    checks: ['yes', 'no', 'no', 'no', 'partial', 'no'],
  },
  {
    feature: 'Social matching',
    values: ['✓ Auto-match bikers', '✗', '✗', '✓ Base', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'partial', 'no', 'no'],
  },
  {
    feature: 'GPX import/export',
    values: ['✓', '✓', '✓', '✓ Premium', '✓', '✓'],
    checks: ['yes', 'yes', 'yes', 'partial', 'yes', 'yes'],
  },
  {
    feature: 'Mappe offline',
    values: ['✓ PMTiles (gratis)', '✓', '✓ Premium', '✗', '✗', '✗'],
    checks: ['yes', 'yes', 'partial', 'no', 'no', 'no'],
  },
  {
    feature: 'CarPlay/Android Auto',
    values: ['→ Roadmap', '✓ Premium', '✓ Premium', '✗', '✓', '✗'],
    checks: ['partial', 'partial', 'partial', 'no', 'partial', 'no'],
  },
  {
    feature: 'BikerScore / curvy score',
    values: ['✓ BikerScore custom', '✓', '✗', '✗', '✗', '✗'],
    checks: ['yes', 'yes', 'no', 'no', 'no', 'no'],
  },
  {
    feature: 'Costo per utente',
    values: ['GRATIS', '€34.99/anno', '€30/anno', 'Freemium', '€29.99/anno', 'Freemium'],
    checks: ['yes', 'no', 'no', 'partial', 'no', 'partial'],
  },
  {
    feature: 'Costo infrastruttura',
    values: ['~€20/mese', 'Alto (segreto)', 'Alto', 'Alto', 'Alto', 'Medio'],
    checks: ['yes', 'no', 'no', 'no', 'no', 'partial'],
  },
];

const stackData = [
  { layer: 'Motore routing', choice: 'GraphHopper self-hosted', cost: '€0 (open source)' },
  { layer: 'Dati OSM', choice: 'Geofabrik download', cost: '€0 (open data)' },
  { layer: 'Profilo curvy', choice: 'motorcycle_curvy.json custom', cost: '€0' },
  { layer: 'AI linguaggio naturale', choice: 'Gemini 1.5 Flash', cost: '€0 (free tier)' },
  { layer: 'Mappe display', choice: 'OpenFreeMap + MapLibre GL', cost: '€0 (no key)' },
  { layer: 'Meteo', choice: 'Open-Meteo', cost: '€0 (no key)' },
  { layer: 'POI / hotel', choice: 'Overpass API (OSM)', cost: '€0 (no key)' },
  { layer: 'Geocoding', choice: 'Nominatim (OSM)', cost: '€0' },
  { layer: 'Hosting routing server', choice: 'Hetzner CPX41 (Europa)', cost: '~€20/mese' },
  { layer: 'TOTALE MENSILE', choice: '', cost: '~€20/mese' },
];

const differentiators = [
  { num: '01', title: 'AI in linguaggio naturale', desc: '"Portami su strade curvy verso il Lago di Garda con 3 ore di tempo" → percorso generato automaticamente con Gemini Flash.' },
  { num: '02', title: 'Auto-matching integrato', desc: 'Il giro pianificato trova automaticamente bikers nella zona con moto e preferenze compatibili.' },
  { num: '03', title: 'Sensori reali già integrati', desc: 'Lean angle, G-force, velocità curva già nell\'app → alimentano il curvy score reale, non simulato.' },
  { num: '04', title: 'Giri multi-giorno completi', desc: 'Suddivisione automatica tappe + hotel OSM + meteo tappa per tappa, tutto in un unico click.' },
  { num: '05', title: 'Livello carburante serbatoio', desc: 'Calcola le soste benzina in base al livello reale, non solo l\'autonomia teorica del modello.' },
  { num: '06', title: 'BikerScore proprietario', desc: 'Curvy score arricchito con dati reali dei giri registrati dagli utenti BikerLink, non solo geometria.' },
  { num: '07', title: 'Tutto gratis', desc: 'Nessun abbonamento per le funzioni base. Infrastruttura completa a ~€20/mese, non migliaia.' },
];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

async function generatePDF() {
  console.log('Generating PDF...');
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: 'BikerLink — Analisi Competitiva Route Planning Moto',
      Author: 'BikerLink',
      Subject: 'Confronto competitor route planning moto 2026',
    },
  });

  const outputPath = path.join(ASSETS_DIR, 'competitor-analysis.pdf');
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const W = 595.28;
  const H = 841.89;
  const MARGIN = 40;
  const CONTENT_W = W - MARGIN * 2;

  function fillPage(color) {
    doc.rect(0, 0, W, H).fill(color);
  }

  function drawHeader(title, subtitle) {
    doc.rect(0, 0, W, 70).fill(DARK_BLUE);
    doc.rect(0, 0, 6, 70).fill(ORANGE);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(11).text('BIKERLINK', MARGIN, 22, { width: CONTENT_W });
    doc.fillColor(WHITE).font('Helvetica').fontSize(9).text(subtitle || '', MARGIN, 38, { width: CONTENT_W });
    doc.moveDown(0);
  }

  function drawFooter(pageNum, totalPages) {
    doc.rect(0, H - 40, W, 40).fill(DARK_BLUE);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(8).text('© 2026 BikerLink', MARGIN, H - 25, { width: 200 });
    doc.fillColor(WHITE).font('Helvetica').fontSize(8).text(`Pagina ${pageNum} di ${totalPages}`, W - MARGIN - 80, H - 25, { width: 80, align: 'right' });
    doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('Riservato — non distribuire senza autorizzazione', 0, H - 25, { width: W, align: 'center' });
  }

  function sectionTitle(text, y) {
    doc.rect(MARGIN, y, 4, 16).fill(ORANGE);
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(13).text(text, MARGIN + 12, y, { width: CONTENT_W });
    return y + 26;
  }

  // ---- PAGE 1: COVER ----
  fillPage(DARK_BLUE);
  doc.rect(0, 0, W, 8).fill(ORANGE);
  doc.rect(0, H - 8, W, 8).fill(ORANGE);

  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(36).text('BIKERLINK', 0, 160, { align: 'center', width: W });
  doc.fillColor(WHITE).font('Helvetica').fontSize(13).text('ROUTE PLANNING', 0, 205, { align: 'center', width: W });

  doc.rect(MARGIN, 235, CONTENT_W, 3).fill(ORANGE);

  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(26).text('Analisi Competitiva', 0, 255, { align: 'center', width: W });
  doc.fillColor(WHITE).font('Helvetica').fontSize(22).text('Route Planning Moto 2026', 0, 290, { align: 'center', width: W });

  doc.rect(MARGIN, 330, CONTENT_W, 2).fill(ORANGE);

  const badgeItems = [
    { icon: '✓', text: '6 competitor analizzati' },
    { icon: '✓', text: 'Stack tecnico a costo zero' },
    { icon: '✓', text: '7 differenziatori esclusivi' },
  ];
  let badgeY = 355;
  badgeItems.forEach((item) => {
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(14).text(item.icon, 0, badgeY, { align: 'center', width: W });
    doc.fillColor(WHITE).font('Helvetica').fontSize(11).text('  ' + item.text, 0, badgeY, { align: 'center', width: W });
    badgeY += 28;
  });

  doc.rect(MARGIN, 455, CONTENT_W, 1).fill(ORANGE);

  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(28).text('€20/mese', 0, 475, { align: 'center', width: W });
  doc.fillColor(WHITE).font('Helvetica').fontSize(12).text('Costo totale infrastruttura routing', 0, 512, { align: 'center', width: W });
  doc.fillColor(WHITE).font('Helvetica').fontSize(10).text('vs. migliaia di euro/mese dei competitor', 0, 530, { align: 'center', width: W });

  doc.rect(MARGIN, 565, CONTENT_W, 1).fill(ORANGE);

  doc.fillColor(WHITE).font('Helvetica').fontSize(9).text('Documento preparato per uso interno e presentazioni investitori', 0, 590, { align: 'center', width: W });
  doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8).text('maggio 2026 — Riservato', 0, 610, { align: 'center', width: W });

  // ---- PAGE 2: TABELLA COMPARATIVA ----
  doc.addPage();
  fillPage(WHITE);
  drawHeader('CONFRONTO FUNZIONALITÀ', 'Tabella comparativa — BikerLink vs 5 competitor');

  let y = 80;
  y = sectionTitle('Confronto Funzionalità', y);
  y += 6;

  const colWidths = [160, 60, 60, 60, 60, 60, 60];
  const colX = [MARGIN];
  for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);

  const headerColors = [DARK_BLUE, DARK_BLUE, DARK_BLUE, DARK_BLUE, DARK_BLUE, DARK_BLUE, DARK_BLUE];
  const headerTexts = ['Funzione', ...competitors];

  headerTexts.forEach((text, i) => {
    const bgColor = i === 1 ? ORANGE : DARK_BLUE;
    doc.rect(colX[i], y, colWidths[i], 22).fill(bgColor);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(6.5).text(text, colX[i] + 3, y + 7, { width: colWidths[i] - 6, align: 'center' });
  });
  y += 22;

  const rowHeight = 20;
  comparisonData.forEach((row, rowIdx) => {
    const bg = rowIdx % 2 === 0 ? '#F8F8F8' : WHITE;
    doc.rect(MARGIN, y, CONTENT_W, rowHeight).fill(bg);

    doc.fillColor(DARK_GRAY).font('Helvetica-Bold').fontSize(6.5).text(row.feature, colX[0] + 3, y + 6, { width: colWidths[0] - 6 });

    row.checks.forEach((check, ci) => {
      const cx = colX[ci + 1];
      const isFirst = ci === 0;
      if (isFirst) {
        const iconColor = check === 'yes' ? GREEN : check === 'partial' ? YELLOW : RED;
        const symbol = check === 'yes' ? '✓' : check === 'partial' ? '~' : '✗';
        doc.fillColor(iconColor).font('Helvetica-Bold').fontSize(8).text(symbol, cx, y + 6, { width: colWidths[ci + 1], align: 'center' });
        doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(5).text(row.values[0].replace(/[✓✗~→⚠️]/g, '').trim().slice(0, 22), cx, y + 13, { width: colWidths[ci + 1], align: 'center' });
      } else {
        const iconColor = check === 'yes' ? GREEN : check === 'partial' ? YELLOW : RED;
        const symbol = check === 'yes' ? '✓' : check === 'partial' ? '~' : '✗';
        doc.fillColor(iconColor).font('Helvetica-Bold').fontSize(9).text(symbol, cx, y + 5, { width: colWidths[ci + 1], align: 'center' });
      }
    });

    doc.rect(MARGIN, y + rowHeight - 0.5, CONTENT_W, 0.5).fill('#EEEEEE');
    y += rowHeight;
  });

  doc.rect(MARGIN, 80, CONTENT_W, y - 80).lineWidth(0.5).stroke(DARK_BLUE);

  y += 12;
  doc.fillColor(MID_GRAY).font('Helvetica').fontSize(7).text('✓ Disponibile  ~ Parziale/Premium  ✗ Non disponibile', MARGIN, y, { width: CONTENT_W });

  drawFooter(2, 6);

  // ---- PAGE 3: STACK TECNICO ----
  doc.addPage();
  fillPage(WHITE);
  drawHeader('STACK TECNICO', 'Infrastruttura routing a costo zero');

  y = 80;
  y = sectionTitle('Stack Tecnico a Costo Zero', y);
  y += 10;

  doc.roundedRect(MARGIN, y, CONTENT_W, 50, 6).fill(DARK_BLUE);
  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(22).text('~€20/mese', MARGIN + 20, y + 8, { width: 200 });
  doc.fillColor(WHITE).font('Helvetica').fontSize(10).text('Costo totale infrastruttura', MARGIN + 20, y + 33, { width: 200 });
  doc.fillColor(WHITE).font('Helvetica').fontSize(10).text('vs. centinaia/migliaia €/mese dei competitor', MARGIN + 200, y + 20, { width: CONTENT_W - 220 });
  y += 68;

  const stackColW = [160, 230, 90];
  const stackColX = [MARGIN, MARGIN + 160, MARGIN + 390];
  const stackHeaders = ['Layer', 'BikerLink (scelta)', 'Costo'];
  stackHeaders.forEach((h, i) => {
    doc.rect(stackColX[i], y, stackColW[i], 20).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8).text(h, stackColX[i] + 4, y + 6, { width: stackColW[i] - 8 });
  });
  y += 20;

  stackData.forEach((row, ri) => {
    const isLast = ri === stackData.length - 1;
    const bg = isLast ? DARK_BLUE : ri % 2 === 0 ? '#F5F5F5' : WHITE;
    const textColor = isLast ? WHITE : DARK_GRAY;
    const costColor = isLast ? ORANGE : row.cost === '€0' || row.cost.startsWith('€0') ? GREEN : ORANGE;

    doc.rect(MARGIN, y, CONTENT_W, 22).fill(bg);
    doc.fillColor(isLast ? ORANGE : DARK_GRAY).font(isLast ? 'Helvetica-Bold' : 'Helvetica-Bold').fontSize(8).text(row.layer, stackColX[0] + 4, y + 7, { width: stackColW[0] - 8 });
    doc.fillColor(textColor).font('Helvetica').fontSize(7.5).text(row.choice, stackColX[1] + 4, y + 7, { width: stackColW[1] - 8 });
    doc.fillColor(costColor).font('Helvetica-Bold').fontSize(8).text(row.cost, stackColX[2] + 4, y + 7, { width: stackColW[2] - 8, align: 'right' });
    if (!isLast) doc.rect(MARGIN, y + 21.5, CONTENT_W, 0.5).fill('#DDDDDD');
    y += 22;
  });

  y += 20;
  y = sectionTitle('Provider Mappe Gratuiti', y);
  y += 10;

  const mapsData = [
    { name: 'OpenFreeMap', tiles: '∞ illimitati', key: 'No', commercial: 'Sì', note: 'SCELTA BikerLink — zero limiti, zero costi' },
    { name: 'Protomaps PMTiles', tiles: 'Self-hosted ∞', key: 'No', commercial: 'Sì', note: 'Offline-first, hosting S3' },
    { name: 'MapTiler', tiles: '100k/mese', key: 'Sì', commercial: 'Limitato', note: 'Tiles di qualità, facile setup' },
    { name: 'Thunderforest', tiles: '150k/mese', key: 'Sì', commercial: 'Limitato', note: 'Stile outdoor/cycling' },
    { name: 'Google Maps', tiles: '$200 credito', key: 'Sì', commercial: 'Sì', note: 'Costoso a scala' },
    { name: 'Mapbox', tiles: '50k loads/mese', key: 'Sì', commercial: 'Limitato', note: 'Costoso a scala' },
  ];
  const mapsColW = [100, 75, 45, 55, 200];
  const mapsColX = [MARGIN, MARGIN + 100, MARGIN + 175, MARGIN + 220, MARGIN + 275];
  const mapsHeaders = ['Provider', 'Tile gratuiti', 'API key', 'Commerciale', 'Note'];
  mapsHeaders.forEach((h, i) => {
    doc.rect(mapsColX[i], y, mapsColW[i], 18).fill(DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7).text(h, mapsColX[i] + 3, y + 5, { width: mapsColW[i] - 6 });
  });
  y += 18;

  mapsData.forEach((row, ri) => {
    const isTop = ri < 2;
    const bg = isTop ? '#F0FFF4' : ri % 2 === 0 ? '#F8F8F8' : WHITE;
    doc.rect(MARGIN, y, CONTENT_W, 18).fill(bg);
    doc.fillColor(isTop ? GREEN : DARK_GRAY).font('Helvetica-Bold').fontSize(7).text(row.name, mapsColX[0] + 3, y + 5, { width: mapsColW[0] - 6 });
    doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(7).text(row.tiles, mapsColX[1] + 3, y + 5, { width: mapsColW[1] - 6 });
    doc.fillColor(row.key === 'No' ? GREEN : RED).font('Helvetica-Bold').fontSize(7).text(row.key === 'No' ? 'Non serve' : 'Richiesta', mapsColX[2] + 3, y + 5, { width: mapsColW[2] - 6 });
    doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(7).text(row.commercial, mapsColX[3] + 3, y + 5, { width: mapsColW[3] - 6 });
    doc.fillColor(isTop ? GREEN : MID_GRAY).font('Helvetica').fontSize(6.5).text(row.note, mapsColX[4] + 3, y + 5, { width: mapsColW[4] - 6 });
    doc.rect(MARGIN, y + 17.5, CONTENT_W, 0.5).fill('#EEEEEE');
    y += 18;
  });

  drawFooter(3, 6);

  // ---- PAGE 4: 7 DIFFERENZIATORI ----
  doc.addPage();
  fillPage(WHITE);
  drawHeader('DIFFERENZIATORI', 'Funzioni che solo BikerLink ha');

  y = 80;
  y = sectionTitle('7 Cose Che Solo BikerLink Ha', y);
  y += 10;

  differentiators.forEach((item, i) => {
    const cardH = 68;
    doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 4).fill(i % 2 === 0 ? '#F9F9F9' : WHITE);
    doc.roundedRect(MARGIN, y, 50, cardH, 4).fill(ORANGE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(18).text(item.num, MARGIN, y + 20, { width: 50, align: 'center' });
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(10).text(item.title, MARGIN + 58, y + 10, { width: CONTENT_W - 68 });
    doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(8.5).text(item.desc, MARGIN + 58, y + 27, { width: CONTENT_W - 68 });
    y += cardH + 8;
  });

  drawFooter(4, 6);

  // ---- PAGE 5: POSIZIONAMENTO ----
  doc.addPage();
  fillPage(WHITE);
  drawHeader('POSIZIONAMENTO', 'BikerLink nel mercato route planning moto');

  y = 80;
  y = sectionTitle('Posizionamento nel Mercato', y);
  y += 10;

  const quadrants = [
    { label: 'ALTO COSTO\nALTA FUNZIONALITÀ', x: MARGIN + CONTENT_W / 2 + 5, y: y, w: CONTENT_W / 2 - 5, color: '#FFF3E0', items: ['Calimoto (€34.99/anno)', 'Kurviger (€30/anno)', 'Motobit (€29.99/anno)'] },
    { label: 'BASSO COSTO\nALTA FUNZIONALITÀ', x: MARGIN, y: y, w: CONTENT_W / 2 - 5, color: '#E8F5E9', items: ['✦ BikerLink (GRATIS)'] },
    { label: 'ALTO COSTO\nBASSA FUNZIONALITÀ', x: MARGIN + CONTENT_W / 2 + 5, y: y + 130, w: CONTENT_W / 2 - 5, color: '#FFEBEE', items: [] },
    { label: 'BASSO COSTO\nBASSA FUNZIONALITÀ', x: MARGIN, y: y + 130, w: CONTENT_W / 2 - 5, color: '#F5F5F5', items: ['Wheelo (Freemium)', 'Motoplanner (Freemium)'] },
  ];

  quadrants.forEach((q) => {
    doc.roundedRect(q.x, q.y, q.w, 125, 4).fill(q.color);
    doc.fillColor(DARK_BLUE).font('Helvetica-Bold').fontSize(8).text(q.label, q.x + 8, q.y + 8, { width: q.w - 16 });
    q.items.forEach((item, ii) => {
      const isHero = item.startsWith('✦');
      doc.fillColor(isHero ? ORANGE : DARK_GRAY).font(isHero ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHero ? 10 : 8).text(item, q.x + 8, q.y + 40 + ii * 18, { width: q.w - 16 });
    });
  });

  y += 275;
  y = sectionTitle('Sintesi Vantaggi Competitivi', y);
  y += 10;

  const advItems = [
    { title: 'Unico con AI', desc: 'Solo BikerLink integra AI in linguaggio naturale per creare percorsi' },
    { title: 'Costo ×100 inferiore', desc: '~€20/mese vs centinaia/migliaia dei competitor' },
    { title: 'Sensori reali', desc: 'Dati lean angle e G-force già disponibili dall\'hardware esistente' },
    { title: 'Ecosistema integrato', desc: 'Route planning + social + matching in un\'unica piattaforma' },
  ];
  advItems.forEach((adv, i) => {
    const ax = MARGIN + (i % 2) * (CONTENT_W / 2 + 5);
    const ay = y + Math.floor(i / 2) * 55;
    doc.roundedRect(ax, ay, CONTENT_W / 2 - 5, 48, 4).fill(DARK_BLUE);
    doc.roundedRect(ax, ay, 4, 48, 2).fill(ORANGE);
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text(adv.title, ax + 10, ay + 8, { width: CONTENT_W / 2 - 20 });
    doc.fillColor(WHITE).font('Helvetica').fontSize(7.5).text(adv.desc, ax + 10, ay + 24, { width: CONTENT_W / 2 - 20 });
  });

  drawFooter(5, 6);

  // ---- PAGE 6: CALL TO ACTION ----
  doc.addPage();
  fillPage(DARK_BLUE);

  doc.rect(0, 0, W, 6).fill(ORANGE);
  doc.rect(0, H - 6, W, 6).fill(ORANGE);

  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(32).text('BIKERLINK', 0, 120, { align: 'center', width: W });
  doc.fillColor(WHITE).font('Helvetica').fontSize(16).text('Il route planning moto più completo.', 0, 165, { align: 'center', width: W });
  doc.fillColor(WHITE).font('Helvetica').fontSize(14).text('Al costo più basso del mercato.', 0, 190, { align: 'center', width: W });

  doc.rect(MARGIN + 20, 225, CONTENT_W - 40, 2).fill(ORANGE);

  const ctaItems = [
    '🏍️  Routing curvy self-hosted con GraphHopper',
    '🤖  AI in linguaggio naturale con Gemini Flash',
    '🗺️  Mappe offline gratuite con PMTiles',
    '☀️  Meteo sul percorso con Open-Meteo',
    '👥  Social matching integrato',
    '📊  BikerScore proprietario con dati reali',
  ];
  ctaItems.forEach((item, i) => {
    doc.fillColor(i === 0 ? ORANGE : WHITE).font('Helvetica').fontSize(11).text(item, 0, 245 + i * 26, { align: 'center', width: W });
  });

  doc.rect(MARGIN, 415, CONTENT_W, 2).fill(ORANGE);

  doc.roundedRect(W / 2 - 100, 435, 200, 50, 6).fill(ORANGE);
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(16).text('TUTTO GRATIS', W / 2 - 100, 452, { width: 200, align: 'center' });

  doc.fillColor(WHITE).font('Helvetica').fontSize(10).text('per gli utenti BikerLink', 0, 498, { align: 'center', width: W });
  doc.fillColor(WHITE).font('Helvetica').fontSize(9).text('Infrastruttura: ~€20/mese — non migliaia', 0, 516, { align: 'center', width: W });

  doc.rect(MARGIN, 545, CONTENT_W, 1).fill(ORANGE);

  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(10).text('bikerlink.app', 0, 560, { align: 'center', width: W });
  doc.fillColor(MID_GRAY).font('Helvetica').fontSize(8).text('maggio 2026 — Documento riservato per uso interno e investitori', 0, 578, { align: 'center', width: W });

  drawFooter(6, 6);

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      console.log('PDF generated:', outputPath);
      resolve(outputPath);
    });
    stream.on('error', reject);
  });
}

async function generatePNG() {
  console.log('Generating PNG...');

  const W = 1200;
  const H = 630;

  const svgFeatures = [
    { label: 'Routing curvy', bk: true, cal: true, kurv: true, whe: true, mob: true, mot: false },
    { label: 'AI linguaggio naturale', bk: true, cal: false, kurv: false, whe: false, mob: false, mot: false },
    { label: 'Meteo sul percorso', bk: true, cal: false, kurv: false, whe: true, mob: false, mot: false },
    { label: 'Giri multi-giorno', bk: true, cal: false, kurv: false, whe: false, mob: false, mot: false },
    { label: 'Social matching', bk: true, cal: false, kurv: false, whe: true, mob: false, mot: false },
    { label: 'Mappe offline GRATIS', bk: true, cal: true, kurv: false, whe: false, mob: false, mot: false },
    { label: 'Costo per utente', bk: 'GRATIS', cal: '€34.99/a', kurv: '€30/a', whe: 'Freemium', mob: '€29.99/a', mot: 'Freemium' },
  ];

  const cols = ['BikerLink', 'Calimoto', 'Kurviger', 'Wheelo', 'Motobit', 'Motoplanner'];
  const colW = 130;
  const rowH = 56;
  const tableX = 50;
  const tableY = 195;
  const featureLabelW = 195;
  const totalTableW = featureLabelW + cols.length * colW;

  function check(val, isFirst) {
    if (val === true) {
      const color = isFirst ? '#2ECC71' : '#888888';
      return `<text x="0" y="0" font-family="Arial, sans-serif" font-size="22" fill="${color}" text-anchor="middle" dominant-baseline="central">✓</text>`;
    } else if (val === false) {
      return `<text x="0" y="0" font-family="Arial, sans-serif" font-size="20" fill="#E74C3C" text-anchor="middle" dominant-baseline="central">✗</text>`;
    } else {
      const fontSize = isFirst ? '14' : '11';
      const color = isFirst ? '#FF6B35' : '#AAAAAA';
      return `<text x="0" y="0" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${color}" text-anchor="middle" dominant-baseline="central">${val}</text>`;
    }
  }

  let svgRows = '';
  svgFeatures.forEach((row, ri) => {
    const y = tableY + ri * rowH;
    const rowBg = ri % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
    svgRows += `<rect x="${tableX}" y="${y}" width="${totalTableW}" height="${rowH}" fill="${rowBg}" rx="3"/>`;
    svgRows += `<text x="${tableX + 12}" y="${y + rowH / 2}" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="#DDDDDD" dominant-baseline="central">${row.label}</text>`;
    const vals = [row.bk, row.cal, row.kurv, row.whe, row.mob, row.mot];
    vals.forEach((val, ci) => {
      const cx = tableX + featureLabelW + ci * colW + colW / 2;
      const cy = y + rowH / 2;
      svgRows += `<g transform="translate(${cx}, ${cy})">${check(val, ci === 0)}</g>`;
    });
    if (ri < svgFeatures.length - 1) {
      svgRows += `<line x1="${tableX}" y1="${y + rowH}" x2="${tableX + totalTableW}" y2="${y + rowH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    }
  });

  let colHeaders = '';
  cols.forEach((col, ci) => {
    const cx = tableX + featureLabelW + ci * colW;
    const isFirst = ci === 0;
    const bg = isFirst ? '#FF6B35' : '#252540';
    colHeaders += `<rect x="${cx}" y="${tableY - 38}" width="${colW}" height="38" fill="${bg}" rx="${isFirst ? '6 6 0 0' : '0'}"/>`;
    colHeaders += `<text x="${cx + colW / 2}" y="${tableY - 38 + 20}" font-family="Arial, sans-serif" font-size="${isFirst ? '14' : '12'}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${col}</text>`;
    if (isFirst) {
      colHeaders += `<text x="${cx + colW / 2}" y="${tableY - 38 + 32}" font-family="Arial, sans-serif" font-size="9" fill="rgba(255,255,255,0.8)" text-anchor="middle">TUTTO GRATIS</text>`;
    }
  });

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1A1A2E;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213E;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#FF6B35;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FF8C5A;stop-opacity:1" />
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <rect x="0" y="0" width="${W}" height="5" fill="url(#accent)"/>
  <rect x="0" y="${H - 5}" width="${W}" height="5" fill="url(#accent)"/>

  <rect x="50" y="28" width="140" height="36" rx="18" fill="#FF6B35"/>
  <text x="120" y="50" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">BIKERLINK</text>

  <text x="${W - 50}" y="46" font-family="Arial, sans-serif" font-size="11" fill="#888888" text-anchor="end">maggio 2026</text>

  <text x="${W / 2}" y="105" font-family="Arial, sans-serif" font-size="30" font-weight="bold" fill="white" text-anchor="middle">Route Planning: BikerLink vs la Concorrenza</text>
  <text x="${W / 2}" y="140" font-family="Arial, sans-serif" font-size="16" fill="#AAAAAA" text-anchor="middle">Confronto funzionalità e costi — 2026</text>

  <line x1="50" y1="165" x2="${W - 50}" y2="165" stroke="#FF6B35" stroke-width="1.5" stroke-opacity="0.4"/>

  ${colHeaders}

  <rect x="${tableX}" y="${tableY - 38}" width="${featureLabelW}" height="38" fill="#1E1E3A" rx="0"/>
  <text x="${tableX + 12}" y="${tableY - 38 + 20}" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="#888888" dominant-baseline="central">Funzionalità</text>

  ${svgRows}

  <rect x="${tableX}" y="${tableY + svgFeatures.length * rowH}" width="${totalTableW}" height="1" fill="rgba(255,107,53,0.3)"/>

  <rect x="${W - 220}" y="${H - 70}" width="170" height="42" rx="21" fill="#FF6B35"/>
  <text x="${W - 135}" y="${H - 49}" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">TUTTO GRATIS</text>

  <text x="50" y="${H - 44}" font-family="Arial, sans-serif" font-size="12" fill="#888888">Infrastruttura: ~€20/mese | AI Gemini Flash | Mappe offline PMTiles | Meteo Open-Meteo</text>
</svg>`;

  const outputPath = path.join(ASSETS_DIR, 'competitor-analysis.png');
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  console.log('PNG generated:', outputPath);
  return outputPath;
}

async function main() {
  try {
    await generatePDF();
    await generatePNG();
    console.log('All assets generated successfully!');
    console.log('PDF: server/public/assets/competitor-analysis.pdf');
    console.log('PNG: server/public/assets/competitor-analysis.png');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
