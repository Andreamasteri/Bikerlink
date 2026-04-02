import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'manuale-utente-bikerlink-aprile2026.pdf');
const PUBLIC_PATH = path.join(ROOT, 'server', 'public', 'bikerlink-manual.pdf');

const ORANGE = '#E85D04';
const DARK = '#1A1A2E';
const GRAY = '#555555';
const LIGHTGRAY = '#888888';
const WHITE = '#FFFFFF';
const CREAM = '#FFF8F3';

function cover(doc) {
  // Orange background
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(ORANGE);

  // White diagonal stripe
  doc.polygon(
    [0, doc.page.height * 0.55],
    [doc.page.width, doc.page.height * 0.35],
    [doc.page.width, doc.page.height],
    [0, doc.page.height]
  ).fill(DARK);

  // BikerLink title
  doc.fill(WHITE)
     .font('Helvetica-Bold')
     .fontSize(52)
     .text('BikerLink', 0, 180, { align: 'center' });

  // Tagline
  doc.fill(WHITE)
     .font('Helvetica-Oblique')
     .fontSize(18)
     .text("U'll never ride alone", 0, 248, { align: 'center' });

  // Separator line
  const lineY = 285;
  doc.moveTo(80, lineY).lineTo(doc.page.width - 80, lineY).strokeColor(WHITE).lineWidth(1).stroke();

  // Manual title
  doc.fill(WHITE)
     .font('Helvetica-Bold')
     .fontSize(22)
     .text('MANUALE UTENTE', 0, 300, { align: 'center' });

  // Version
  doc.fill(WHITE)
     .font('Helvetica')
     .fontSize(12)
     .text('Versione: Aprile 2026  ·  App v1.1.0', 0, 332, { align: 'center' });

  // Bottom white area info
  doc.fill(WHITE)
     .font('Helvetica')
     .fontSize(11)
     .text('Italiano  ·  Guida Completa', 0, doc.page.height - 80, { align: 'center' });

  doc.fill(WHITE)
     .font('Helvetica')
     .fontSize(10)
     .text('www.biker-link.replit.app', 0, doc.page.height - 55, { align: 'center' });
}

function addPageFooter(doc, pageNum) {
  const bottom = doc.page.height - 35;
  doc.moveTo(doc.page.margins.left, bottom - 5)
     .lineTo(doc.page.width - doc.page.margins.right, bottom - 5)
     .strokeColor('#DDDDDD').lineWidth(0.5).stroke();
  doc.fill(LIGHTGRAY)
     .font('Helvetica')
     .fontSize(8)
     .text("BikerLink — U'll never ride alone", doc.page.margins.left, bottom, { continued: true })
     .text(`Pagina ${pageNum}`, { align: 'right' });
}

function chapterTitle(doc, num, title) {
  doc.addPage();
  // Orange accent bar
  doc.rect(doc.page.margins.left, 72, 4, 36).fill(ORANGE);
  doc.fill(ORANGE)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(`CAPITOLO ${num}`, doc.page.margins.left + 14, 72);
  doc.fill(DARK)
     .font('Helvetica-Bold')
     .fontSize(22)
     .text(title, doc.page.margins.left + 14, 88);
  doc.moveDown(1.2);
}

function sectionTitle(doc, title) {
  doc.moveDown(0.8);
  doc.fill(ORANGE)
     .font('Helvetica-Bold')
     .fontSize(13)
     .text(title);
  doc.moveDown(0.2);
}

function subTitle(doc, title) {
  doc.moveDown(0.5);
  doc.fill(DARK)
     .font('Helvetica-Bold')
     .fontSize(11)
     .text(title);
  doc.moveDown(0.15);
}

function body(doc, text) {
  doc.fill(DARK)
     .font('Helvetica')
     .fontSize(10)
     .text(text, { lineGap: 3, paragraphGap: 4 });
}

function bullet(doc, items) {
  items.forEach(item => {
    doc.fill(DARK)
       .font('Helvetica')
       .fontSize(10)
       .text(`• ${item}`, { indent: 14, lineGap: 2, paragraphGap: 2 });
  });
}

function numbered(doc, items) {
  items.forEach((item, i) => {
    doc.fill(DARK)
       .font('Helvetica')
       .fontSize(10)
       .text(`${i + 1}.  ${item}`, { indent: 14, lineGap: 2, paragraphGap: 2 });
  });
}

