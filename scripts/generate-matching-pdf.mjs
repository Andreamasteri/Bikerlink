/**
 * BikerLink Matching System PDF Generator
 * Reads docs/matching-system.md and generates docs/matching-system.pdf
 * with cover, TOC, formatted body, technical appendix and page numbers.
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MD_PATH = path.join(ROOT, 'docs', 'matching-system.md');
const OUT_PATH = path.join(ROOT, 'docs', 'matching-system.pdf');
const PUBLIC_COPY_PATH = path.join(ROOT, 'server', 'public', 'matching-system.pdf');

const ORANGE = '#E85D04';
const DARK   = '#1A1A2E';
const GRAY   = '#555555';
const LGRAY  = '#888888';
const WHITE  = '#FFFFFF';
const BOX_BG = '#FFF3E8';
const BORDER = '#E5D5C5';

function stripInline(text) {
  return text
    .replace(/↔/g, '<->')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function splitDocument(md) {
  // Split body and appendix at <details>…</details>
  const detailsStart = md.indexOf('<details>');
  if (detailsStart === -1) return { body: md, appendix: '' };
  const detailsEnd = md.indexOf('</details>', detailsStart);
  const body = md.slice(0, detailsStart).trim();
  let appendix = md.slice(detailsStart, detailsEnd >= 0 ? detailsEnd + '</details>'.length : md.length);
  // Strip <details>/<summary> tags
  appendix = appendix
    .replace(/<details>/g, '')
    .replace(/<\/details>/g, '')
    .replace(/<summary>[\s\S]*?<\/summary>/g, '')
    .trim();
  return { body, appendix };
}

function parseMarkdown(mdText) {
  const lines = mdText.split('\n');
  const tokens = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Top-level H1 (cover title) — skip
    if (/^# /.test(line)) { i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { tokens.push({ type: 'hr' }); i++; continue; }

    // H2 → chapter
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      const m = h2[1].match(/^(\d+)\.\s+(.+)/);
      if (m) tokens.push({ type: 'chapter', num: m[1], title: m[2] });
      else   tokens.push({ type: 'chapter', num: '', title: h2[1] });
      i++; continue;
    }

    // H3 → section
    const h3 = line.match(/^### (.+)/);
    if (h3) { tokens.push({ type: 'section', text: h3[1] }); i++; continue; }

    // H4 → subtitle
    const h4 = line.match(/^#### (.+)/);
    if (h4) { tokens.push({ type: 'subtitle', text: h4[1] }); i++; continue; }

    // Blockquote → callout
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(stripInline(lines[i].replace(/^>\s?/, '')));
        i++;
      }
      tokens.push({ type: 'callout', text: buf.join(' ').trim() });
      continue;
    }

    // Markdown table
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|\s*[:-]/.test(lines[i + 1])) {
      const header = line.split('|').slice(1, -1).map(c => stripInline(c.trim()));
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i].split('|').slice(1, -1).map(c => stripInline(c.trim()));
        rows.push(cells);
        i++;
      }
      tokens.push({ type: 'table', header, rows });
      continue;
    }

    // Bullet list
    if (/^- /.test(line)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) {
        items.push(stripInline(lines[i].slice(2)));
        i++;
      }
      tokens.push({ type: 'bullet', items });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(stripInline(lines[i].replace(/^\d+\.\s/, '')));
        i++;
      }
      tokens.push({ type: 'numbered', items });
      continue;
    }

    // Blank line
    if (line.trim() === '') { tokens.push({ type: 'blank' }); i++; continue; }

    // Regular paragraph
    if (line.trim() !== '') {
      let para = '';
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '' || /^#{1,4} /.test(l) || /^[->|]/.test(l) || /^\d+\.\s/.test(l) || /^---/.test(l.trim())) break;
        para += (para ? ' ' : '') + stripInline(l.trim());
        i++;
      }
      if (para) tokens.push({ type: 'body', text: para });
      continue;
    }

    i++;
  }

  return tokens;
}

// ── PDF rendering ────────────────────────────────────────────────────────────
function renderCover(doc) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(ORANGE);
  doc.polygon(
    [0, doc.page.height * 0.55],
    [doc.page.width, doc.page.height * 0.35],
    [doc.page.width, doc.page.height],
    [0, doc.page.height]
  ).fill(DARK);

  doc.fill(WHITE).font('Helvetica-Bold').fontSize(48)
     .text('BikerLink', 0, 170, { align: 'center' });
  doc.fill(WHITE).font('Helvetica-Oblique').fontSize(16)
     .text("You'll never ride alone", 0, 232, { align: 'center' });

  doc.moveTo(80, 275).lineTo(doc.page.width - 80, 275)
     .strokeColor(WHITE).lineWidth(1).stroke();

  doc.fill(WHITE).font('Helvetica-Bold').fontSize(20)
     .text('SISTEMA DI MATCHING', 0, 290, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(12)
     .text('Documento per investitori, partner e team', 0, 322, { align: 'center' });

  doc.fill(WHITE).font('Helvetica').fontSize(11)
     .text('Versione 1.0  ·  Maggio 2026  ·  Italiano', 0, doc.page.height - 82, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(10)
     .text('bikerlink.replit.app', 0, doc.page.height - 58, { align: 'center' });
}

function renderHeader(doc, sectionLabel) {
  const top = 28;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.fill(LGRAY).font('Helvetica').fontSize(8)
     .text('BikerLink — Sistema di Matching', left, top, {
       width: right - left,
       continued: true,
     })
     .text(sectionLabel || '', { align: 'right' });
  doc.moveTo(left, top + 12).lineTo(right, top + 12)
     .strokeColor('#EEEEEE').lineWidth(0.5).stroke();
}

function renderFooter(doc, pageNum, totalPages) {
  const bottom = doc.page.height - 36;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.moveTo(left, bottom - 6).lineTo(right, bottom - 6)
     .strokeColor('#DDDDDD').lineWidth(0.5).stroke();
  doc.fill(LGRAY).font('Helvetica').fontSize(8)
     .text("BikerLink — You'll never ride alone", left, bottom, {
       continued: true,
       width: right - left,
     })
     .text(`Pagina ${pageNum} / ${totalPages}`, { align: 'right' });
}

function renderTOC(doc, chapters, appendixChapters) {
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(20)
     .text('INDICE', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y)
     .strokeColor(ORANGE).lineWidth(1).stroke();
  doc.moveDown(0.8);

  const tocLeft = doc.page.margins.left;
  const tocRight = doc.page.width - doc.page.margins.right;
  const tocWidth = tocRight - tocLeft;
  const numColW = 36;
  const titleColX = tocLeft + numColW;
  const titleColW = tocWidth - numColW;

  doc.fill(DARK).font('Helvetica-Bold').fontSize(13).text('Parte I — Documento principale', { lineBreak: false });
  doc.moveDown(0.5);
  chapters.forEach(ch => {
    const yPos = doc.y;
    doc.fill(DARK).font('Helvetica-Bold').fontSize(11)
       .text(`${ch.num}.`, tocLeft, yPos, { width: numColW, lineBreak: false });
    doc.fill(DARK).font('Helvetica').fontSize(11)
       .text(ch.title, titleColX, yPos, { width: titleColW, lineBreak: false });
    doc.moveDown(0.45);
  });

  if (appendixChapters.length > 0) {
    doc.moveDown(0.9);
    doc.fill(DARK).font('Helvetica-Bold').fontSize(13).text('Parte II — Appendice tecnica', { lineBreak: false });
    doc.moveDown(0.5);
    appendixChapters.forEach(ch => {
      doc.fill(DARK).font('Helvetica').fontSize(11)
         .text(`\u2022  ${ch.title}`, tocLeft + 10, doc.y, { width: tocWidth - 10, lineBreak: false });
      doc.moveDown(0.35);
    });
  }
}

function renderChapter(doc, token, ctx) {
  // New page for each chapter
  doc.addPage();
  ctx.pageOfChapter = 1;
  doc.rect(doc.page.margins.left, 70, 4, 38).fill(ORANGE);
  const label = ctx.inAppendix ? `APPENDICE ${token.num || ''}`.trim() : `CAPITOLO ${token.num || ''}`.trim();
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(11)
     .text(label, doc.page.margins.left + 14, 70);
  doc.fill(DARK).font('Helvetica-Bold').fontSize(20)
     .text(token.title, doc.page.margins.left + 14, 87, {
       width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 14,
     });
  doc.moveDown(1.2);
}

function renderSection(doc, token) {
  doc.moveDown(0.6);
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(13).text(token.text);
  doc.moveDown(0.25);
}

function renderSubtitle(doc, token) {
  doc.moveDown(0.5);
  doc.fill(DARK).font('Helvetica-Bold').fontSize(11.5).text(token.text);
  doc.moveDown(0.15);
}

function renderBody(doc, token) {
  doc.fill(DARK).font('Helvetica').fontSize(10.5)
     .text(token.text, { lineGap: 3, paragraphGap: 4, align: 'justify' });
}

function renderBullet(doc, token) {
  token.items.forEach(item => {
    doc.fill(DARK).font('Helvetica').fontSize(10.5)
       .text(`\u2022  ${item}`, { indent: 14, lineGap: 2, paragraphGap: 2 });
  });
}

function renderNumbered(doc, token) {
  token.items.forEach((item, i) => {
    doc.fill(DARK).font('Helvetica').fontSize(10.5)
       .text(`${i + 1}.  ${item}`, { indent: 14, lineGap: 2, paragraphGap: 2 });
  });
}

function renderCallout(doc, token) {
  doc.moveDown(0.4);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const padding = 10;
  const innerWidth = right - left - padding * 2;

  doc.font('Helvetica-Oblique').fontSize(10);
  const h = doc.heightOfString(token.text, { width: innerWidth, lineGap: 2 });
  const boxH = h + padding * 2;

  // page-break check
  if (doc.y + boxH > doc.page.height - doc.page.margins.bottom - 20) {
    doc.addPage();
  }

  const y = doc.y;
  doc.rect(left, y, right - left, boxH).fill(BOX_BG);
  doc.rect(left, y, 3, boxH).fill(ORANGE);
  doc.fill(DARK).font('Helvetica-Oblique').fontSize(10)
     .text(token.text, left + padding, y + padding, { width: innerWidth, lineGap: 2 });
  doc.y = y + boxH + 6;
}

function renderTable(doc, token) {
  doc.moveDown(0.4);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const totalWidth = right - left;
  const cols = token.header.length;

  // Column widths — first column narrower if it looks like an index (single short value)
  const isIndexCol = token.rows.every(r => (r[0] || '').length <= 4);
  let widths;
  if (isIndexCol && cols > 1) {
    const remaining = totalWidth - 30;
    widths = [30, ...Array(cols - 1).fill(remaining / (cols - 1))];
  } else {
    widths = Array(cols).fill(totalWidth / cols);
  }

  const cellPadding = 5;
  const fontSize = 8.5;
  const headerSize = 9;
  const lineGap = 1.5;

  const cellHeight = (text, w, font, size) => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(text || '', { width: w - cellPadding * 2, lineGap });
  };

  const drawRow = (cells, isHeader) => {
    const heights = cells.map((c, idx) =>
      cellHeight(c, widths[idx], isHeader ? 'Helvetica-Bold' : 'Helvetica', isHeader ? headerSize : fontSize)
    );
    const rowH = Math.max(...heights) + cellPadding * 2;

    // Page break
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      // redraw header on new page
      if (!isHeader) drawRow(token.header, true);
    }

    const y = doc.y;
    let x = left;
    // background
    if (isHeader) {
      doc.rect(left, y, totalWidth, rowH).fill(ORANGE);
    } else {
      doc.rect(left, y, totalWidth, rowH).fill(WHITE);
    }
    // borders + text
    cells.forEach((c, idx) => {
      doc.rect(x, y, widths[idx], rowH).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.fill(isHeader ? WHITE : DARK)
         .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(isHeader ? headerSize : fontSize)
         .text(c || '', x + cellPadding, y + cellPadding, {
           width: widths[idx] - cellPadding * 2,
           lineGap,
         });
      x += widths[idx];
    });
    doc.y = y + rowH;
  };

  drawRow(token.header, true);
  token.rows.forEach(r => {
    // Pad row to header length
    const padded = [...r];
    while (padded.length < cols) padded.push('');
    drawRow(padded, false);
  });
  doc.moveDown(0.4);
}

function renderAppendixDivider(doc, ctx) {
  doc.addPage();
  if (ctx) ctx.appendixDividerPageIndex = doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK);
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(14)
     .text('PARTE II', 0, 300, { align: 'center' });
  doc.fill(WHITE).font('Helvetica-Bold').fontSize(28)
     .text('Appendice Tecnica', 0, 325, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(12)
     .text('Dettagli per sviluppatori e team tecnico', 0, 365, { align: 'center' });
  doc.moveTo(120, 395).lineTo(doc.page.width - 120, 395)
     .strokeColor(ORANGE).lineWidth(1).stroke();
}

function renderTokens(doc, tokens, ctx) {
  for (const t of tokens) {
    switch (t.type) {
      case 'chapter':  renderChapter(doc, t, ctx); break;
      case 'section':  renderSection(doc, t); break;
      case 'subtitle': renderSubtitle(doc, t); break;
      case 'body':     renderBody(doc, t); break;
      case 'bullet':   renderBullet(doc, t); break;
      case 'numbered': renderNumbered(doc, t); break;
      case 'callout':  renderCallout(doc, t); break;
      case 'table':    renderTable(doc, t); break;
      case 'blank':    doc.moveDown(0.35); break;
      case 'hr':       break;
      default:         break;
    }
  }
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    throw new Error(`Markdown source not found: ${MD_PATH}`);
  }

  const mdText = fs.readFileSync(MD_PATH, 'utf8');
  const { body, appendix } = splitDocument(mdText);

  const bodyTokens = parseMarkdown(body);

  // Appendix: top-level ## headings → treat as appendix chapters numbered A1, A2…
  // The source uses ## for tables inside <details>. We re-number them.
  const rawAppendixTokens = parseMarkdown(appendix);
  let appCounter = 0;
  const appendixTokens = rawAppendixTokens.map(t => {
    if (t.type === 'chapter') {
      appCounter++;
      return { ...t, num: `A${appCounter}` };
    }
    return t;
  });

  const bodyChapters = bodyTokens.filter(t => t.type === 'chapter');
  const appendixChapters = appendixTokens.filter(t => t.type === 'chapter');

  const doc = new PDFDocument({
    margin: 60,
    size: 'A4',
    bufferPages: true,
    info: {
      Title:        'BikerLink — Sistema di Matching',
      Author:       'BikerLink',
      Subject:      'Documentazione completa del sistema di matching BikerLink',
      Keywords:     'bikerlink, matching, algoritmo, moto, biker, zavorrina, club',
      CreationDate: new Date(),
    },
  });

  const stream = fs.createWriteStream(OUT_PATH);
  doc.pipe(stream);

  // Page 1 — Cover
  renderCover(doc);

  // Page 2 — TOC
  doc.addPage();
  renderTOC(doc, bodyChapters, appendixChapters);

  // Body
  const ctx = { inAppendix: false };
  renderTokens(doc, bodyTokens, ctx);

  // Appendix divider + appendix
  if (appendixTokens.length > 0) {
    renderAppendixDivider(doc, ctx);
    ctx.inAppendix = true;
    renderTokens(doc, appendixTokens, ctx);
  }

  doc.flushPages();

  // Headers + footers on every page except cover and appendix divider
  const range = doc.bufferedPageRange();
  const total = range.count;
  const coverIdx = range.start;
  const appendixDividerIdx = ctx.appendixDividerPageIndex ?? -1;
  for (let idx = range.start; idx < range.start + range.count; idx++) {
    doc.switchToPage(idx);
    const display = idx - range.start + 1;
    if (idx === coverIdx) continue; // skip cover
    if (idx === appendixDividerIdx) continue; // skip appendix divider
    const sectionLabel = (appendixDividerIdx !== -1 && idx > appendixDividerIdx)
      ? 'Appendice Tecnica'
      : (display === 2 ? 'Indice' : 'Documento principale');
    renderHeader(doc, sectionLabel);
    renderFooter(doc, display, total);
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const size = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`PDF generato da: ${MD_PATH}`);
  console.log(`Output: ${OUT_PATH} (${size} KB)`);

  fs.copyFileSync(OUT_PATH, PUBLIC_COPY_PATH);
  console.log(`Copia pubblica: ${PUBLIC_COPY_PATH}`);
}

main().catch(err => { console.error('Errore:', err); process.exit(1); });
