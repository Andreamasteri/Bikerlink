function generateManualPart4(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter) {
  // SPANISH
  langTitle(doc, 'MANUAL DE USUARIO — ESPAÑOL');

  sectionTitle(doc, '1. Registro e Inicio de Sesión');
  body(doc, 'Para usar BikerLink, descarga la app y crea una cuenta. En la pantalla de registro, elige tu tipo de usuario:');
  bullet(doc, ['Biker — Eres motociclista con tu propia moto', 'Pasajera/o — Eres pasajero/a y buscas un viaje', 'Pareja — Sois una pareja que viaja junta']);
  doc.moveDown(0.3);
  body(doc, 'Introduce tu nickname (único), email, contraseña, año de nacimiento y selecciona tu país y región. Después del registro, podrías recibir un código de verificación por email. Introdúcelo en la app para activar tu cuenta.\nPara iniciar sesión después, usa tu email (o nickname) y contraseña. Si olvidas tu contraseña, usa la función "Contraseña olvidada" en la pantalla de inicio de sesión.');

  sectionTitle(doc, '2. Navegación de la App');
  body(doc, 'La app está organizada en pestañas en la barra inferior:');
  bullet(doc, ['Mapa — Visualiza los biker y las zavorrinas disponibles en tu zona', 'Propuestas — Crea e participa en propuestas de ruta, quedada o viaje compartido', 'Chat — Mensajes privados y chats de grupo MotoClub', 'Contest — Participa en los concursos fotográficos semanales', 'Perfil — Gestiona tu perfil, fotos, motos y ajustes']);

  sectionTitle(doc, '3. Mapa y Disponibilità');
  body(doc, 'El mapa muestra a todos los usuarios disponibles en tu zona con iconos de colores:');
  bullet(doc, ['Azul — Biker hombre', 'Rosa — Biker mujer/Zavorrina', 'Violeta — Pareja']);
  doc.moveDown(0.3);
  body(doc, 'Puedes activar/desactivar tu disponibilidad con el interruptor "Estoy disponible" en la parte superior. Usa los filtros para mostrar solo bikers, solo zavorrinas o ambos. Toca un icono en el mapa para ver el perfil del usuario y enviarle un mensaje.');

  sectionTitle(doc, '4. SOS Biker');
  body(doc, 'En caso de emergencia en carretera, usa la función SOS desde la pestaña Ride:');
  numbered(doc, ['Toca el botón "Lanzar SOS"', 'Establece el radio de búsqueda (10-100 km)', 'Confirma el envío — todos los bikers en el radio recibirán una notificación', 'Quien esté disponible podrá responder y acudir en tu ayuda']);
  doc.moveDown(0.3);
  body(doc, 'El SOS muestra tu posizione exacta en el mapa y permite a los rescatadores llegar a ti fácilmente.');

  sectionTitle(doc, '5. Propuestas');
  body(doc, 'Las propuestas te permiten organizar salidas y encontrar compañeros de viaje:\nTipos de propuesta:');
  bullet(doc, ['FindAFriend — Buscas otros bikers para una ruta juntos', 'Trova Zavorrina — Tienes el asiento libre y buscas un pasajero', 'Hitcher — Ofreces un viaje a alguien', 'HitchHiker — Buscas un viaje']);
  doc.moveDown(0.3);
  body(doc, 'Para crear una propuesta: toca el botón "+" en la pestaña Propuestas, elige el tipo, introduce título, descripción, lugar de salida y horario. Los otros usuarios podrán participar o contactarte.');

  sectionTitle(doc, '6. Match Garage');
  body(doc, 'El Match Garage es un sistema automático que empareja bikers y zavorrinas basado en la compatibilità de las motos:');
  numbered(doc, ['Añade tus motos en el Garage (pestaña Perfil → Garage)', 'Si eres una zavorrina, indica tus preferencias de moto en la Wishlist', 'El sistema busca automáticamente emparejamientos compatibles', 'Cuando hay un match, recibes una notificación', 'Puedes aceptar o rechazar el match', 'Si ambos aceptáis, se abre un chat privado']);
  doc.moveDown(0.3);
  body(doc, 'El match tiene en cuenta: marca, modelo, tipo de moto y estilo de conducción.');

  sectionTitle(doc, '7. Chat Privado');
  body(doc, 'El chat privado te permite comunicarte con otros usuarios:');
  bullet(doc, ['Puedes enviar mensajes de texto', 'Las conversaciones son visibles solo para los participantes', 'Puedes acceder al chat desde: perfil de un usuario, match aceptado, o desde la pestaña Chat']);
  doc.moveDown(0.3);
  body(doc, 'Los mensajes se entregan en tiempo real. También puedes enviar tu ubicación para facilitar los encuentros.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'Los MotoClubs son grupos para motociclistas de la misma marca o de la misma zona:');
  bullet(doc, ['Busca tu MotoClub en la pestaña dedicada', 'Solicita la inscripción — la aprobación es automática o manual', 'Una vez inscrito, accede al chat di gruppo del club', 'Usa los hashtags (#) para filtrar los mensajes por tema', 'Cada club muestra el número de miembros e información de la marca']);
  doc.moveDown(0.3);
  body(doc, 'Puedes formar parte de varios MotoClubs al mismo tiempo.');

  sectionTitle(doc, '9. Concurso de Fotos');
  body(doc, 'Cada semana hay un concurso fotográfico temático:');
  numbered(doc, ['Sube tu mejor foto desde el botón en la pestaña Contest', 'Vota las fotos de otros usuarios (tienes un número limitado de votos al día)', 'Al final de la semana, la foto con más votos gana', 'Los ganadores se muestran en el Salón de la Fama']);
  doc.moveDown(0.3);
  body(doc, 'Las fotos deben ser apropiadas y cumplir con las normas de la comunidad.');

  sectionTitle(doc, '10. Tracking GPS');
  body(doc, 'La función Tracking registra tus recorridos en moto:');
  numbered(doc, ['Desde la pestaña Ride, pulsa "Iniciar tracking"', 'La app registra: distancia, velocidad, altitud y duración', 'Puedes ajustar la frecuencia GPS para ahorrar batería', 'Pulsa "Detener tracking" para terminar la grabación', 'Los recorridos se guardan en tu historial']);
  doc.moveDown(0.3);
  body(doc, 'Los datos de tracking contribuyen a tus estadísticas en el perfil (km totales, rutas hechas).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Repartidos por Europa hay Easter Eggs virtuales para coleccionar:');
  bullet(doc, ['Cuando estás cerca de un Easter Egg, recibes una notificación', 'Toca "¡Recoger!" para añadirlo a tu colección', 'Cada Easter Egg vale puntos', 'Consulta el contador en tu perfil para ver cuántos has encontrado']);
  doc.moveDown(0.3);
  body(doc, '¡Es una forma divertida de explorar nuevas zonas durante tus rutas!');

  sectionTitle(doc, '12. Ajustes e Idioma');
  body(doc, 'En tu perfil puedes personalizar la app:');
  bullet(doc, ['Idioma — Elige entre Italiano, Inglés, Alemán, Español y Francés', 'Editar perfil — Actualiza bio, fotos, teléfono', 'Garage — Gestiona tus motos', 'Preferencias de búsqueda — Elige si ver solo bikers, solo zavorrinas o ambos']);
  doc.moveDown(0.3);
  body(doc, 'El idioma se cambia desde el selector en el perfil. Todas las pantallas se actualizan inmediatamente.');

  sectionTitle(doc, '13. Seguridad y Privacidad');
  body(doc, 'BikerLink se toma en serio tu seguridad:');
  bullet(doc, ['Tu posizione es visible solo cuando estás "disponible"', 'Puedes denunciar usuarios inapropiados (Perfil de usuario → Denunciar)', 'Las fotos son moderadas antes de su publicación', 'Puedes eliminar tu cuenta en cualquier momento (Perfil → Eliminar Cuenta)', 'La eliminación es definitiva después de 30 días — puedes cancelarla iniciando sesión', 'Tus datos están protegidos según la normativa europea GDPR']);
  doc.moveDown(0.3);
  body(doc, 'Para cualquier problema, usa la sección Feedback en tu perfil.');

  const { generateManualPart5 } = require('./generate-pdfs.part5.js');
  generateManualPart5(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter);
}

function generateEulaInternalPart3(doc, eulaSection) {
  // GERMAN
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('NUTZUNGSBEDINGUNGEN — DEUTSCH', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ANNAHME DER BEDINGUNGEN', 'Durch die Nutzung der BikerLink-App akzeptierst du diese Nutzungsbedingungen vollständig.\nWenn du diese Bedingungen nicht akzeptierst, darfst du die Anwendung nicht nutzen.\nDie fortgesetzte Nutzung der App nach Änderungen der Bedingungen gilt als Akzeptanz der Änderungen.');
  eulaSection(2, 'NUTZUNGSLIZENZ', 'BikerLink gewährt dir eine eingeschränkte, nicht-exklusive, nicht übertragbare und widerrufliche Lizenz zur persönlichen Nutzung der Anwendung.\nDu darfst nicht: die Anwendung oder Teile davon kopieren, modifizieren, verteilen, verkaufen oder unterlizenzieren.\nDu darfst kein Reverse Engineering, Dekompilierung oder Disassemblierung der Anwendung durchführen.\nDu darfst die Anwendung nicht für nicht autorisierte kommerzielle Zwecke nutzen.');
  eulaSection(3, 'EINSCHRÄNKUNGEN', 'Du verpflichtest dich, die Anwendung nicht zu nutzen für:\n- Rechtswidrige Zwecke oder Verstöße gegen geltende Gesetze\n- Belästigung, Verleumdung oder beleidigendes Verhalten gegenüber anderen Nutzern\n- Versenden von Spam, Malware oder unangemessenem Material\n- Unerlaubte Sammlung von Daten anderer Nutzer\n- Störung des ordnungsgemäßen Betriebs des Dienstes\n- Erstellung falscher Konten oder Imitation Dritter\nDu musst mindestens 18 Jahre alt sein, um den Dienst zu nutzen.');
  eulaSection(4, 'GEISTIGES EIGENTUM', 'Die BikerLink-Anwendung ist ausschließliches Eigentum von BikerLink und durch Urheberrechtsgesetze geschützt.\nVon Nutzern erstellte Inhalte bleiben Eigentum der Nutzer, die BikerLink eine nicht-exklusive Lizenz zur Nutzung für Zwecke des Dienstes gewähren.\nDie Marke BikerLink darf ohne vorherige schriftliche Genehmigung nicht verwendet werden.');
  eulaSection(5, 'DATENSCHUTZ UND PERSONENBEZOGENE DATEN', 'Die Verarbeitung personenbezogener Daten erfolgt gemäß der Datenschutz-Grundverordnung (DSGVO) EU 2016/679.\nGesammelte Daten werden ausschließlich zur Bereitstellung und Verbesserung des Dienstes verwendet.\nDer GPS-Standort wird nur geteilt, wenn der Nutzer auf \'verfügbar\' eingestellt ist.\nHochgeladene Fotos unterliegen der Moderation vor der Veröffentlichung.');
  eulaSection(6, 'HAFTUNG UND AUSSCHLÜSSE', 'BikerLink haftet nicht für direkte, indirekte, zufällige oder Folgeschäden aus der Nutzung der Anwendung.\nBikerLink ist nicht verantwortlich für Unfälle, Verletzungen oder Schäden bei Treffen zwischen über die App organisierten Nutzern.\nJeder Nutzer ist für seine persönliche Sicherheit verantwortlich und muss die Straßenverkehrsordnung einhalten.\nDas Tragen eines zugelassenen Helms und geeigneter Schutzausrüstung ist obligatorisch.');
  eulaSection(7, 'KÜNDIGUNG', 'BikerLink behält sich das Recht vor, den Zugang zum Dienst im Falle eines Verstoßes gegen diese Bedingungen zu sperren.\nNutzer können die Löschung ihres Kontos jederzeit im Profilbereich beantragen.\nDie Kontolöschung wird nach 30 Tagen ab Antrag endgültig.');
  eulaSection(8, 'ANWENDBARES RECHT UND GERICHTSSTAND', 'Diese Nutzungsbedingungen unterliegen italienischem Recht.\nFür alle Streitigkeiten aus der Nutzung wählen die Parteien das Gericht Mailand als zuständiges Gericht.\nBikerLink behält sich das Recht vor, diese Bedingungen jederzeit mit Benachrichtigung der Nutzer zu ändern.');
  eulaSection(9, 'KONTAKT', 'Für Fragen, Meldungen oder Anfragen zu diesen Bedingungen:\nE-Mail: support@bikerlink.app\nWebseite: www.bikerlink.it');

  const { generateEulaInternalPart4 } = require('./generate-pdfs.part5.js');
  generateEulaInternalPart4(doc, eulaSection);
}

module.exports = {
  generateManualPart4,
  generateEulaInternalPart3
};
