function generateManualPart3(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter) {
  // GERMAN
  langTitle(doc, 'BENUTZERHANDBUCH — DEUTSCH');

  sectionTitle(doc, '1. Registrierung und Anmeldung');
  body(doc, 'Um BikerLink zu nutzen, lade die App herunter und erstelle ein Konto. Auf dem Registrierungsbildschirm wähle deinen Benutzertyp:');
  bullet(doc, ['Biker — Du bist Motorradfahrer mit eigenem Motorrad', 'Sozia/Sozius — Du bist Mitfahrer und suchst eine Mitfahrgelegenheit', 'Paar — Ihr seid ein Paar, das gemeinsam fährt']);
  doc.moveDown(0.3);
  body(doc, 'Gib deinen Nickname (einzigartig), E-Mail, Passwort, Geburtsjahr ein und wähle dein Land und deine Region. Nach der Registrierung erhältst du möglicherweise einen Bestätigungscode per E-Mail. Gib ihn in der App ein, um dein Konto zu aktivieren.\nZum späteren Anmelden nutze deine E-Mail (oder Nickname) e dein Passwort. Wenn du dein Passwort vergisst, nutze die funzione "Passwort vergessen" auf dem Login-Bildschirm.');

  sectionTitle(doc, '2. App-Navigation');
  body(doc, 'Die App ist in Tabs in der unteren Leiste organisiert:');
  bullet(doc, ['Karte — Zeige verfügbare Biker und Sozias in deiner Nähe', 'Vorschläge — Erstelle und nimm an Ausflügen, Treffen oder Mitfahrgelegenheiten teil', 'Chat — Private Nachrichten und MotoClub-Gruppenchats', 'Contest — Nimm an wöchentlichen Fotocontests teil', 'Profil — Verwalte dein Profil, Fotos, Motorräder und Einstellungen']);

  sectionTitle(doc, '3. Karte und Verfügbarkeit');
  body(doc, 'Die Karte zeigt alle verfügbaren Nutzer in deiner Nähe mit farbigen Symbolen:');
  bullet(doc, ['Blau — Männlicher Biker', 'Rosa — Weibliche Bikerin/Sozia', 'Lila — Paar']);
  doc.moveDown(0.3);
  body(doc, 'Aktiviere/deaktiviere deine Verfügbarkeit mit dem Schalter "Ich bin verfügbar" oben. Nutze Filter, um nur Biker, nur Sozias oder beide anzuzeigen. Tippe auf ein Symbol auf della Karte, um das Profil eines Nutzers anzuzeigen und ihm eine Nachricht zu senden.');

  sectionTitle(doc, '4. Biker-SOS');
  body(doc, 'Im Falle eines Pannennotfalls nutze die SOS-Funktion aus dem Ride-Tab:');
  numbered(doc, ['Tippe auf die Schaltfläche "SOS starten"', 'Lege deinen Suchradius fest (10-100 km)', 'Bestätige das Senden — alle Biker im Radius erhalten eine Benachrichtigung', 'Wer verfügbar ist, kann antworten und zu Hilfe kommen']);
  doc.moveDown(0.3);
  body(doc, 'Das SOS zeigt deinen genauen Standort auf della Karte an, sodass Retter dich leicht finden können.');

  sectionTitle(doc, '5. Vorschläge');
  body(doc, 'Vorschläge ermöglichen es dir, Ausflüge zu organisieren und Reisegefährten zu finden:\nArt della Vorschläge:');
  bullet(doc, ['FindAFriend — Du suchst andere Biker für eine gemeinsame Tour', 'Sozia suchen — Du hast einen freien Sitz und suchst einen Mitfahrer', 'Hitcher — Du bietest jemandem eine Mitfahrgelegenheit', 'HitchHiker — Du suchst eine Mitfahrgelegenheit']);
  doc.moveDown(0.3);
  body(doc, 'Um einen Vorschlag zu erstellen: tippe auf die "+" Schaltfläche im Tab Vorschläge, wähle den Typ, gib Titel, Beschreibung, Abfahrtsort und Uhrzeit ein. Andere Nutzer können teilnehmen oder dich kontaktieren.');

  sectionTitle(doc, '6. Garage Match');
  body(doc, 'Garage Match ist ein automatisches System, das Biker und Sozias basierend auf Motorradkompatibilität zusammenbringt:');
  numbered(doc, ['Füge deine Motorräder in della Garage hinzu (Profil-Tab → Garage)', 'Wenn du Sozia bist, gib deine Motorradpräferenzen in della Wunschliste an', 'Das System sucht automatisch nach kompatiblen Übereinstimmungen', 'Bei einem Match erhältst du eine Benachrichtigung', 'Du puoi das Match annehmen oder ablehnen', 'Wenn beide akzeptieren, öffnet sich ein privater Chat']);
  doc.moveDown(0.3);
  body(doc, 'Das Match berücksichtigt: Marke, Modell, Motorradtyp und Fahrstil.');

  sectionTitle(doc, '7. Privater Chat');
  body(doc, 'Der private Chat ermöglicht dir die Kommunikation mit anderen Nutzern:');
  bullet(doc, ['Du puoi Textnachrichten senden', 'Gespräche sind nur für die Teilnehmer sichtbar', 'Zugriff auf den Chat über: ein Nutzerprofil, ein angenommenes Match oder den Chat-Tab']);
  doc.moveDown(0.3);
  body(doc, 'Nachrichten werden in Echtzeit zugestellt. Du puoi auch deinen Standort teilen, um Treffen zu erleichtern.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'MotoClubs sind Gruppen für Motorradfahrer derselben Marke oder Region:');
  bullet(doc, ['Suche deinen MotoClub im dedizierten Tab', 'Beantrage die Mitgliedschaft — die Genehmigung kann automatisch oder manuell erfolgen', 'Nach della Aufnahme hast du Zugang zum Gruppenchat des Clubs', 'Verwende Hashtags (#) um Nachrichten nach Themen zu filtern', 'Jeder Club zeigt die Mitgliederzahl und Markeninformationen an']);
  doc.moveDown(0.3);
  body(doc, 'Du puoi gleichzeitig Mitglied in mehreren MotoClubs sein.');

  sectionTitle(doc, '9. Fotocontest');
  body(doc, 'Jede Woche gibt es einen thematischen Fotocontest:');
  numbered(doc, ['Lade dein bestes Foto über die Schaltfläche im Contest-Tab hoch', 'Stimme für die Fotos anderer Nutzer ab (begrenzte Stimmen pro Tag)', 'Am Ende della Woche gewinnt das Foto mit den meisten Stimmen', 'Die Gewinner werden in della Gewinnerhalle angezeigt']);
  doc.moveDown(0.3);
  body(doc, 'Fotos müssen angemessen sein und den Community-Richtlinien entsprechen.');

  sectionTitle(doc, '10. GPS-Tracking');
  body(doc, 'Die Tracking-Funktion zeichnet deine Motorradrouten auf:');
  numbered(doc, ['Im Ride-Tab drücke "Tracking starten"', 'Die App zeichnet auf: Distanz, Geschwindigkeit, Höhe und Dauer', 'Du puoi die GPS-Frequenz anpassen, um Akku zu sparen', 'Drücke "Tracking stoppen", um die Aufzeichnung zu beenden', 'Routen werden in deinem Verlauf gespeichert']);
  doc.moveDown(0.3);
  body(doc, 'Tracking-Daten fließen in deine Profilstatistiken ein (Gesamt-km, absolvierte Fahrten).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Verstreut über Europa gibt es virtuelle Easter Eggs zum Sammeln:');
  bullet(doc, ['Wenn du in della Nähe eines Easter Eggs bist, erhältst du eine Benachrichtigung', 'Tippe auf "Sammeln!", um es della Sammlung hinzuzufügen', 'Jedes Easter Egg ist Punkte wert', 'Überprüfe den Zähler in deinem Profil, um zu sehen, wie viele du gefunden hast']);
  doc.moveDown(0.3);
  body(doc, 'Es ist eine unterhaltsame Art, auf deinen Touren neue Gegenden zu erkunden!');

  sectionTitle(doc, '12. Einstellungen und Sprache');
  body(doc, 'In deinem Profil puoi du die App anpassen:');
  bullet(doc, ['Sprache — Wähle zwischen Italienisch, Englisch, Deutsch, Spanisch und Französisch', 'Profil bearbeiten — Bio, Fotos, Telefonnummer aktualisieren', 'Garage — Verwalte deine Motorräder', 'Sucheinstellungen — Wähle, ob nur Biker, nur Sozias oder beide angezeigt werden']);
  doc.moveDown(0.3);
  body(doc, 'Ändere die Sprache über den Selektor in deinem Profil. Alle Bildschirme werden sofort aktualisiert.');

  sectionTitle(doc, '13. Sicherheit und Datenschutz');
  body(doc, 'BikerLink nimmt deine Sicherheit ernst:');
  bullet(doc, ['Dein Standort ist nur sichtbar, wenn du "verfügbar" bist', 'Du puoi unangemessene Benutzer melden (Benutzerprofil → Melden)', 'Fotos werden vor della Veröffentlichung moderiert', 'Du puoi dein Konto jederzeit löschen (Profil → Konto löschen)', 'Die Löschung ist nach 30 Tagen endgültig — du puoi sie durch Einloggen abbrechen', 'Deine Daten sind gemäß della europäischen DSGVO geschützt']);
  doc.moveDown(0.3);
  body(doc, 'Bei Problemen nutze den Feedback-Bereich in deinem Profil.');

  const { generateManualPart4 } = require('./generate-pdfs.part4.js');
  generateManualPart4(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter);
}

function generateEulaInternalPart2(doc, eulaSection) {
  // ENGLISH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('TERMS AND CONDITIONS OF USE — ENGLISH', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ACCEPTANCE OF TERMS', 'By using the BikerLink app, you fully accept these Terms and Conditions of Use.\nIf you do not accept these terms, you may not use the application.\nContinued use of the app following any modifications to these terms constitutes acceptance of those changes.');
  eulaSection(2, 'LICENSE OF USE', 'BikerLink grants you a limited, non-exclusive, non-transferable and revocable license for personal use of the application.\nYou may not: copy, modify, distribute, sell or sublicense the application or any part thereof.\nYou may not perform reverse engineering, decompile or disassemble the application.\nYou may not use the application for unauthorized commercial purposes.');
  eulaSection(3, 'LIMITATIONS AND RESTRICTIONS', 'You agree not to use the application for:\n- Unlawful purposes or in violation of applicable laws\n- Harassment, defamation or offensive behavior towards other users\n- Sending spam, malware or inappropriate material\n- Unauthorized collection of other users\' data\n- Interference with the proper functioning of the service\n- Creating fake accounts or impersonating third parties\nYou must be at least 18 years old to use the service.');
  eulaSection(4, 'INTELLECTUAL PROPERTY', 'The BikerLink application, including all content, source code, logos, trademarks and designs, is the exclusive property of BikerLink and is protected by copyright and intellectual property laws.\nUser-generated content remains the property of users, who grant BikerLink a non-exclusive license to use it for the purposes of the service.\nThe BikerLink trademark may not be used without prior written authorization.');
  eulaSection(5, 'PRIVACY AND PERSONAL DATA', 'The processing of personal data is carried out in accordance with the General Data Protection Regulation (GDPR) EU 2016/679.\nData collected is used exclusively to provide and improve the service.\nGPS location is shared only when the user is set as \'available\'.\nUploaded photos are subject to moderation before publication.\nFor further details, please refer to the attached Privacy Policy.');
  eulaSection(6, 'LIABILITY AND EXCLUSIONS', 'BikerLink is not liable for any direct, indirect, incidental or consequential damages arising from the use of the application.\nBikerLink is not responsible for accidents, injuries or damages occurring during meetings between users organized through the app.\nEach user is responsible for their own personal safety and must comply with the Highway Code.\nThe use of an approved helmet and appropriate personal protective equipment is mandatory.\nBikerLink does not guarantee uninterrupted availability of the service.');
  eulaSection(7, 'TERMINATION', 'BikerLink reserves the right to suspend or terminate access to the service in case of violation of these terms.\nUsers may request deletion of their account at any time from the Profile section.\nAccount deletion becomes permanent after 30 days from the request.');
  eulaSection(8, 'APPLICABLE LAW AND JURISDICTION', 'These Terms and Conditions are governed by Italian law.\nFor any dispute arising from the use of the application, the parties elect the Court of Milan as the competent jurisdiction.\nBikerLink reserves the right to modify these terms at any time, with notification to users via the application.');
  eulaSection(9, 'CONTACT', 'For questions, reports or requests relating to these terms:\nEmail: support@bikerlink.app\nWebsite: www.bikerlink.it');

  const { generateEulaInternalPart3 } = require('./generate-pdfs.part4.js');
  generateEulaInternalPart3(doc, eulaSection);
}

module.exports = {
  generateManualPart3,
  generateEulaInternalPart2
};
