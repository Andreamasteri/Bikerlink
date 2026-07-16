import PDFDocument from "pdfkit";
import type { Readable } from "node:stream";

const RED = "#FF3B30";
const DARK = "#1A1A1A";
const GRAY = "#666666";
const LIGHT = "#F5F5F5";
const BORDER = "#E0E0E0";
const WHITE = "#FFFFFF";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

function header(doc: InstanceType<typeof PDFDocument>, title: string, sub?: string) {
  doc.rect(0, 0, PAGE_W, 6).fill(RED);
  const logoX = MARGIN;
  const logoY = 24;
  doc.rect(logoX, logoY, 32, 32).fill(RED);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(WHITE).text("BL", logoX + 7, logoY + 9);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(RED).text("BIKERLINK", logoX + 40, logoY + 6);
  doc.font("Helvetica").fontSize(9).fillColor(GRAY).text("Sistema di Matching", logoX + 40, logoY + 19);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(GRAY)
    .text(new Date().toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" }),
      0, logoY + 10, { align: "right", width: PAGE_W - MARGIN });
  const lineY = 66;
  doc.moveTo(MARGIN, lineY).lineTo(PAGE_W - MARGIN, lineY).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.y = lineY + 18;
  if (title) {
    doc.font("Helvetica-Bold").fontSize(18).fillColor(DARK).text(title, MARGIN, doc.y);
    doc.y += 4;
    if (sub) {
      doc.font("Helvetica").fontSize(10).fillColor(GRAY).text(sub, MARGIN, doc.y);
      doc.y += 4;
    }
    doc.moveTo(MARGIN, doc.y + 8).lineTo(MARGIN + 40, doc.y + 8).lineWidth(2).strokeColor(RED).stroke();
    doc.y += 22;
  }
}

function footer(doc: InstanceType<typeof PDFDocument>, pageNum: number) {
  const y = PAGE_H - 28;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.font("Helvetica").fontSize(8).fillColor(GRAY)
    .text("BikerLink — Sistema di Matching — Documento tecnico riservato", MARGIN, y + 6);
  doc.font("Helvetica").fontSize(8).fillColor(GRAY)
    .text(`Pagina ${pageNum}`, 0, y + 6, { align: "right", width: PAGE_W - MARGIN });
}

function sectionTitle(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.y += 8;
  doc.font("Helvetica-Bold").fontSize(13).fillColor(RED).text(text, MARGIN, doc.y);
  doc.y += 4;
  doc.moveTo(MARGIN, doc.y).lineTo(PAGE_W - MARGIN, doc.y).lineWidth(0.5).strokeColor(BORDER).stroke();
  doc.y += 10;
}

function row(
  doc: InstanceType<typeof PDFDocument>,
  cols: string[],
  widths: number[],
  isHeader: boolean,
  y: number,
) {
  const rowH = isHeader ? 20 : 18;
  if (isHeader) {
    doc.rect(MARGIN, y, CONTENT_W, rowH).fill(DARK);
  } else {
    doc.rect(MARGIN, y, CONTENT_W, rowH).fill(doc.y % 36 < 18 ? LIGHT : WHITE);
  }
  let x = MARGIN + 8;
  cols.forEach((col, i) => {
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica")
      .fontSize(isHeader ? 8 : 8.5)
      .fillColor(isHeader ? WHITE : DARK)
      .text(col, x, y + (isHeader ? 6 : 5), { width: widths[i] - 12, lineBreak: false, ellipsis: true });
    x += widths[i];
  });
  return y + rowH;
}

