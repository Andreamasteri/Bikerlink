/**
 * BikerLink Manual PDF Generator
 * Reads manuale-utente-bikerlink.md and generates a professional PDF
 * using pdfkit with BikerLink branding.
 */
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MD_PATH = path.join(ROOT, 'manuale-utente-bikerlink.md');
const OUT_PATH = path.join(ROOT, 'manuale-utente-bikerlink-aprile2026.pdf');
const PUBLIC_PATH = path.join(ROOT, 'server', 'public', 'bikerlink-manual.pdf');

// ── Colors ──────────────────────────────────────────────────────────────────
const ORANGE = '#E85D04';
const DARK   = '#1A1A2E';
const GRAY   = '#555555';
const LGRAY  = '#888888';
const WHITE  = '#FFFFFF';
const CREAM  = '#FFF8F3';
const BOX_BG = '#FFF3E8';

// ── Markdown Parser ──────────────────────────────────────────────────────────
function parseMarkdown(mdText) {
  const lines = mdText.split('\n');
  const tokens = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip YAML front matter or top-level H1 (cover title)
    if (/^# /.test(line)) { i++; continue; }

    // Horizontal rule → separator
    if (/^---+$/.test(line.trim())) { tokens.push({ type: 'hr' }); i++; continue; }

    // H2 → chapter (## N. Title) — skip "## Indice" (script generates its own TOC)
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      if (/^indice$/i.test(h2[1].trim())) {
        // Skip the Indice section header and its list items until next ##
        i++;
        while (i < lines.length && !/^## /.test(lines[i])) { i++; }
        continue;
      }
      const m = h2[1].match(/^(\d+)\.\s+(.+)/);
      if (m) tokens.push({ type: 'chapter', num: m[1], title: m[2] });
      else    tokens.push({ type: 'chapter', num: '', title: h2[1] });
      i++; continue;
    }

    // H3 → section (### N.N Title)
    const h3 = line.match(/^### (.+)/);
    if (h3) { tokens.push({ type: 'section', text: h3[1] }); i++; continue; }

    // H4 → sub-title
    const h4 = line.match(/^#### (.+)/);
    if (h4) { tokens.push({ type: 'subtitle', text: h4[1] }); i++; continue; }

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
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(stripInline(lines[i].replace(/^\d+\. /, '')));
        i++;
      }
      tokens.push({ type: 'numbered', items });
      continue;
    }

    // Empty line
    if (line.trim() === '') { tokens.push({ type: 'blank' }); i++; continue; }

    // Bold-only line → sub-title (e.g. **Biker**)
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      tokens.push({ type: 'subtitle', text: line.trim().replace(/\*\*/g, '') });
      i++; continue;
    }

    // Indented paragraph (4 spaces)
    if (/^    /.test(line)) {
      tokens.push({ type: 'body', text: stripInline(line.trim()) });
      i++; continue;
    }

    // Regular paragraph — collect consecutive non-empty, non-special lines
    if (line.trim() !== '') {
      let para = '';
      while (i < lines.length) {
        const l = lines[i];
        if (l.trim() === '' || /^#{1,4} /.test(l) || /^[-\d]/.test(l) || /^---/.test(l.trim())) break;
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

function stripInline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

// ── PDF Helpers ──────────────────────────────────────────────────────────────
function renderCover(doc) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(ORANGE);
  doc.polygon(
    [0, doc.page.height * 0.55],
    [doc.page.width, doc.page.height * 0.35],
    [doc.page.width, doc.page.height],
    [0, doc.page.height]
  ).fill(DARK);

  doc.fill(WHITE).font('Helvetica-Bold').fontSize(52)
     .text('BikerLink', 0, 175, { align: 'center' });
  doc.fill(WHITE).font('Helvetica-Oblique').fontSize(18)
     .text("U'll never ride alone", 0, 242, { align: 'center' });

  const lineY = 282;
  doc.moveTo(80, lineY).lineTo(doc.page.width - 80, lineY)
     .strokeColor(WHITE).lineWidth(1).stroke();

  doc.fill(WHITE).font('Helvetica-Bold').fontSize(22)
     .text('MANUALE UTENTE', 0, 297, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(12)
     .text('Versione: Aprile 2026  ·  App v1.1.0', 0, 330, { align: 'center' });

  doc.fill(WHITE).font('Helvetica').fontSize(11)
     .text('Italiano  ·  Guida Completa', 0, doc.page.height - 82, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(10)
     .text('bikerlink.replit.app', 0, doc.page.height - 58, { align: 'center' });
}

function renderFooter(doc, pageNum) {
  const bottom = doc.page.height - 36;
  const left   = doc.page.margins.left;
  const right  = doc.page.width - doc.page.margins.right;
  doc.moveTo(left, bottom - 6).lineTo(right, bottom - 6)
     .strokeColor('#DDDDDD').lineWidth(0.5).stroke();
  doc.fill(LGRAY).font('Helvetica').fontSize(8)
     .text("BikerLink — U'll never ride alone", left, bottom, {
       continued: true,
       width: right - left
     })
     .text(`Pagina ${pageNum}`, { align: 'right' });
}

function renderTOC(doc, tokens) {
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(18)
     .text('INDICE', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y)
     .strokeColor(ORANGE).lineWidth(1).stroke();
  doc.moveDown(0.8);

  const chapters = tokens.filter(t => t.type === 'chapter' && t.num);
  chapters.forEach(ch => {
    doc.fill(DARK).font('Helvetica-Bold').fontSize(11.5)
       .text(`${ch.num}.`, doc.page.margins.left, doc.y, { continued: true, width: 30 });
    doc.fill(DARK).font('Helvetica').fontSize(11.5)
       .text(ch.title);
    doc.moveDown(0.3);
  });
}

function renderChapter(doc, token) {
  doc.addPage();
  doc.rect(doc.page.margins.left, 70, 4, 38).fill(ORANGE);
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(11)
     .text(`CAPITOLO ${token.num}`, doc.page.margins.left + 14, 70);
  doc.fill(DARK).font('Helvetica-Bold').fontSize(22)
     .text(token.title, doc.page.margins.left + 14, 87);
  doc.moveDown(1.2);
}

function renderSection(doc, token) {
  doc.moveDown(0.8);
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(13)
     .text(token.text);
  doc.moveDown(0.25);
}

function renderSubtitle(doc, token) {
  doc.moveDown(0.5);
  doc.fill(DARK).font('Helvetica-Bold').fontSize(11.5)
     .text(token.text);
  doc.moveDown(0.15);
}

function renderBody(doc, token) {
  doc.fill(DARK).font('Helvetica').fontSize(11)
     .text(token.text, { lineGap: 3, paragraphGap: 4 });
}

function renderBullet(doc, token) {
  token.items.forEach(item => {
    doc.fill(DARK).font('Helvetica').fontSize(11)
       .text(`\u2022  ${item}`, { indent: 14, lineGap: 2, paragraphGap: 2 });
  });
}

function renderNumbered(doc, token) {
  token.items.forEach((item, i) => {
    doc.fill(DARK).font('Helvetica').fontSize(11)
       .text(`${i + 1}.  ${item}`, { indent: 14, lineGap: 2, paragraphGap: 2 });
  });
}

function renderFinalPage(doc) {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(ORANGE);
  doc.fill(WHITE).font('Helvetica-Bold').fontSize(32)
     .text('BikerLink', 0, 255, { align: 'center' });
  doc.fill(WHITE).font('Helvetica-Oblique').fontSize(16)
     .text("U'll never ride alone", 0, 300, { align: 'center' });
  doc.moveDown(1.2);
  doc.moveTo(100, 338).lineTo(doc.page.width - 100, 338)
     .strokeColor(WHITE).lineWidth(1).stroke();
  doc.fill(WHITE).font('Helvetica').fontSize(11)
     .text('Per assistenza: usa la sezione Feedback nel tuo profilo', 0, 355, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(10)
     .text('bikerlink.replit.app', 0, 380, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(9)
     .text('Versione manuale: Aprile 2026  ·  App v1.1.0', 0, 405, { align: 'center' });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(MD_PATH)) {
    throw new Error(`Markdown source not found: ${MD_PATH}`);
  }

  const mdText = fs.readFileSync(MD_PATH, 'utf8');
  const tokens = parseMarkdown(mdText);

  const doc = new PDFDocument({
    margin: 60,
    size: 'A4',
    bufferPages: true, // allows going back to write footers
    info: {
      Title:        'BikerLink — Manuale Utente',
      Author:       'BikerLink',
      Subject:      'Guida completa per utenti BikerLink',
      Keywords:     'bikerlink, moto, biker, zavorrina, manuale, guida',
      CreationDate: new Date(),
    },
  });

  const stream = fs.createWriteStream(OUT_PATH);
  doc.pipe(stream);

  // ── Cover (page 1, no footer) ─────────────────────────────────────────────
  renderCover(doc);

  // ── TOC (page 2) ─────────────────────────────────────────────────────────
  doc.addPage();
  renderTOC(doc, tokens);

  // ── Content pages ─────────────────────────────────────────────────────────
  for (const token of tokens) {
    switch (token.type) {
      case 'chapter':   renderChapter(doc, token); break;
      case 'section':   renderSection(doc, token); break;
      case 'subtitle':  renderSubtitle(doc, token); break;
      case 'body':      renderBody(doc, token); break;
      case 'bullet':    renderBullet(doc, token); break;
      case 'numbered':  renderNumbered(doc, token); break;
      case 'blank':     doc.moveDown(0.4); break;
      case 'hr':        break; // ignore horizontal rules in body
      default:          break;
    }
  }

  // ── Final page (no footer) ────────────────────────────────────────────────
  renderFinalPage(doc);

  // ── Flush all pages to buffer ─────────────────────────────────────────────
  doc.flushPages();

  // ── Add footers to every page except cover (1) and final ─────────────────
  const range = doc.bufferedPageRange(); // { start, count }
  const firstContentPage = range.start + 1; // skip cover
  const lastPage = range.start + range.count - 1; // final page

  for (let idx = firstContentPage; idx < lastPage; idx++) {
    doc.switchToPage(idx);
    renderFooter(doc, idx - range.start + 1); // 1-based display number
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // Copy to server/public
  fs.copyFileSync(OUT_PATH, PUBLIC_PATH);

  const size = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
  console.log(`PDF generato da: ${MD_PATH}`);
  console.log(`Output: ${OUT_PATH} (${size} KB)`);
  console.log(`Copiato in: ${PUBLIC_PATH}`);
}

main().catch(err => { console.error('Errore:', err); process.exit(1); });
