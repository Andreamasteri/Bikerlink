async function generatePDF(ctx) {
  const { PDFDocument, fs, path, ORANGE, DARK_BLUE, WHITE, LIGHT_GRAY, DARK_GRAY, MID_GRAY, GREEN, RED, YELLOW, ASSETS_DIR, competitors, comparisonData, stackData, differentiators } = ctx;

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
  let badgeY = 355;
  [{ icon: '✓', text: '6 competitor analizzati' }, { icon: '✓', text: 'Stack tecnico a costo zero' }, { icon: '✓', text: '7 differenziatori esclusivi' }].forEach((item) => {
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

  // ---- PAGE 2: COMPARISON TABLE ----
  doc.addPage();
  fillPage(WHITE);
  drawHeader('CONFRONTO FUNZIONALITÀ', 'Tabella comparativa — BikerLink vs 5 competitor');
  let y = 80;
  y = sectionTitle('Confronto Funzionalità', y);
  y += 6;
  const colWidths = [160, 60, 60, 60, 60, 60, 60];
  const colX = [MARGIN];
  for (let i = 1; i < colWidths.length; i++) colX.push(colX[i - 1] + colWidths[i - 1]);
  ['Funzione', ...competitors].forEach((text, i) => {
    doc.rect(colX[i], y, colWidths[i], 22).fill(i === 1 ? ORANGE : DARK_BLUE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(6.5).text(text, colX[i] + 3, y + 7, { width: colWidths[i] - 6, align: 'center' });
  });
  y += 22;
  comparisonData.forEach((row, rowIdx) => {
    doc.rect(MARGIN, y, CONTENT_W, 20).fill(rowIdx % 2 === 0 ? '#F8F8F8' : WHITE);
    doc.fillColor(DARK_GRAY).font('Helvetica-Bold').fontSize(6.5).text(row.feature, colX[0] + 3, y + 6, { width: colWidths[0] - 6 });
    row.checks.forEach((check, ci) => {
      const symbol = check === 'yes' ? '✓' : check === 'partial' ? '~' : '✗';
      const color = check === 'yes' ? GREEN : check === 'partial' ? YELLOW : RED;
      doc.fillColor(color).font('Helvetica-Bold').fontSize(ci === 0 ? 8 : 9).text(symbol, colX[ci+1], y + (ci === 0 ? 6 : 5), { width: colWidths[ci+1], align: 'center' });
      if (ci === 0) doc.fillColor(DARK_GRAY).font('Helvetica').fontSize(5).text(row.values[0].replace(/[✓✗~→⚠️]/g, '').trim().slice(0, 22), colX[ci+1], y + 13, { width: colWidths[ci+1], align: 'center' });
    });
    doc.rect(MARGIN, y + 19.5, CONTENT_W, 0.5).fill('#EEEEEE');
    y += 20;
  });
  doc.rect(MARGIN, 80, CONTENT_W, y - 80).lineWidth(0.5).stroke(DARK_BLUE);
  drawFooter(2, 6);

  // Remaining pages (Simplified for part2 logic)
  doc.addPage(); fillPage(WHITE); drawHeader('STACK TECNICO'); drawFooter(3, 6);
  doc.addPage(); fillPage(WHITE); drawHeader('DIFFERENZIATORI'); drawFooter(4, 6);
  doc.addPage(); fillPage(WHITE); drawHeader('POSIZIONAMENTO'); drawFooter(5, 6);
  doc.addPage(); fillPage(DARK_BLUE); drawHeader('CALL TO ACTION'); drawFooter(6, 6);

  doc.end();
  return new Promise((res, rej) => { stream.on('finish', () => res(outputPath)); stream.on('error', rej); });
}

async function generatePNG(ctx) {
  const { sharp, path, ASSETS_DIR, ORANGE, DARK_BLUE, WHITE } = ctx;
  console.log('Generating PNG (Placeholder)...');
  const buffer = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${DARK_BLUE}"/><text x="50%" y="50%" fill="${ORANGE}" font-size="48" text-anchor="middle">BikerLink Analysis</text></svg>`);
  await sharp(buffer).toFile(path.join(ASSETS_DIR, 'competitor-analysis.png'));
}

module.exports = { generatePDF, generatePNG };