export function generateMatchingPdf(): Readable {
  const doc = new PDFDocument({ size: "A4", margin: 0, info: {
    Title: "BikerLink — Sistema di Matching",
    Author: "BikerLink",
    Subject: "Documentazione tecnica del sistema di matching",
    Keywords: "matching, algoritmo, scoring, bikerlink",
  }});

  // ── COVER ──────────────────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(DARK);
  doc.rect(0, 0, PAGE_W, 8).fill(RED);
  doc.rect(0, PAGE_H - 8, PAGE_W, 8).fill(RED);

  const cx = PAGE_W / 2;
  doc.rect(cx - 30, 180, 60, 60).fill(RED);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(WHITE).text("BL", cx - 14, 202);

  doc.font("Helvetica-Bold").fontSize(32).fillColor(WHITE)
    .text("BIKERLINK", 0, 270, { align: "center", width: PAGE_W });
  doc.font("Helvetica").fontSize(14).fillColor(RED)
    .text("SISTEMA DI MATCHING", 0, 312, { align: "center", width: PAGE_W, characterSpacing: 3 });

  doc.moveTo(cx - 60, 342).lineTo(cx + 60, 342).lineWidth(1).strokeColor(RED).stroke();

  doc.font("Helvetica").fontSize(13).fillColor("#CCCCCC")
    .text("17 segnali di affinità · Embeddings semantici · Telemetria reale", 0, 358, { align: "center", width: PAGE_W });

  const stats = [
    { val: "17", lbl: "Segnali" },
    { val: "<200ms", lbl: "Latenza" },
    { val: "6", lbl: "AI" },
    { val: "0", lbl: "Pubblicità" },
  ];
  const statW = 120;
  const startX = (PAGE_W - statW * stats.length) / 2;
  stats.forEach((s, i) => {
    const sx = startX + i * statW;
    doc.font("Helvetica-Bold").fontSize(22).fillColor(RED).text(s.val, sx, 430, { width: statW, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor("#999999").text(s.lbl, sx, 458, { width: statW, align: "center", characterSpacing: 1.5 });
  });

  doc.font("Helvetica").fontSize(9).fillColor("#777777")
    .text(`Documento tecnico · ${new Date().toLocaleDateString("it-IT", { year: "numeric", month: "long", day: "numeric" })}`,
      0, PAGE_H - 60, { align: "center", width: PAGE_W });

  // ── PAGE 2: OVERVIEW + FLOW ─────────────────────────────────────────────────
  doc.addPage();
  header(doc, "Overview", "Il problema e il sistema");
  footer(doc, 2);

  sectionTitle(doc, "Il problema che risolviamo");
  doc.font("Helvetica").fontSize(10).fillColor(DARK)
    .text("Trovare compagni di viaggio compatibili è difficile. Nei gruppi WhatsApp finisci nel caos. Sui social non sai chi guida davvero. BikerLink risolve il problema alla radice: costruiamo un profilo multidimensionale da dati reali — la moto che hai, le strade che percorri, gli orari in cui esci, la musica che ascolti, lo stile con cui guidi.", MARGIN, doc.y, { width: CONTENT_W, lineGap: 3 });
  doc.y += 16;

  sectionTitle(doc, "Le 3 promesse");
  const promises = [
    { icon: "01", title: "Match veri, non casuali", desc: "Non solo prossimità geografica. 17 dimensioni di compatibilità reale: moto, stile di guida, orari, percorsi, musica." },
    { icon: "02", title: "Il sistema impara", desc: "Ogni swipe, ogni ignora, ogni connessione alimenta il feedback loop. I pesi si aggiustano automaticamente." },
    { icon: "03", title: "Geo + Tempo + Musica + Strade", desc: "Geohash, fasce orarie, affinità musicale semantica, percorsi reali con lean angle e G-force." },
  ];
  promises.forEach((p) => {
    const y = doc.y;
    doc.rect(MARGIN, y, 4, 52).fill(RED);
    doc.font("Helvetica-Bold").fontSize(18).fillColor(RED).text(p.icon, MARGIN + 12, y + 4);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(p.title, MARGIN + 44, y + 4);
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(p.desc, MARGIN + 44, y + 19, { width: CONTENT_W - 44, lineGap: 2 });
    doc.y = y + 58;
  });

  sectionTitle(doc, "Il flow in 5 step");
  const steps = [
    { n: "01", t: "Compila il profilo", d: "Moto, brand, bio, gusti musicali, zona, preferenze. L'AI legge la bio e ne estrae le affinità." },
    { n: "02", t: "Tracking GPS (opzionale)", d: "Percorsi, fasce orarie, lean angle, G-force. Solo su richiesta esplicita. Ghost Mode disponibile." },
    { n: "03", t: "Engine calcola l'affinità", d: "17 segnali con pesi configurabili → score normalizzato 0-1 → media pesata finale." },
    { n: "04", t: "Filtri e preferenze", d: "Esclusioni per tipo moto, fascia d'età, genere. Feedback loop automatico su preferenze negative." },
    { n: "05", t: "Top match con il 'perché'", d: "Badge di trasparenza: sai sempre perché ti è stato proposto un biker. Zero black box." },
  ];
  const stepColW = CONTENT_W / 5;
  steps.forEach((s, i) => {
    const x = MARGIN + i * stepColW;
    const isLast = i === steps.length - 1;
    doc.rect(x + 2, doc.y, stepColW - 4, 70).fill(i === 2 ? "#FFF0EF" : LIGHT);
    if (i === 2) doc.rect(x + 2, doc.y, stepColW - 4, 2).fill(RED);
    doc.font("Helvetica-Bold").fontSize(16).fillColor(i === 2 ? RED : BORDER).text(s.n, x + 8, doc.y + 6);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(i === 2 ? RED : DARK).text(s.t, x + 8, doc.y + 26, { width: stepColW - 16 });
    doc.font("Helvetica").fontSize(7.5).fillColor(GRAY).text(s.d, x + 8, doc.y + 42, { width: stepColW - 16, lineGap: 1.5 });
    if (!isLast) {
      doc.font("Helvetica-Bold").fontSize(14).fillColor(RED)
        .text("→", x + stepColW - 12, doc.y + 28);
    }
  });
  doc.y += 76;

  // ── PAGE 3: SCORING + 17 SEGNALI ───────────────────────────────────────────
  doc.addPage();
  header(doc, "Engine di Scoring", "Formula, categorie e 17 segnali");
  footer(doc, 3);

  sectionTitle(doc, "Formula di scoring");
  doc.rect(MARGIN, doc.y, CONTENT_W, 38).fill(LIGHT);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(RED)
    .text("score = Σ(wᵢ × Sᵢ) / Σ(wᵢ)", MARGIN, doc.y + 8, { align: "center", width: CONTENT_W });
  doc.font("Helvetica").fontSize(9).fillColor(GRAY)
    .text("Ogni segnale Sᵢ ∈ [0, 1]. I pesi wᵢ sono configurabili dall'admin. Segnali senza dati (es. GPS non attivo) pesano 0.", MARGIN, doc.y + 24, { width: CONTENT_W, align: "center" });
  doc.y += 48;

  sectionTitle(doc, "Le 4 categorie di segnali");
  const cats = [
    { name: "Geo-temporali", pct: "35%", color: RED, desc: "Distanza geohash, overlap fasce orarie, zone percorse, route affinity su percorsi reali e pianificati." },
    { name: "Telemetrici", pct: "25%", color: "#E05500", desc: "Lean angle medio, G-force laterale, velocità in curva. Lo stile di guida reale dalla telemetria del telefono." },
    { name: "Semantici", pct: "22%", color: "#888888", desc: "Affinità bio e musica via embeddings vettoriali (OpenAI text-embedding-3-large + fallback self-hosted, 1536 dim)." },
    { name: "Diretti", pct: "18%", color: "#AAAAAA", desc: "Brand moto, tag comuni (musica/stile_guida/tipo_moto), lingua, fascia d'età, club condivisi." },
  ];
  const catW = CONTENT_W / 2 - 6;
  cats.forEach((c, i) => {
    const col = i % 2;
    const row_ = Math.floor(i / 2);
    const x = MARGIN + col * (catW + 12);
    const y = doc.y + row_ * 68;
    doc.rect(x, y, catW, 62).fill(LIGHT);
    doc.rect(x, y, 4, 62).fill(c.color);
    const barW = (parseFloat(c.pct) / 100) * (catW - 60);
    doc.rect(x + catW - barW - 8, y + 24, barW, 10).fill(c.color).fillOpacity(0.3);
    doc.rect(x + catW - barW - 8, y + 24, barW, 10).stroke(c.color);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text(c.name, x + 12, y + 8);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(c.color).text(c.pct, x + catW - 44, y + 6);
    doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(c.desc, x + 12, y + 36, { width: catW - 20, lineGap: 1.5 });
  });
  doc.y += 150;

  sectionTitle(doc, "I 17 segnali di affinità");
  const signals = [
    ["#", "Segnale", "Categoria", "Metrica / Note"],
    ["01", "Brand moto", "Diretti", "Match esatto brand / punteggio parziale per segmento compatibile"],
    ["02", "Tipo moto (tag)", "Diretti", "Jaccard ≥ 0.30, min 1 tag in comune — categoria tipo_moto"],
    ["03", "Stile guida (tag)", "Diretti", "Jaccard ≥ 0.30 — categoria stile_guida"],
    ["04", "Musica (tag)", "Diretti", "Jaccard ≥ 0.25, min 1 tag — categoria musica"],
    ["05", "Lingua", "Diretti", "Bonus se stessa lingua dichiarata nel profilo"],
    ["06", "Fascia d'età", "Diretti", "Score inversamente proporzionale alla distanza anagrafica"],
    ["07", "Club condivisi", "Diretti", "Moltiplicatore se i biker fanno parte dello stesso motoclub"],
    ["08", "Distanza geohash", "Geo-temporali", "H3 geohash su zona di residenza/frequentazione abituale"],
    ["09", "Overlap fasce orarie", "Geo-temporali", "Sovrapposizione delle finestre temporali di guida (giorno/ora)"],
    ["10", "Zone percorse", "Geo-temporali", "Celle H3 in comune nelle sessioni GPS storiche"],
    ["11", "Route affinity (GPS)", "Geo-temporali", "Similarità coseno tra vettori di percorso GPS registrati"],
    ["12", "Route affinity (pianificati)", "Geo-temporali", "Overlap su percorsi pianificati condivisi / salvati"],
    ["13", "Affinità bio (embedding)", "Semantici", "Coseno tra embedding bio — cattura sinonimi e concetti vicini"],
    ["14", "Affinità musicale (embedding)", "Semantici", "Embedding testo libero musica + artisti → affinità semantica"],
    ["15", "Lean angle medio", "Telemetrici", "Differenza media lean angle sessioni GPS (stile di guida)"],
    ["16", "G-force laterale", "Telemetrici", "Compatibilità ritmo in curva da accelerometro telefono"],
    ["17", "Velocità in curva", "Telemetrici", "Score da velocità media nelle curve — indica aggressività guida"],
  ];
  const sigColW = [24, 140, 100, CONTENT_W - 24 - 140 - 100];
  let ty = doc.y;
  signals.forEach((r, i) => {
    if (ty + 20 > PAGE_H - 60) {
      doc.addPage();
      header(doc, "I 17 segnali (continua)", "");
      footer(doc, 4);
      ty = doc.y;
    }
    ty = row(doc, r, sigColW, i === 0, ty);
  });
  doc.y = ty + 8;

  // ── PAGE 4/5: TECH STACK + ROADMAP + BADGES ────────────────────────────────
  doc.addPage();
  header(doc, "Architettura tecnica e Roadmap", "Stack, layer e stato features");
  footer(doc, 5);

  sectionTitle(doc, "Stack tecnico");
  const stack = [
    ["Layer", "Tecnologia", "Note"],
    ["Database", "PostgreSQL 16 + PostGIS + pgvector", "Percorsi, score, embeddings 1536 dim"],
    ["Cache & Code", "Redis 7 + BullMQ", "Cache score, code ricalcolo async, lock distribuiti"],
    ["Scoring Engine", "Express + TypeScript", "17 segnali, pesi configurabili, feedback loop, decay"],
    ["Embeddings", "OpenAI text-embedding-3-large + multilingual-e5-small", "Bio e musica. Fallback self-hosted per resilienza"],
    ["AI Orchestration", "Anthropic Claude + OpenAI GPT + Google Gemini", "Cascata fallback automatica. 99.95% uptime atteso"],
    ["Geo", "PostGIS + H3 geohash", "Distanze reali, zone di guida, route affinity"],
    ["Client", "React Native (Expo) + React Query", "App mobile iOS/Android. OTA via EAS Updates"],
    ["A/B Testing", "Framework interno + Redis flag", "Split test algoritmi su % utenti configurabile"],
  ];
  const stackColW = [100, 200, CONTENT_W - 300];
  let sy = doc.y;
  stack.forEach((r, i) => { sy = row(doc, r, stackColW, i === 0, sy); });
  doc.y = sy + 16;

  sectionTitle(doc, "Roadmap features matching");
  const roadmap = [
    ["Status", "Feature", "Stato"],
    ["✅", "Engine scoring 17 segnali", "Completato"],
    ["✅", "Embeddings bio e musica (OpenAI + self-hosted)", "Completato"],
    ["✅", "Feedback loop + decay temporale", "Completato"],
    ["✅", "A/B testing framework", "Completato"],
    ["✅", "Lock distribuiti + code BullMQ", "Completato"],
    ["✅", "AI Orchestration cascade (6 AI, 8 modelli)", "Completato"],
    ["🔄", "Integrazione routing curvy nel matching (route affinity)", "In corso"],
    ["🔄", "Dashboard admin matching (pesi, metriche, A/B)", "In corso"],
    ["📋", "Toggle utente segnali individuali (UI)", "Pianificato"],
    ["📋", "Digest settimanale automatico (email/push)", "Pianificato"],
    ["📋", "Matching cross-club (biker di club compatibili)", "Pianificato"],
  ];
  const rdColW = [30, CONTENT_W - 130, 100];
  let ry = doc.y;
  roadmap.forEach((r, i) => { ry = row(doc, r, rdColW, i === 0, ry); });
  doc.y = ry + 16;

  sectionTitle(doc, "Badge di trasparenza");
  doc.font("Helvetica").fontSize(9.5).fillColor(DARK)
    .text("Ogni match è accompagnato da badge che spiegano i motivi principali. Il biker sa sempre perché gli è stato proposto un altro utente — nessuna black box.", MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
  doc.y += 14;
  const badges = [
    "Stessa moto", "Stessa musica", "Percorsi simili", "Stesso orario",
    "Zona vicina", "Stesso stile di guida", "Stesso club", "Alta affinità",
  ];
  const bCols = 4;
  const bW = CONTENT_W / bCols;
  badges.forEach((b, i) => {
    const bx = MARGIN + (i % bCols) * bW;
    const by = doc.y + Math.floor(i / bCols) * 34;
    doc.rect(bx + 4, by, bW - 8, 28).fill(LIGHT);
    doc.rect(bx + 4, by, 3, 28).fill(RED);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text(b, bx + 14, by + 9, { width: bW - 20 });
  });
  doc.y += 76;

  // ── FINAL PAGE: PRIVACY NOTE ───────────────────────────────────────────────
  doc.addPage();
  header(doc, "Privacy e controllo utente", "Cosa raccogliamo e come disattivare");
  footer(doc, 6);

  sectionTitle(doc, "Principi privacy");
  const privacyPoints = [
    { title: "GPS solo su richiesta esplicita", desc: "Il tracking GPS non parte mai in background. L'utente attiva ogni sessione manualmente. Ghost Mode disponibile per chi non vuole essere visibile nella mappa." },
    { title: "Embeddings non reversibili", desc: "La bio e il testo musicale vengono convertiti in vettori numerici (1536 dimensioni). I vettori non permettono di risalire al testo originale." },
    { title: "Telemetria anonimizzata", desc: "Lean angle, G-force e velocità in curva vengono aggregati in metriche di stile. Non si registra la posizione GPS in real-time durante la guida senza consenso." },
    { title: "Disattivazione granulare", desc: "Ogni tipo di segnale può essere disattivato indipendentemente. L'utente può escludersi dall'engine di scoring mantenendo l'account attivo." },
    { title: "Nessuna vendita a terzi", desc: "I dati di affinità e matching non vengono venduti né ceduti a soggetti terzi. Non sono presenti annunci pubblicitari nei risultati di matching." },
    { title: "Diritto all'oblio", desc: "Su richiesta, tutti i dati di matching (score storici, embeddings, tracce GPS) vengono eliminati entro 30 giorni. L'account può essere cancellato in autonomia dall'app." },
  ];
  privacyPoints.forEach((p) => {
    const y = doc.y;
    doc.rect(MARGIN, y, CONTENT_W, 50).fill(LIGHT);
    doc.rect(MARGIN, y, 3, 50).fill(RED);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(DARK).text(p.title, MARGIN + 12, y + 7);
    doc.font("Helvetica").fontSize(9).fillColor(GRAY).text(p.desc, MARGIN + 12, y + 22, { width: CONTENT_W - 24, lineGap: 2 });
    doc.y = y + 56;
  });

  doc.end();
  return doc as unknown as Readable;
}
