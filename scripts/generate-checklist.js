const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel, PageOrientation } = require("docx");
const fs = require("fs");

const GRAY = "999999";
const BLUE = "4A90D9";
const ACCENT = "D4A017";

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 28, color: BLUE })],
  });
}

function subheading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24 })],
  });
}

function cellBorders() {
  const b = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  return { top: b, bottom: b, left: b, right: b };
}

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: cellBorders(),
    shading: { fill: "2A2A2A" },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 18, color: "FFFFFF" })] })],
  });
}

function cell(text, width, center) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: cellBorders(),
    children: [new Paragraph({ alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text, size: 18 })] })],
  });
}

function checkCell(width) {
  return cell("☐", width, true);
}

function makeTable(headers, rows) {
  const headerRow = new TableRow({
    children: headers.map((h) => headerCell(h.text, h.width)),
    tableHeader: true,
  });
  const dataRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map((c) => {
          if (c.check) return checkCell(c.width);
          return cell(c.text || "", c.width, c.center || false);
        }),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function section(num, title, headers, rows) {
  return [subheading(`${num}. ${title}`), makeTable(headers, rows)];
}

const W = { num: 5, test: 45, ok: 8, ko: 8, note: 26 };
const W3 = { num: 5, test: 35, b: 10, z: 10, c: 10, note: 22 };

const h4 = [
  { text: "#", width: W.num },
  { text: "Test", width: W.test },
  { text: "OK", width: W.ok },
  { text: "KO", width: W.ko },
  { text: "Note", width: W.note },
];

function row4(num, text) {
  return [
    { text: num, width: W.num, center: true },
    { text, width: W.test },
    { check: true, width: W.ok },
    { check: true, width: W.ko },
    { text: "", width: W.note },
  ];
}

const h3type = [
  { text: "#", width: W3.num },
  { text: "Test", width: W3.test },
  { text: "Biker", width: W3.b },
  { text: "Zavorrina", width: W3.z },
  { text: "Coppia", width: W3.c },
  { text: "Note", width: W3.note },
];

function row3type(num, text, b, z, c) {
  return [
    { text: num, width: W3.num, center: true },
    { text, width: W3.test },
    b ? { check: true, width: W3.b } : { text: "—", width: W3.b, center: true },
    z ? { check: true, width: W3.z } : { text: "—", width: W3.z, center: true },
    c ? { check: true, width: W3.c } : { text: "—", width: W3.c, center: true },
    { text: "", width: W3.note },
  ];
}

const h2bz = [
  { text: "#", width: 5 },
  { text: "Test", width: 40 },
  { text: "Biker", width: 10 },
  { text: "Zavorrina", width: 10 },
  { text: "Note", width: 27 },
];

function row2bz(num, text, b, z) {
  return [
    { text: num, width: 5, center: true },
    { text, width: 40 },
    b ? { check: true, width: 10 } : { text: "—", width: 10, center: true },
    z ? { check: true, width: 10 } : { text: "—", width: 10, center: true },
    { text: "", width: 27 },
  ];
}

const h2gc = [
  { text: "#", width: 5 },
  { text: "Test", width: 40 },
  { text: "Biker/Coppia", width: 12 },
  { text: "Zavorrina", width: 10 },
  { text: "Note", width: 25 },
];

function row2gc(num, text, bc, z) {
  return [
    { text: num, width: 5, center: true },
    { text, width: 40 },
    bc ? { check: true, width: 12 } : { text: "—", width: 12, center: true },
    z ? { check: true, width: 10 } : { text: "—", width: 10, center: true },
    { text: "", width: 25 },
  ];
}

const doc = new Document({
  sections: [
    {
      properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "BIKERLINK", bold: true, size: 40, color: BLUE })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 50 },
          children: [new TextRun({ text: "Checklist di Test Completa", bold: true, size: 28 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({ text: "\"U'll never ride alone\"", italics: true, size: 22, color: ACCENT })],
        }),
        new Paragraph({
          spacing: { after: 400 },
          children: [
            new TextRun({ text: "Data: _________________    Tester: _________________", size: 22 }),
          ],
        }),

        ...section("1", "AUTENTICAZIONE", h3type, [
          row3type("1.1", "Registrazione nuovo utente", true, true, true),
          row3type("1.2", "Login con nickname", true, true, true),
          row3type("1.3", "Login con email", true, true, true),
          row3type("1.4", "Password errata → messaggio errore", true, true, true),
          row3type("1.5", "Logout", true, true, true),
          row3type("1.6", "Password dimenticata", true, true, true),
        ]),

        ...section("2", "MAPPA (Home)", h4, [
          row4("2.1", "Mappa si carica con posizione GPS"),
          row4("2.2", "Utenti vicini visibili sulla mappa"),
          row4("2.3", "Filtro Biker (icona BLU)"),
          row4("2.4", "Filtro Zavorrina (icona ROSA)"),
          row4("2.5", "Filtro Coppia (icona ORO)"),
          row4("2.6", "Click su utente → apre dettaglio"),
          row4("2.7", "Dettaglio mostra moto, bio, regione"),
          row4("2.8", "Officine visibili sulla mappa"),
          row4("2.9", "Easter egg visibili sulla mappa"),
          row4("2.10", "Banner Syneco visibile"),
          row4("2.11", "Contatore biker online corretto"),
          row4("2.12", "Contatore zavorrine disponibili corretto"),
          row4("2.13", "L'utente loggato si vede nelle liste"),
        ]),

        ...section("3", "PROPOSTE / RICHIESTE", h2bz, [
          row2bz("3.1", 'Crea "FindAFriend" → tipo Giro (icona BLU)', true, false),
          row2bz("3.2", 'Crea "FindAGuest" → tipo Con Zavorrina (icona ROSA)', true, false),
          row2bz("3.3", 'Crea "Hitcher" → Passaggio al volo (icona VERDE)', true, false),
          row2bz("3.4", 'Crea "HitchHiker" → Passaggio al volo (icona VERDE)', false, true),
          row2bz("3.5", 'Crea "FindABiker" → tipo Richieste', false, true),
          row2bz("3.6", 'Filtro "Tutti" mostra tutte le proposte', true, true),
          row2bz("3.7", 'Filtro "Giro" mostra solo giri', true, true),
          row2bz("3.8", 'Filtro "Con Zavorrina" mostra solo find_a_guest', true, true),
          row2bz("3.9", 'Filtro "Passaggio al volo" mostra hitcher/hitchhiker', true, true),
          row2bz("3.10", 'Filtro "Richieste" mostra solo find_a_biker', true, true),
          row2bz("3.11", "Filtri appaiono subito senza flash/resize", true, true),
          row2bz("3.12", 'Validazione orario: "alle" > "dalle"', true, true),
          row2bz("3.13", "Geocoding indirizzo manuale funziona", true, true),
          row2bz("3.14", "Dettaglio proposta mostra info corrette", true, true),
          row2bz("3.15", "Elimina proposta (solo creatore)", true, true),
          row2bz("3.16", "Partecipa a proposta altrui", true, true),
        ]),

        ...section("4", "READY TO RIDE", h4, [
          row4("4.1", "Toggle disponibilità ON"),
          row4("4.2", "Toggle disponibilità OFF"),
          row4("4.3", "Toggle GPS deselezionabile"),
          row4("4.4", "Contatori si aggiornano dopo toggle"),
          row4("4.5", "Stato visibile agli altri utenti sulla mappa"),
        ]),

        ...section("5", "GARAGE / WISHLIST", h2gc, [
          row2gc("5.1", "Aggiungere moto al garage", true, false),
          row2gc("5.2", "Modificare moto nel garage", true, false),
          row2gc("5.3", "Eliminare moto dal garage", true, false),
          row2gc("5.4", "Aggiungere moto alla wishlist", false, true),
          row2gc("5.5", "Modificare wishlist", false, true),
          row2gc("5.6", "Eliminare dalla wishlist", false, true),
        ]),

        ...section("6", "TRACKING (Performance Counter)", h4, [
          row4("6.1", "Avvia tracciamento"),
          row4("6.2", "Velocità corrente visibile"),
          row4("6.3", "Distanza si aggiorna"),
          row4("6.4", "Ferma tracciamento"),
          row4("6.5", "Record salvato nello storico"),
          row4("6.6", "Dettaglio record mostra statistiche"),
        ]),

        ...section("7", "CHAT", h4, [
          row4("7.1", "Lista conversazioni visibile"),
          row4("7.2", "Aprire chat diretta con utente"),
          row4("7.3", "Inviare messaggio"),
          row4("7.4", "Ricevere messaggio"),
          row4("7.5", '"Inizia la conversazione" centrato (non specchiato)'),
          row4("7.6", "Creare conversazione dal profilo utente"),
        ]),

        ...section("8", "CONCORSO FOTO", h4, [
          row4("8.1", "Caricare foto"),
          row4("8.2", "Votare foto altrui"),
          row4("8.3", "Visualizzare classifica/vincitori"),
        ]),

        ...section("9", "PROFILO", h4, [
          row4("9.1", "Visualizzare proprio profilo"),
          row4("9.2", "Modificare bio/regione/città"),
          row4("9.3", "Visualizzare profilo altrui (da lista o mappa)"),
          row4("9.4", 'Pulsante "Scrivi un messaggio" su profilo altrui'),
          row4("9.5", 'Proprio profilo NON mostra "Scrivi un messaggio"'),
        ]),

        ...section("10", "EASTER EGGS", h4, [
          row4("10.1", "Easter egg visibili sulla mappa"),
          row4("10.2", "Raccogliere easter egg"),
        ]),

        ...section("11", "ADMIN / MODERATORE", h4, [
          row4("11.1", "Accesso pannello admin (se autorizzato)"),
          row4("11.2", "Gestione utenti"),
          row4("11.3", "Gestione officine"),
          row4("11.4", "Gestione easter egg"),
          row4("11.5", "Analytics"),
          row4("11.6", "Accesso pannello moderatore"),
        ]),

        ...section("12", "UI / UX GENERALE", h4, [
          row4("12.1", "Tutta l'interfaccia è in italiano"),
          row4("12.2", "Tema scuro coerente su tutti gli schermi"),
          row4("12.3", 'Nessun "This screen does not exist"'),
          row4("12.4", "Navigazione tra tab fluida"),
          row4("12.5", "Safe area rispettata (no testo sotto notch)"),
        ]),

        new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "Legenda: ☐ = da verificare — Segna ✓ o ✗ dopo il test", size: 20, color: GRAY })] }),
        new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "Note generali: _______________________________________________", size: 20 })] }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("BikerLink_Checklist.docx", buffer);
  console.log("BikerLink_Checklist.docx generato!");
});