function infoBox(doc, text) {
  const boxX = doc.page.margins.left;
  const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const savedY = doc.y;
  doc.rect(boxX, savedY, boxW, 1).fill(CREAM);
  doc.moveDown(0.1);
  doc.fill(ORANGE)
     .font('Helvetica-Oblique')
     .fontSize(9.5)
     .text(text, boxX + 10, savedY + 6, { width: boxW - 20, lineGap: 2 });
  doc.moveDown(0.6);
}

async function main() {
  const doc = new PDFDocument({
    margin: 60,
    size: 'A4',
    info: {
      Title: 'BikerLink — Manuale Utente',
      Author: 'BikerLink',
      Subject: 'Guida completa per utenti BikerLink',
      Keywords: 'bikerlink, moto, biker, zavorrina, manuale, guida',
      CreationDate: new Date(),
    }
  });

  const stream = fs.createWriteStream(OUT_PATH);
  doc.pipe(stream);

  let pageNum = 0;
  doc.on('pageAdded', () => { pageNum++; });

  // === COVER ===
  cover(doc);

  // === INDICE ===
  doc.addPage();
  pageNum++;
  doc.fill(ORANGE).font('Helvetica-Bold').fontSize(18).text('INDICE', { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(ORANGE).lineWidth(1).stroke();
  doc.moveDown(0.8);

  const tocItems = [
    ['1.', 'Introduzione'],
    ['2.', 'Registrazione e Accesso'],
    ['3.', 'Schermata Principale — Mappa'],
    ['4.', 'Tab Proposte'],
    ['5.', 'Tab Ride!'],
    ['6.', 'Tab Match'],
    ['7.', 'Tab Pic! — Contest Fotografico'],
    ['8.', 'Tab Chat'],
    ['9.', 'Tab MotoClub'],
    ['10.', 'Tab Profilo'],
    ['11.', 'Funzioni Speciali'],
    ['12.', 'Sicurezza e Privacy'],
  ];
  tocItems.forEach(([num, title]) => {
    doc.fill(DARK).font('Helvetica-Bold').fontSize(11).text(num, doc.page.margins.left, doc.y, { continued: true, width: 30 });
    doc.fill(DARK).font('Helvetica').fontSize(11).text(title);
    doc.moveDown(0.3);
  });

  // === CAPITOLO 1 — Introduzione ===
  chapterTitle(doc, 1, 'Introduzione');
  body(doc, 'BikerLink è l\'app italiana che connette motociclisti e passeggeri in tutta Italia. Nata dalla passione per le due ruote, BikerLink unisce tre anime diverse della community motociclistica in un\'unica piattaforma intuitiva e sicura.');
  doc.moveDown(0.5);
  sectionTitle(doc, 'Chi può usare BikerLink');
  bullet(doc, [
    'I Biker: chi ha una moto e cerca compagnia, passeggeri o avventure su due ruote',
    'Le Zavorrine/i Zavorrini: i passeggeri appassionati che sognano di viaggiare su ogni tipo di moto',
    'Le Coppie: chi viaggia insieme e vuole incontrare altri appassionati',
  ]);
  doc.moveDown(0.5);
  sectionTitle(doc, 'Cosa puoi fare con BikerLink');
  bullet(doc, [
    'Trovare biker e passeggeri disponibili grazie alla mappa interattiva in tempo reale',
    'Creare e partecipare a proposte di giro, raduni e passaggi',
    'Ricevere match automatici basati su compatibilità moto e preferenze',
    'Attivare il sistema SOS di emergenza in caso di problemi in strada',
    'Registrare percorsi GPS con statistiche complete (distanza, velocità, altitudine)',
    'Partecipare al contest fotografico settimanale della community',
    'Unirti ai MotoClub per marca, modello o zona geografica',
    'Chattare in privato o in gruppo con altri motociclisti',
  ]);
  doc.moveDown(0.5);
  sectionTitle(doc, 'Disponibilità');
  body(doc, 'BikerLink è disponibile come applicazione mobile Android (APK scaricabile) e come applicazione web accessibile da qualsiasi browser moderno.');

  // === CAPITOLO 2 — Registrazione ===
  chapterTitle(doc, 2, 'Registrazione e Accesso');

  sectionTitle(doc, '2.1 Tipi di Utente');
  subTitle(doc, 'Biker');
  body(doc, 'Sei un motociclista. Hai una o più moto e vuoi trovare compagnia per i tuoi giri, cercare una zavorrina o incontrare altri biker. Come biker puoi aggiungere le tue moto al Garage, creare proposte di giro, ricevere match automatici con le zavorrine e registrare percorsi GPS.');
  doc.moveDown(0.3);
  subTitle(doc, 'Zavorrina / Zavorrino');
  body(doc, 'Sei un passeggero appassionato di moto. Non guidi tu, ma ami viaggiare in sella. Come zavorrina/o puoi creare una Wishlist con le moto su cui vorresti viaggiare e ricevere match automatici con i biker il cui garage corrisponde alle tue preferenze.');
  doc.moveDown(0.3);
  subTitle(doc, 'Coppia');
  body(doc, 'Siete una coppia che viaggia insieme in moto. Potete specificare la configurazione (M+M, M+F, F+F) e gestire un profilo condiviso con sezione Garage. Partecipate a tutti i sistemi di matching e proposte con un\'identità di coppia.');

  sectionTitle(doc, '2.2 Procedura di Registrazione — 4 Step');
  numbered(doc, [
    'Tipo utente: scegli tra Biker, Zavorrina/Zavorrino o Coppia. Se sei Coppia, seleziona anche la configurazione (M+M, M+F, F+F).',
    'Genere: seleziona M o F (per Biker/Zavorrina) oppure la configurazione della coppia.',
    'Dati account: nickname (min. 3 caratteri, unico), email, password (min. 8 caratteri con maiuscola, minuscola e numero). Opzionali: telefono, anno di nascita (min. 18 anni), regione.',
    'EULA: leggi e accetta le condizioni d\'uso di BikerLink. Puoi consultare la Privacy Policy direttamente dall\'app.',
  ]);

  sectionTitle(doc, '2.3 Login e Gestione Account');
  body(doc, 'Accedi con email e password dalla schermata di login. Per la password dimenticata, tocca "Password dimenticata?" e riceverai un link di reset via email.');
  doc.moveDown(0.3);
  body(doc, 'Se il sistema di verifica email è attivo, riceverai un codice di 6 cifre da inserire per attivare il tuo account. La sessione rimane attiva: non dovrai fare login ad ogni apertura dell\'app.');

  // === CAPITOLO 3 — Mappa ===
  chapterTitle(doc, 3, 'Schermata Principale — Mappa');
  body(doc, 'La schermata principale è il cuore di BikerLink. Qui puoi vedere tutti gli utenti disponibili in tempo reale e avere una visione d\'insieme della community nella tua zona.');

  sectionTitle(doc, '3.1 Header e Barra di Ricerca');
  body(doc, 'In cima trovi il logo BikerLink con l\'icona del casco, l\'icona Chat per accedere rapidamente alle conversazioni, e la barra di ricerca. Puoi cercare altri utenti per nickname o email: i risultati appaiono in tempo reale. Tocca un risultato per aprire il profilo dell\'utente.');

  sectionTitle(doc, '3.2 Mappa Interattiva');
  body(doc, 'La mappa mostra in tempo reale:');
  bullet(doc, [
    'Icone utenti colorate: blu scuro (biker maschio), rosa/fucsia (biker femmina o zavorrina), viola (coppia)',
    'Icone officina: officine e meccanici convenzionati con BikerLink',
    'Cerchi rossi pulsanti: richieste SOS attive, con raggio visibile',
    'Icone Easter Egg: oggetti virtuali nascosti da raccogliere durante i giri',
  ]);
  doc.moveDown(0.3);
  body(doc, 'Tocca un\'icona utente per vedere il popup con nickname, tipo e distanza. Dal popup puoi aprire il profilo completo o iniziare una chat. Pizzica/allarga per zoom. Tocca l\'icona di espansione per la mappa a schermo intero.');

  sectionTitle(doc, '3.3 Filtri Mappa');
  body(doc, 'In cima alla mappa trovi i filtri per tipo di utente: Tutti, Biker, Zavorrine, Coppie. I filtri si combinano e si applicano immediatamente.');

  sectionTitle(doc, '3.4 Counter Utenti in Tempo Reale');
  body(doc, 'Sotto la mappa trovi tre riquadri: Utenti Online, Biker Disponibili, Zavorrine Disponibili. Tocca ciascun riquadro per aprire la lista completa degli utenti in quella categoria, con informazioni e distanza da te.');

  sectionTitle(doc, '3.5 Segnale SOS sulla Mappa');
  body(doc, 'Quando un utente nella tua zona ha inviato un SOS, appare un banner di emergenza arancione con nickname, motivo, ora e raggio. Tocca per vedere i dettagli e premi "Accetta" per rispondere: si apre una chat privata e la posizione dell\'utente è indicata sulla mappa.');

  // === CAPITOLO 4 — Proposte ===
  chapterTitle(doc, 4, 'Tab Proposte');
  body(doc, 'La sezione Proposte è dove si organizza la vita di community: giri, raduni, passaggi e qualsiasi tipo di uscita motociclistica.');

  sectionTitle(doc, '4.1 Categorie di Proposta');
  subTitle(doc, 'Giro tra Biker');
  body(doc, 'Un\'uscita organizzata tra motociclisti. Ideale per chi cerca compagni di viaggio. Puoi specificare percorso, destinazione e numero massimo di partecipanti.');
  subTitle(doc, 'Con Zavorrina');
  body(doc, 'Un biker che cerca un passeggero, o una zavorrina che cerca un passaggio. Il sistema abbina automaticamente queste proposte con wishlist e garage.');
  subTitle(doc, 'Passaggio al Volo');
  body(doc, 'Un\'offerta o richiesta di passaggio veloce. Perfetto per spostamenti brevi o imprevisti.');
  subTitle(doc, 'Richieste');
  body(doc, 'Annunci generici dalla community: consigli su percorsi, ricerca meccanici, compagni per raduni, ecc.');

  sectionTitle(doc, '4.2 Creare una Proposta');
  body(doc, 'Tocca il pulsante "+" in basso a destra. Compila i campi:');
  bullet(doc, [
    'Tipo proposta (obbligatorio): scegli tra le 4 categorie',
    'Titolo (obbligatorio): nome breve e descrittivo dell\'uscita',
    'Descrizione (opzionale): dettagli del percorso, abbigliamento richiesto, ecc.',
    'Indirizzo di partenza (obbligatorio): cerca l\'indirizzo o usa il GPS',
    'Destinazione (opzionale): l\'arrivo del giro',
    'Data (obbligatoria): il giorno dell\'uscita',
    'Fascia oraria di partenza (obbligatoria): mattina, pomeriggio, sera o notte',
    'Raggio di ricerca (obbligatorio): entro quanti km cercare partecipanti',
    'Numero massimo partecipanti (obbligatorio): il limite di posti',
    'Moto (per i biker): seleziona quale moto userai, dal tuo garage',
  ]);

  sectionTitle(doc, '4.3 Filtrare le Proposte');
  body(doc, 'Filtra per categoria, data, distanza o disponibilità. I filtri sono combinabili e si applicano immediatamente alla lista.');

  // === CAPITOLO 5 — Ride! ===
  chapterTitle(doc, 5, 'Tab Ride!');
  body(doc, 'La tab Ride! è il centro operativo per quando sei in sella. Da qui gestisci disponibilità, SOS e registrazione percorsi.');

  sectionTitle(doc, '5.1 Stato di Disponibilità');
  body(doc, 'Il grande pulsante circolare al centro attiva/disattiva la tua disponibilità. Quando sei disponibile, la tua icona appare sulla mappa di tutti gli utenti nella tua zona. Quando sei non disponibile, la tua icona è nascosta.');

  sectionTitle(doc, '5.2 SOS — Richiesta di Soccorso');
  body(doc, 'In caso di emergenza (foratura, guasto, incidente, batteria scarica):');
  numbered(doc, [
    'Tocca "LANCIA SOS"',
    'Descrivi brevemente il problema (es. "Foratura gomma posteriore")',
    'Scegli il raggio: 10 km, 20 km, 50 km o valore personalizzato (max 100 km)',
    'Tocca "Invia SOS"',
  ]);
  doc.moveDown(0.3);
  body(doc, 'La tua posizione GPS viene acquisita automaticamente. Un cerchio rosso pulsante appare sulla mappa di tutti gli utenti nel raggio scelto. Chi accetta entra in una chat privata con te. Per annullare: tocca di nuovo "SOS ATTIVO" e conferma.');

  sectionTitle(doc, '5.3 Registrazione Percorsi GPS');
  numbered(doc, [
    'Tocca "Registra Giro"',
    'Concedi il permesso di posizione se richiesto',
    'Il tracciamento parte: vedi distanza, velocità e durata in tempo reale',
    'Tocca "Ferma Giro" per terminare',
  ]);
  doc.moveDown(0.3);
  body(doc, 'L\'app adatta automaticamente la frequenza GPS alla velocità per risparmiare batteria. Se resti fermo 10 minuti, ti suggerisce di mettere in pausa. Statistiche registrate: distanza totale, velocità massima, velocità media, altitudine, durata e mappa del percorso.');

  sectionTitle(doc, '5.4 I Miei Percorsi');
  body(doc, 'Storico di tutti i giri registrati con data, distanza, velocità massima e mappa del tragitto. Puoi condividere le statistiche come entry nel contest fotografico.');

  // === CAPITOLO 6 — Match ===
  chapterTitle(doc, 6, 'Tab Match');
  body(doc, 'La tab Match è il motore di connessione di BikerLink. Il sistema ti propone abbinamenti automatici basati su preferenze, disponibilità e compatibilità moto.');

  sectionTitle(doc, '6.1 I 5 Tab del Match');
  bullet(doc, [
    'Zavorrine: match tra il tuo garage e le wishlist delle zavorrine',
    'Biker: match tra biker con proposte compatibili (zona, orario, interessi)',
    'Coppie: match con coppie che cercano altri motociclisti',
    'Accettati: tutti i match accettati da entrambi, con link alla chat di gruppo',
    'Bloccato: match rifiutati o utenti bloccati (non verranno più proposti)',
  ]);

  sectionTitle(doc, '6.2 Come Funziona il Matching Automatico');
  body(doc, 'Il sistema gira ogni 60 secondi e confronta:');
  bullet(doc, [
    'Tipo di ricerca: chi cerca cosa (biker cerca zavorrina, zavorrina cerca biker, biker cerca biker)',
    'Distanza: entro il raggio scelto',
    'Data e orario: fasce orarie compatibili o sovrapposte',
    'Compatibilità moto: wishlist zavorrina vs garage biker (marca, modello, tipo)',
  ]);

  sectionTitle(doc, '6.3 Accettare o Rifiutare un Match');
  body(doc, 'Per ogni match in sospeso puoi scegliere "Accetta" (verde) o "Rifiuta" (rosso). Quando entrambi accettano, viene creata automaticamente una chat di gruppo. Se solo uno accetta, il match rimane in attesa fino alla scadenza.');

  sectionTitle(doc, '6.4 Garage Matching (Biker ↔ Zavorrina)');
  body(doc, 'Il Garage Match è la funzione più innovativa di BikerLink. I biker aggiungono le moto al Garage con marca, modello, anno, cilindrata, tipo e stile di guida. Le zavorrine creano una Wishlist con le moto su cui vorrebbero viaggiare. Il sistema confronta automaticamente: se la wishlist di una zavorrina corrisponde a una moto nel garage di un biker, entrambi ricevono un match!');

  // === CAPITOLO 7 — Contest ===
  chapterTitle(doc, 7, 'Tab Pic! — Contest Fotografico');
  body(doc, 'La sezione Pic! è dedicata al contest fotografico settimanale della community. Ogni settimana un tema diverso, ogni settimana una nuova opportunità.');

  sectionTitle(doc, '7.1 Galleria della Community');
  body(doc, 'La galleria mostra tutte le foto caricate per il contest della settimana corrente, ordinate per voti. Per ogni foto vedi: immagine, nickname dell\'autore, numero di voti ricevuti e quanti ne hai già dati.');

  sectionTitle(doc, '7.2 Partecipare al Contest');
  numbered(doc, [
    'Tocca "+" o "Partecipa"',
    'Scegli la foto dalla galleria o scattane una con la fotocamera',
    'Aggiungi una didascalia (opzionale)',
    'Tocca "Pubblica"',
  ]);
  doc.moveDown(0.3);
  body(doc, 'La foto viene inviata per moderazione. Una volta approvata, appare nella galleria. Puoi caricare una sola foto per settimana. Requisiti: tema motociclistico, nessun contenuto inappropriato.');

  sectionTitle(doc, '7.3 Sistema di Voti');
  body(doc, 'Hai 10 voti al giorno da distribuire tra le foto in gara. I voti si azzerano a mezzanotte. Non puoi votare la tua stessa foto. Il contatore dei voti disponibili è visibile nella schermata.');

  sectionTitle(doc, '7.4 Record di Percorso come Entry');
  body(doc, 'Puoi partecipare pubblicando i record dei tuoi percorsi GPS: il sistema genera una scheda con mappa, distanza, velocità massima e statistiche.');

  sectionTitle(doc, '7.5 Albo dei Vincitori');
  body(doc, 'Nella sezione "Vincitori" trovi la hall of fame con tutti i vincitori delle settimane precedenti: foto vincitrice, nickname del vincitore e voti totalizzati.');

  // === CAPITOLO 8 — Chat ===
  chapterTitle(doc, 8, 'Tab Chat');
  body(doc, 'La sezione Chat raccoglie tutte le tue conversazioni attive, sia private che di gruppo.');

  sectionTitle(doc, '8.1 Chat Private (1 a 1)');
  body(doc, 'Le chat private si creano in tre modi:');
  bullet(doc, [
    'Risposta a un SOS: quando accetti di aiutare qualcuno, si apre automaticamente una chat',
    'Dal profilo di un utente: tocca "Invia messaggio"',
    'Dopo un match accettato da entrambi',
  ]);

  sectionTitle(doc, '8.2 Chat di Gruppo');
  body(doc, 'Le chat di gruppo si creano automaticamente quando entrambi gli utenti accettano un match. Servono per coordinare i dettagli del giro: punto d\'incontro, orario esatto, abbigliamento.');

  sectionTitle(doc, '8.3 Funzioni della Chat');
  bullet(doc, [
    'Messaggi di testo: in tempo reale',
    'Immagini: dalla galleria o dalla fotocamera',
    'Posizione GPS: condividi la tua posizione come mappa interattiva',
  ]);

  sectionTitle(doc, '8.4 Sicurezza nelle Chat');
  infoBox(doc, 'Il sistema permette di condividere il numero di telefono solo una volta per conversazione. Se provi a inviare di nuovo il numero, il sistema mascherà automaticamente il testo per proteggere la tua privacy.');

  // === CAPITOLO 9 — MotoClub ===
  chapterTitle(doc, 9, 'Tab MotoClub');
  body(doc, 'I MotoClub sono community tematiche all\'interno di BikerLink, organizzate per marca, modello o zona geografica.');

  sectionTitle(doc, '9.1 Tipi di MotoClub');
  bullet(doc, [
    'Brand Club: dedicato a una marca (Club Ducatisti, Club Harley-Davidson, Club BMW Motorrad)',
    'Model Club: per possessori di un modello specifico (Club Ducati Monster, Club Yamaha MT-07)',
    'Custom Club: tema libero (geografico, per stile di guida, per tipo di percorso)',
  ]);

  sectionTitle(doc, '9.2 Trovare e Unirsi a un MotoClub');
  body(doc, 'Nella tab MotoClub trovi: club in evidenza (i più attivi), ricerca per nome e filtro per regione. Per unirsi: apri il profilo del club, tocca "Unisciti". L\'iscrizione può essere automatica o su approvazione dell\'admin.');

  sectionTitle(doc, '9.3 Chat del MotoClub');
  body(doc, 'Una volta iscritto, accedi alla chat di gruppo condivisa con tutti i membri. Puoi inviare messaggi, foto e posizione GPS. È il luogo per coordinare uscite di gruppo e scambiarsi consigli meccanici. Puoi far parte di più MotoClub contemporaneamente.');

  sectionTitle(doc, '9.4 Creare un MotoClub');
  body(doc, 'Tocca "Crea Club" e compila: nome (unico), tipo (Brand/Modello/Custom), marca, modello, regione, paese, descrizione. Il club creato viene approvato dai moderatori prima di diventare visibile. Riceverai una notifica quando sarà approvato. Come admin del club puoi approvare richieste, rimuovere membri e modificare le informazioni.');

  // === CAPITOLO 10 — Profilo ===
  chapterTitle(doc, 10, 'Tab Profilo');
  body(doc, 'Il profilo è la tua identità su BikerLink. Da qui gestisci tutte le tue informazioni, le moto e le preferenze dell\'app.');

  sectionTitle(doc, '10.1 Informazioni Personali');
  bullet(doc, [
    'Nickname: il tuo nome su BikerLink (visibile a tutti)',
    'Bio: presentati alla community (massimo 500 caratteri)',
    'Telefono: visibile solo in chat (una volta per conversazione)',
    'Anno di nascita: per i filtri di matching per fascia d\'età',
    'Regione: indica dove sei basato',
  ]);

  sectionTitle(doc, '10.2 Statistiche');
  body(doc, 'Nel profilo trovi: km totali percorsi (somma dei percorsi GPS), numero di giri registrati, Easter Egg raccolti. Queste statistiche sono visibili anche agli altri utenti.');

  sectionTitle(doc, '10.3 Foto del Profilo');
  body(doc, 'Puoi caricare un avatar (visibile ovunque nell\'app e come icona sulla mappa) e foto aggiuntive (le zavorrine possono caricare fino a 3 foto in griglia). Tutte le foto sono moderate prima della pubblicazione.');

  sectionTitle(doc, '10.4 Garage — Solo Biker e Coppie');
  body(doc, 'Identificato dall\'icona a forma di motocicletta. Per ogni moto puoi specificare:');
  bullet(doc, [
    'Marca (obbligatoria): Ducati, BMW, Yamaha, Honda, ecc.',
    'Modello (obbligatorio): Monster, R1200GS, MT-07, ecc.',
    'Anno (opzionale): anno di immatricolazione',
    'Cilindrata (opzionale): es. 821 cc, 1200 cc',
    'Tipo di moto (opzionale): Naked, Sport, Touring, Enduro/Adventure, Custom/Cruiser, Scooter, Elettrica',
    'Stile di guida (opzionale): Tranquillo, Moderato, Sportivo, Estremo',
  ]);
  body(doc, 'Le moto nel garage vengono usate per il Garage Match e per la selezione della moto nelle proposte di giro.');

  sectionTitle(doc, '10.5 Wishlist — Solo Zavorrine');
  body(doc, 'Identificata dall\'icona a forma di cuore. Aggiungi le moto su cui vorresti viaggiare specificando marca, modello e tipo. Puoi aggiungere quante moto vuoi: il sistema farà match con i biker che hanno almeno una di quelle moto nel garage.');

  sectionTitle(doc, '10.6 Preferenze di Ricerca (per Biker)');
  body(doc, 'I biker configurano chi stanno cercando: solo zavorrine, solo altri biker, o tutti. Questa preferenza filtra i risultati del matching.');

  sectionTitle(doc, '10.7 Aggiornamenti OTA');
  body(doc, 'In fondo al profilo trovi una pillola di stato con la versione app e lo stato OTA (Over The Air). L\'app si aggiorna automaticamente in background. Puoi forzare il controllo toccando l\'icona di refresh accanto alla pillola OTA.');

  sectionTitle(doc, '10.8 Donazioni e Supporto');
  body(doc, 'Dal profilo accedi al link per supportare lo sviluppo di BikerLink tramite donazione PayPal. BikerLink è un progetto indipendente: il sostegno della community è fondamentale.');

  sectionTitle(doc, '10.9 Segnalazione Bug e Suggerimenti');
  body(doc, '"Segnala un bug": descrivi il problema con quante più informazioni possibile (schermata, cosa stavi facendo, cosa ti aspettavi). "Proponi una funzione": le idee della community sono la linfa di BikerLink!');

  sectionTitle(doc, '10.10 Eliminazione Account');
  body(doc, 'In fondo alle impostazioni del profilo tocca "Elimina Account". L\'eliminazione è irreversibile dopo 30 giorni. Nei 30 giorni successivi puoi annullarla semplicemente facendo login.');

  // === CAPITOLO 11 — Funzioni Speciali ===
  chapterTitle(doc, 11, 'Funzioni Speciali');

  sectionTitle(doc, '11.1 Easter Egg');
  body(doc, 'Sulla mappa sono nascosti oggetti virtuali da raccogliere durante i giri in moto. Quando sei nelle vicinanze di un Easter Egg, appare un\'icona speciale sulla mappa. Tocca "Raccogli!" per aggiungerlo alla tua collezione e guadagnare punti.');
  doc.moveDown(0.3);
  body(doc, 'Gli Easter Egg si trovano in luoghi particolari: strade panoramiche, posti iconici per i motociclisti, luoghi storici. Esplora percorsi nuovi: non sai mai dove potrebbe nasconderne uno! Il contatore è visibile nel profilo.');

  sectionTitle(doc, '11.2 Officine Convenzionate');
  body(doc, 'Sulla mappa compaiono le officine convenzionate con BikerLink: meccanici che supportano la community. In caso di guasto, trovi un\'officina vicina direttamente dalla mappa senza dover cercare su altri siti.');

  sectionTitle(doc, '11.3 Aggiornamenti Automatici OTA');
  body(doc, 'BikerLink usa un sistema di aggiornamenti Over The Air (OTA): nuove funzioni e correzioni arrivano senza dover scaricare una nuova versione. L\'app verifica automaticamente gli aggiornamenti all\'avvio e li scarica in background. Al prossimo avvio l\'app è già aggiornata. Puoi forzare il controllo dalla pillola OTA nel profilo.');

  // === CAPITOLO 12 — Sicurezza e Privacy ===
  chapterTitle(doc, 12, 'Sicurezza e Privacy');
  body(doc, 'BikerLink è progettata con la sicurezza e la privacy degli utenti come priorità assoluta.');

  sectionTitle(doc, '12.1 Visibilità sulla Mappa');
  body(doc, 'La tua posizione è visibile solo quando sei "Disponibile" (attivato dalla tab Ride!). Quando sei non disponibile o hai chiuso l\'app, la tua icona scompare dalla mappa di tutti. Non sei mai tracciato a tua insaputa.');

  sectionTitle(doc, '12.2 Condivisione dei Dati Personali');
  bullet(doc, [
    'Numero di telefono: visibile solo in chat, condivisibile una sola volta per conversazione',
    'Email: non viene mai mostrata ad altri utenti',
    'Posizione GPS: usata solo per la mappa e il tracking, non salvata permanentemente né condivisa',
    'Foto: moderate prima della pubblicazione',
  ]);

  sectionTitle(doc, '12.3 Segnalare un Utente');
  numbered(doc, [
    'Vai sul profilo dell\'utente',
    'Tocca il menu con i tre puntini in alto a destra',
    'Seleziona "Segnala"',
    'Spiega il motivo della segnalazione',
    'Invia',
  ]);
  body(doc, 'Il team di moderazione esamina ogni segnalazione e prende le misure appropriate.');

  sectionTitle(doc, '12.4 Bloccare un Utente');
  body(doc, 'Dal profilo dell\'utente, seleziona "Blocca" dal menu e conferma. Gli utenti bloccati appaiono nel tab "Bloccato" della sezione Match. Puoi sbloccarli in qualsiasi momento.');

  sectionTitle(doc, '12.5 Privacy e GDPR');
  body(doc, 'BikerLink rispetta le normative europee sulla protezione dei dati (GDPR). Hai diritto a: accedere ai tuoi dati, correggerli, cancellarli (tramite "Elimina Account") e alla portabilità. Per qualsiasi domanda, usa la sezione Feedback o consulta la Privacy Policy nell\'app.');

  sectionTitle(doc, '12.6 Sicurezza degli Incontri');
  infoBox(doc, 'Per la tua sicurezza: incontra sempre in luoghi pubblici la prima volta. Informa qualcuno di dove vai e con chi. Verifica il profilo (foto, bio, numero di giri). Fidati del tuo istinto: se qualcosa non ti convince, non procedere.');

  // === PAGINA FINALE ===
  doc.addPage();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(ORANGE);
  doc.fill(WHITE).font('Helvetica-Bold').fontSize(32).text('BikerLink', 0, 260, { align: 'center' });
  doc.fill(WHITE).font('Helvetica-Oblique').fontSize(16).text("U'll never ride alone", 0, 305, { align: 'center' });
  doc.moveDown(1.5);
  doc.moveTo(100, 340).lineTo(doc.page.width - 100, 340).strokeColor(WHITE).lineWidth(1).stroke();
  doc.fill(WHITE).font('Helvetica').fontSize(11).text('Per assistenza: usa la sezione Feedback nel tuo profilo', 0, 360, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(10).text('www.biker-link.replit.app', 0, 385, { align: 'center' });
  doc.fill(WHITE).font('Helvetica').fontSize(9).text('Versione manuale: Aprile 2026  ·  App v1.1.0', 0, 410, { align: 'center' });

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // Copy to server/public
  fs.copyFileSync(OUT_PATH, PUBLIC_PATH);

  console.log(`PDF generato: ${OUT_PATH}`);
  console.log(`Copiato in: ${PUBLIC_PATH}`);
  console.log(`Dimensione: ${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Errore:', err);
  process.exit(1);
});
