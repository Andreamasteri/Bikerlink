/**
 * BikerLink AI Stack Schema — Generator
 * Genera ENTRAMBI docs/ai-schema.html e docs/ai-schema.pdf dallo stesso
 * contenuto TypeScript strutturato. Nessun testo duplicato tra i due output.
 * Eseguibile con: npx tsx scripts/generate-ai-schema-pdf.ts
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { CASCADE_A, CASCADE_B, FEATURES, CARDS, ENV_ROWS, CascadeNode } from "./ai-schema-data";
import { buildHtml } from "./ai-schema-html";

const ROOT     = path.resolve(".");
const HTML_PATH = path.join(ROOT, "docs", "ai-schema.html");
const PDF_PATH  = path.join(ROOT, "docs", "ai-schema.pdf");

// ── Layout constants ──────────────────────────────────────────────────────────
const PAGE_W    = 595.28;
const PAGE_H    = 841.89;
const MARGIN    = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  dark:        "#1A1A2E",
  orange:      "#E8541A",
  white:       "#FFFFFF",
  grey:        "#4A4A6A",
  lightGrey:   "#F5F5F7",
  border:      "#D0D0E0",
  altRow:      "#EEF0F8",
  green:       "#1B5E35",
  greenLight:  "#E8F5E9",
  blue:        "#1A5FA8",
  blueLight:   "#E3F0FB",
  amber:       "#E65100",
  amberLight:  "#FFF3E0",
  purple:      "#6A1B9A",
  purpleLight: "#F3E5F5",
};

function makeDoc(): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: "BikerLink AI Stack Schema", Author: "BikerLink" },
  });
}

function pageHeader(doc: PDFKit.PDFDocument, subtitle: string): void {
  const h = 34;
  doc.rect(MARGIN, MARGIN, CONTENT_W, h).fill(C.dark);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.white);
  doc.text("Biker", MARGIN + 10, MARGIN + 8, { continued: true });
  doc.fillColor(C.orange).text("Link", { continued: true });
  doc.fillColor(C.white).text(" — Schema AI Stack", { lineGap: 0 });
  doc.font("Helvetica").fontSize(7).fillColor(C.white).opacity(0.8);
  doc.text(subtitle, MARGIN + 10, MARGIN + 22, { width: CONTENT_W - 100, lineGap: 0 });
  doc.opacity(1);
  doc.y = MARGIN + h + 8;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  const y = doc.y;
  doc.rect(MARGIN, y, 3, 13).fill(C.orange);
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.dark);
  doc.text(title, MARGIN + 8, y + 1, { width: CONTENT_W - 8 });
  doc.y += 4;
}

function tableRow(
  doc: PDFKit.PDFDocument,
  cols: Array<{ text: string; width: number; bold?: boolean; mono?: boolean; small?: boolean }>,
  y: number,
  isHeader: boolean,
  isAlt: boolean,
): number {
  const rowH = Math.max(
    ...cols.map((c) => {
      const f = c.bold || isHeader ? "Helvetica-Bold" : "Helvetica";
      const sz = isHeader ? 7 : 7.5;
      doc.font(f).fontSize(sz);
      return doc.heightOfString(c.text, { width: c.width - 8 }) + 8;
    }),
    18,
  );
  if (y + rowH > PAGE_H - MARGIN - 50 && !isHeader) {
    doc.addPage();
    pageHeader(doc, "Feature AI — continua");
    y = doc.y;
  }
  const bg = isHeader ? C.dark : isAlt ? C.altRow : C.white;
  doc.rect(MARGIN, y, CONTENT_W, rowH).fill(bg);
  let x = MARGIN;
  for (const col of cols) {
    const fgColor = isHeader ? C.white : C.dark;
    const font = col.bold || isHeader ? "Helvetica-Bold" : "Helvetica";
    const size = isHeader ? 7 : col.small ? 7 : 7.5;
    doc.font(font).fontSize(size).fillColor(fgColor);
    doc.text(col.text, x + 4, y + 4, { width: col.width - 8, lineGap: 1 });
    x += col.width;
  }
  doc.moveTo(MARGIN, y + rowH).lineTo(PAGE_W - MARGIN, y + rowH)
    .strokeColor(C.border).lineWidth(0.4).stroke();
  return y + rowH;
}

function infoBox(doc: PDFKit.PDFDocument, text: string, bgColor: string, borderColor: string): void {
  const startY = doc.y;
  doc.font("Helvetica").fontSize(8);
  const textH = doc.heightOfString(text, { width: CONTENT_W - 20 });
  const boxH = textH + 12;
  doc.rect(MARGIN, startY, CONTENT_W, boxH).fill(bgColor);
  doc.rect(MARGIN, startY, 3, boxH).fill(borderColor);
  doc.font("Helvetica").fontSize(8).fillColor(C.dark);
  doc.text(text, MARGIN + 10, startY + 6, { width: CONTENT_W - 20 });
  doc.y = startY + boxH + 4;
}

function drawCascadeNodes(doc: PDFKit.PDFDocument, nodes: CascadeNode[], startY: number): void {
  const nodeW = 108;
  const nodeH = 52;
  const arrowW = 18;
  const totalW = nodeW * nodes.length + arrowW * (nodes.length - 1);
  const startX = MARGIN + (CONTENT_W - totalW) / 2;
  let x = startX;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    doc.roundedRect(x, startY, nodeW, nodeH, 5).fill(n.bgFill);
    doc.roundedRect(x, startY, nodeW, nodeH, 5).stroke(n.border).lineWidth(1.5);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(n.textColor);
    doc.text(n.label, x + 4, startY + 5, { width: nodeW - 8, align: "center" });
    doc.font("Helvetica").fontSize(6.5).fillColor(n.textColor);
    doc.text(n.model, x + 4, startY + 17, { width: nodeW - 8, align: "center" });
    const badgeY = startY + nodeH - 13;
    const bw = 56;
    const bx = x + (nodeW - bw) / 2;
    doc.roundedRect(bx, badgeY, bw, 10, 2).fill(n.border);
    doc.font("Helvetica-Bold").fontSize(5.5).fillColor(C.white);
    doc.text(n.badge, bx, badgeY + 2, { width: bw, align: "center" });
    x += nodeW;
    if (i < nodes.length - 1) {
      const arrowY = startY + nodeH / 2;
      doc.moveTo(x + 2, arrowY).lineTo(x + arrowW - 2, arrowY)
        .strokeColor(C.grey).lineWidth(1.2).stroke();
      doc.polygon([x + arrowW - 2, arrowY], [x + arrowW - 7, arrowY - 3], [x + arrowW - 7, arrowY + 3])
        .fill(C.grey);
      doc.font("Helvetica").fontSize(5.5).fillColor(C.grey);
      doc.text("fallback", x + 1, arrowY + 3, { width: arrowW - 2, align: "center" });
      x += arrowW;
    }
  }
}

function drawCascade(doc: PDFKit.PDFDocument): void {
  const startY = doc.y;
  const nodeH = 52;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.grey);
  doc.text(
    "Catena Universale — Ollama-first (Task #3872)  (server/ai/moderation/provider.ts)",
    MARGIN, startY, { width: CONTENT_W },
  );
  const chainAY = startY + 11;
  drawCascadeNodes(doc, CASCADE_A, chainAY);
  const chainBLabelY = chainAY + nodeH + 10;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.grey);
  doc.text(
    "Catena Route AI — pianificazione percorso  (server/ai/route-provider-config.ts)" +
    "  [configurabile: DB ai_route_provider_chain / env ROUTE_AI_PROVIDERS]",
    MARGIN, chainBLabelY, { width: CONTENT_W },
  );
  const chainBY = chainBLabelY + 11;
  drawCascadeNodes(doc, CASCADE_B, chainBY);
  doc.y = chainBY + nodeH + 8;
}

function drawCards(doc: PDFKit.PDFDocument): void {
  const cardW = (CONTENT_W - 8) / 3;
  const cols = 3;
  const cardH = 88;
  let x = MARGIN;
  let y = doc.y;
  for (let i = 0; i < CARDS.length; i++) {
    const col = i % cols;
    if (col === 0 && i > 0) {
      y += cardH + 5;
      if (y + cardH > PAGE_H - MARGIN - 50) {
        doc.addPage();
        pageHeader(doc, "Meccanismi Trasversali — continua");
        y = doc.y;
      }
    }
    x = MARGIN + col * (cardW + 4);
    const c = CARDS[i];
    doc.rect(x, y, cardW, cardH).fill(C.lightGrey);
    doc.rect(x, y, cardW, cardH).stroke(C.border).lineWidth(0.5);
    doc.rect(x, y, cardW, 15).fill(C.dark);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.white);
    doc.text(`${c.icon}  ${c.title}`, x + 5, y + 4, { width: cardW - 10 });
    doc.font("Helvetica").fontSize(6.5).fillColor(C.grey);
    const lineY = y + 18;
    c.lines.forEach((line, li) => {
      doc.text(`• ${line}`, x + 5, lineY + li * 10, { width: cardW - 10 });
    });
  }
  doc.y = y + cardH + 10;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function generate(): Promise<void> {
  fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });

  fs.writeFileSync(HTML_PATH, buildHtml(), "utf8");
  console.log(`✅  HTML generato: ${HTML_PATH}`);

  const doc = makeDoc();
  const stream = fs.createWriteStream(PDF_PATH);
  doc.pipe(stream);

  // PAGE 1
  pageHeader(doc, "Panoramica e Feature AI");
  sectionTitle(doc, "1. Catene di Esecuzione");
  doc.font("Helvetica").fontSize(8).fillColor(C.grey);
  doc.text(
    "Dal Task #3872, runWithFallback usa cascade Ollama-first universale. " +
    "Se Ollama è offline o lento, la chain scende automaticamente al provider cloud successivo.",
    MARGIN, doc.y, { width: CONTENT_W },
  );
  doc.moveDown(0.4);
  drawCascade(doc);
  infoBox(
    doc,
    "Cascade universale (Task #3872): Ollama tentato per PRIMO in ogni runWithFallback; se offline la chain scende su Groq → Gemini → OpenAI." +
    "  |  Engine Selector AI: 2 fasi — Fase 1 Ollama (½ budget 800ms), Fase 2 cloud chain (skipOllama:true)." +
    "  |  Chat co-pilot moderazione: skipOllama:true, tool calling multi-step — cloud-only." +
    "  |  DB Watchdog (proposer): 3-step — (0) Ollama, (1) Groq specifico, (2) chain cloud; cooldown 30min." +
    "  |  Route AI: chain separata Ollama-first, configurabile via DB ai_route_provider_chain / env ROUTE_AI_PROVIDERS.",
    C.blueLight, C.blue,
  );
  sectionTitle(doc, "2. Feature AI — Dettaglio per Modulo");
  const fCols = [
    { label: "Feature",           width: 90  },
    { label: "File / Modulo",     width: 115 },
    { label: "Provider primario", width: 65  },
    { label: "Modello",           width: 90  },
    { label: "Fallback",          width: 95  },
    { label: "Note",              width: 60  },
  ];
  let tableY = doc.y;
  tableY = tableRow(doc, fCols.map((c) => ({ text: c.label, width: c.width })), tableY, true, false);
  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    tableY = tableRow(
      doc,
      [
        { text: f.name,     width: fCols[0].width, bold: true },
        { text: f.file,     width: fCols[1].width, mono: true, small: true },
        { text: f.provider, width: fCols[2].width },
        { text: f.model,    width: fCols[3].width, small: true },
        { text: f.fallback, width: fCols[4].width, small: true },
        { text: f.note,     width: fCols[5].width, small: true },
      ],
      tableY, false, i % 2 === 1,
    );
  }
  doc.y = tableY + 6;

  // PAGE 2
  doc.addPage();
  pageHeader(doc, "Meccanismi Trasversali & Embeddings");
  sectionTitle(doc, "3. Meccanismi Trasversali");
  drawCards(doc);
  sectionTitle(doc, "4. Stack Embeddings");
  const embedY = doc.y;
  const halfW  = (CONTENT_W - 6) / 2;
  doc.rect(MARGIN, embedY, halfW, 65).fill(C.purpleLight);
  doc.rect(MARGIN, embedY, halfW, 65).stroke(C.purple).lineWidth(1.2);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.purple);
  doc.text("🥇  Provider primario — OpenAI", MARGIN + 6, embedY + 6, { width: halfW - 12 });
  doc.font("Helvetica").fontSize(7.5).fillColor(C.dark);
  [
    "Modello: text-embedding-3-large",
    "Dimensioni: 1536 (via providerOptions su dim nativa 3072)",
    "Tag DB: openai:text-embedding-3-large",
    "Timeout: 15s  ·  Retry: ×3 su 429 / 5xx",
    "Attivo quando: OPENAI_API_KEY presente",
  ].forEach((line, i) => doc.text(`• ${line}`, MARGIN + 6, embedY + 20 + i * 9, { width: halfW - 12 }));
  const fbX = MARGIN + halfW + 6;
  doc.rect(fbX, embedY, halfW, 65).fill(C.amberLight);
  doc.rect(fbX, embedY, halfW, 65).stroke(C.amber).lineWidth(1.2);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.amber);
  doc.text("🔁  Fallback locale — HuggingFace Transformers", fbX + 6, embedY + 6, { width: halfW - 12 });
  doc.font("Helvetica").fontSize(7.5).fillColor(C.dark);
  [
    "Modello: Xenova/multilingual-e5-small (quantized)",
    "Dim nativa: 384 → 1536 via 4× concat + L2-normalize",
    "Tag DB: local:Xenova/multilingual-e5-small",
    "Caricamento pigro (lazy): init solo alla prima chiamata",
    "Attivo quando: OPENAI_API_KEY assente o quota esaurita",
  ].forEach((line, i) => doc.text(`• ${line}`, fbX + 6, embedY + 20 + i * 9, { width: halfW - 12 }));
  doc.y = embedY + 72;
  infoBox(doc,
    "⚠️  Cross-provider similarity: La similarità coseno tra vettori OpenAI e vettori locali NON è significativa. " +
    "Il matcher filtra per campo model quando serve confronto omogeneo. Le righe local: sono confrontabili solo tra loro.",
    C.amberLight, C.amber,
  );
  sectionTitle(doc, "5. Variabili d'Ambiente — Riepilogo");
  const eCols = [
    { label: "Variabile",          width: 140 },
    { label: "Provider / Feature", width: 100 },
    { label: "Note",               width: 275 },
  ];
  let envY = doc.y;
  envY = tableRow(doc, eCols.map((c) => ({ text: c.label, width: c.width })), envY, true, false);
  for (let i = 0; i < ENV_ROWS.length; i++) {
    const r = ENV_ROWS[i];
    envY = tableRow(doc,
      [
        { text: r.varname,  width: eCols[0].width, mono: true, small: true },
        { text: r.provider, width: eCols[1].width, small: true },
        { text: r.note,     width: eCols[2].width, small: true },
      ],
      envY, false, i % 2 === 1,
    );
  }
  doc.y = envY + 6;
  infoBox(doc,
    "✅  Livello di resilienza: il sistema funziona con un solo provider configurato. " +
    "Con solo GROQ_API_KEY tutte le feature AI sono attive (eccetto embeddings OpenAI). " +
    "Con zero chiavi cloud ma BOWIE_OLLAMA_URL configurato, l'AI assistant è operativo in modalità degradata. " +
    "Con zero provider, il server parte comunque e il triage usa il fallback rule-based deterministico.",
    C.greenLight, C.green,
  );

  // Retroactive page footers
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    const footerY = PAGE_H - MARGIN + 6;
    doc.moveTo(MARGIN, footerY - 2).lineTo(PAGE_W - MARGIN, footerY - 2)
      .strokeColor(C.border).lineWidth(0.4).stroke();
    doc.font("Helvetica").fontSize(6.5).fillColor(C.grey);
    doc.text("BikerLink AI Stack Schema — Documento riservato", MARGIN, footerY, { width: CONTENT_W / 3 });
    doc.text(
      new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }),
      MARGIN + CONTENT_W / 3, footerY, { width: CONTENT_W / 3, align: "center" },
    );
    doc.text(`Pagina ${i + 1} / ${totalPages}`, MARGIN + (CONTENT_W * 2) / 3, footerY, {
      width: CONTENT_W / 3, align: "right",
    });
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  console.log(`✅  PDF generato: ${PDF_PATH}`);
  console.log(`    Pagine: ${totalPages}  ·  Dimensione: ${(fs.statSync(PDF_PATH).size / 1024).toFixed(1)} KB`);
}

generate().catch((err) => {
  console.error("❌ Errore generazione:", err);
  process.exit(1);
});
