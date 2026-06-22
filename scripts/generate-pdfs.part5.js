function generateManualPart5(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter) {
  // FRENCH
  langTitle(doc, 'MANUEL UTILISATEUR — FRANÇAIS');

  sectionTitle(doc, '1. Inscription et Connexion');
  body(doc, 'Pour utiliser BikerLink, téléchargez l\'application et créez un compte. Sur l\'écran d\'inscription, choisissez votre type d\'utilisateur :');
  bullet(doc, ['Biker — Vous êtes un motard avec votre propre moto', 'Passagère/er — Vous êtes un passager à la recherche d\'un trajet', 'Couple — Vous êtes un couple voyageant ensemble']);
  doc.moveDown(0.3);
  body(doc, 'Saisissez votre pseudo (unique), email, mot de passe, année de naissance et sélectionnez votre pays et votre région. Après l\'inscription, vous pourriez ricevere un code de vérification par email. Saisissez-le dans l\'application pour activer votre compte.\nPour vous connecter ultérieurement, utilisez votre email (ou pseudo) et votre mot de passe. Si vous oubliez votre mot de passe, utilisez la fonction "Mot de passe oublié" sur l\'écran de connexion.');

  sectionTitle(doc, '2. Navigation dans l\'App');
  body(doc, 'L\'application est organisée en onglets dans la barre inférieure :');
  bullet(doc, ['Carte — Visualisez les bikers et les passagers disponibles dans votre zone', 'Propositions — Créez et participez à des propositions de balade, rassemblement ou covoiturage', 'Chat — Messages privés et chats de groupe MotoClub', 'Contest — Participez aux concours photo hebdomadaires', 'Profil — Gérez votre profil, vos photos, vos motos et vos paramètres']);

  sectionTitle(doc, '3. Carte et Disponibilità');
  body(doc, 'La carte affiche tous les utilisateurs disponibles dans votre zone avec des icônes colorées :');
  bullet(doc, ['Bleu — Biker homme', 'Rose — Biker femme/Passagère', 'Violet — Couple']);
  doc.moveDown(0.3);
  body(doc, 'Vous pouvez activer/désactiver votre disponibilità avec le bouton "Je suis disponible" en haut. Utilisez les filtres pour afficher uniquement les bikers, uniquement les passagers ou les deux. Appuyez sur une icône sur la carte pour voir le profil de l\'utilisateur et lui envoyer un message.');

  sectionTitle(doc, '4. SOS Biker');
  body(doc, 'En cas d\'urgence routière, utilisez la fonction SOS depuis l\'onglet Ride :');
  numbered(doc, ['Appuyez sur le bouton "Lancer SOS"', 'Définissez le rayon de recherche (10-100 km)', 'Confirmez l\'envoi — tous les bikers dans le rayon recevront une notification', 'Ceux qui sont disponibles pourront répondre et venir à votre secours']);
  doc.moveDown(0.3);
  body(doc, 'Le SOS affiche votre position exacte sur la carte et permet aux sauveteurs de vous rejoindre facilement.');

  sectionTitle(doc, '5. Propositions');
  body(doc, 'Les propositions vous permettent d\'organiser des sorties et de trouver des compagnons de voyage :\nTypes de proposition :');
  bullet(doc, ['FindAFriend — Vous cherchez d\'autres bikers pour una balade ensemble', 'Trouver un passager — Vous avez une selle libre et cherchez un passager', 'Hitcher — Vous proposez un trajet à quelqu\'un', 'HitchHiker — Vous cherchez un trajet']);
  doc.moveDown(0.3);
  body(doc, 'Pour créer une proposition : appuyez sur le bouton "+" dans l\'onglet Propositions, choisissez le type, saisissez le titre, la description, le lieu de départ et l\'heure. Les autres utilisateurs pourront participer ou vous contacter.');

  sectionTitle(doc, '6. Match Garage');
  body(doc, 'Le Match Garage est un système automatique qui associe bikers et passagers en fonction de la compatibilità de las motos :');
  numbered(doc, ['Ajoutez vos motos dans le Garage (onglet Profil → Garage)', 'Si vous êtes passager, indiquez vos préférences de moto dans la Wishlist', 'Le système recherche automatiquement des correspondances compatibles', 'Lorsqu\'il y a un match, vous recevez una notification', 'Vous pouvez accepter ou refuser le match', 'Si vous acceptez tous les deux, une discussion privée s\'ouvre']);
  doc.moveDown(0.3);
  body(doc, 'Le match tient compte de : la marque, le modèle, le type de moto et le style de conduite.');

  sectionTitle(doc, '7. Chat Privé');
  body(doc, 'Le chat privé vous permet de communiquer avec d\'autres utilisateurs :');
  bullet(doc, ['Vous pouvez envoyer des messages texte', 'Les conversations ne sono visibles que par les participants', 'Accédez au chat depuis : le profil d\'un utilisateur, un match accepté ou l\'onglet Chat']);
  doc.moveDown(0.3);
  body(doc, 'Les messages sont délivrés en temps réel. Vous pouvez également partager votre position pour faciliter les rencontres.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'Les MotoClubs sont des groupes pour les motards de la même marque ou de la même zone :');
  bullet(doc, ['Cherchez votre MotoClub dans l\'onglet dédié', 'Demandez l\'adhésion — l\'approbation peut être automatique ou manuelle', 'Une fois inscrit, accédez au chat de groupe du club', 'Utilisez les hashtags (#) pour filtrer les messages par sujet', 'Chaque club affiche le nombre de membres et les informations sur la marque']);
  doc.moveDown(0.3);
  body(doc, 'Vous pouvez faire partie de plusieurs MotoClubs simultanément.');

  sectionTitle(doc, '9. Concours Photo');
  body(doc, 'Chaque semaine, il y a un concours photo thématique :');
  numbered(doc, ['Téléchargez votre meilleure photo via le bouton de l\'onglet Contest', 'Votez pour les photos des autres utilisateurs (nombre de votes limité par jour)', 'À la fin de la semaine, la photo ayant reçu le plus de votes gagne', 'Les gagnants sont affichés dans le Temple de la renommée']);
  doc.moveDown(0.3);
  body(doc, 'Les photos doivent être appropriées et respecter les directives de la communauté.');

  sectionTitle(doc, '10. Tracking GPS');
  body(doc, 'La funzione Tracking enregistre vos parcours à moto :');
  numbered(doc, ['Depuis l\'onglet Ride, appuyez sur "Lancer le tracking"', 'L\'app enregistre : la distance, la vitesse, l\'altitude et la durée', 'Vous pouvez régler la fréquence GPS pour économiser la batterie', 'Appuyez sur "Arrêter le tracking" pour terminer l\'enregistrement', 'Les parcours sont sauvegardés dans votre historique']);
  doc.moveDown(0.3);
  body(doc, 'Les données de tracking contribuent à vos statistiques de profil (km totaux, balades effectuées).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Des Easter Eggs virtuels sont dispersés à travers l\'Europe à collectionner :');
  bullet(doc, ['Lorsque vous êtes à proximité d\'un Easter Egg, vous recevez une notification', 'Appuyez sur "Récupérer !" pour l\'ajouter à votre collection', 'Chaque Easter Egg vaut des points', 'Consultez le compteur dans votre profil pour voir combien vous en avez trouvé']);
  doc.moveDown(0.3);
  body(doc, 'C\'est une façon amusante d\'explorer de nouvelles zones lors de vos balades !');

  sectionTitle(doc, '12. Paramètres et Langue');
  body(doc, 'Dans votre profil, vous pouvez personnaliser l\'application :');
  bullet(doc, ['Langue — Choisissez entre Italien, Anglais, Allemand, Espagnol et Français', 'Modifier le profil — Mettez à jour votre bio, vos photos, votre numéro de téléphone', 'Garage — Gérez vos motos', 'Préférences de recherche — Choisissez de voir uniquement les bikers, uniquement les passagers ou les deux']);
  doc.moveDown(0.3);
  body(doc, 'Changez la langue via le sélecteur dans votre profil. Tous les écrans sont mis à jour immédiatement.');

  sectionTitle(doc, '13. Sécurité et Confidentialité');
  body(doc, 'BikerLink prend votre sécurité au sérieux :');
  bullet(doc, ['Votre posizione n\'est visible que lorsque vous êtes "disponible"', 'Vous pouvez signaler les utilisateurs inappropriés (Profil utilisateur → Signaler)', 'Les photos sont modérées avant publication', 'Vous pouvez supprimer votre compte à tout moment (Profil → Supprimer le compte)', 'La suppression est définitive après 30 jours — vous pouvez l\'annuler en vous connectant', 'Vos données sont protégées conformément au RGPD européen']);
  doc.moveDown(0.3);
  body(doc, 'Pour tout problème, utilisez la section Feedback dans votre profil.');

  // Footer page
  doc.addPage();
  doc.moveDown(8);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a2e').text('BikerLink', { align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(12).fillColor('#555').text("U'll never ride alone", { align: 'center' });
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(10).fillColor('#777').text('bikerlinkapp@gmail.com', { align: 'center' });
  doc.text('© 2026 BikerLink — Tutti i diritti riservati', { align: 'center' });

  doc.end();
  console.log('Manual PDF generated');
}

function generateEulaInternalPart4(doc, eulaSection) {
  // SPANISH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('TÉRMINOS Y CONDICIONES DE USO — ESPAÑOL', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ACEPTACIÓN DE LOS TÉRMINOS', 'Al usar la app BikerLink, el usuario acepta íntegramente los presentes Términos y Condiciones de Uso.\nSi no aceptas estos términos, no puedes utilizar la aplicación.\nEl uso continuato de la app tras modificaciones a estos términos constituye aceptación de dichas modificaciones.');
  eulaSection(2, 'LICENCIA DE USO', 'BikerLink concede al usuario una licencia limitada, no exclusiva, non trasferibile y revocable para el uso personal de la aplicación.\nEstá prohibido: copiar, modificar, distribuir, vender o sublicenciar la aplicación o cualquier parte de la misma.\nEstá prohibido realizar ingeniería inversa, descompilar o desensamblar la aplicación.\nEstá prohibido utilizar la aplicación para fines comerciales no autorizados.');
  eulaSection(3, 'LIMITACIONES Y RESTRICCIONES', 'El usuario se compromete a no utilizar la aplicación para:\n- Fines ilícitos o en violación de las leyes aplicables\n- Acoso, difamación o comportamiento ofensivo hacia otros usuarios\n- Envío de spam, malware o material inapropiado\n- Recopilación no autorizada de datos de otros usuarios\n- Interferencia con el correcto funcionamiento del servicio\n- Creación de cuentas falsas o suplantación de identidad de terceros\nEl usuario debe tener al menos 18 años para utilizar el servicio.');
  eulaSection(4, 'PROPIEDAD INTELECTUAL', 'La aplicación BikerLink es propiedad exclusiva de BikerLink y está protegida por las leyes de derechos de autor y propiedad intelectual.\nLos contenidos generados por los usuarios siguen siendo propiedad de los propios usuarios.\nLa marca BikerLink no puede utilizarse sin autorización previa por escrito.');
  eulaSection(5, 'PRIVACIDAD Y DATOS PERSONALES', 'El tratamiento de datos personales se lleva a cabo de conformidad con el Reglamento General de Protección de Datos (RGPD) UE 2016/679.\nLos datos recopilados se utilizan exclusivamente para proporcionar y mejorar el servicio.\nLa ubicación GPS se comparte únicamente cuando el usuario está configurado como \'disponibile\'.\nLas fotos cargadas están sujetas a moderazione antes de su publicación.');
  eulaSection(6, 'RESPONSABILIDAD Y EXCLUSIONES', 'BikerLink no es responsabile de daños directos, indirectos, incidentales o consecuentes derivados del uso de la aplicación.\nBikerLink no es responsabile de accidentes, lesiones o daños que ocurran durante los encuentros entre usuarios organizados a través de la app.\nCada usuario es responsabile de su propia seguridad personal y debe respetar el Código de Circulación.\nEl uso de casco homologado y equipos de protección personal adecuados es obbligatorio.');
  eulaSection(7, 'RESCISIÓN', 'BikerLink se reserva el derecho de sospendere o terminar el acceso al servicio en caso de violación de estos términos.\nLos usuarios pueden solicitar la eliminazione de su cuenta en cualquier momento desde la sección Perfil.\nLa eliminazione de la cuenta se vuelve definitiva después de 30 días desde la solicitud.');
  eulaSection(8, 'LEY APLICABLE Y JURISDICCIÓN', 'Los presentes Términos y Condiciones se rigen por la ley italiana.\nPara cualquier disputa derivada del uso de la aplicación, las partes eligen el Tribunal de Milán como jurisdicción competente.\nBikerLink se reserva el derecho de modificare estos términos en cualquier momento.');
  eulaSection(9, 'CONTACTO', 'Para preguntas, notificaciones o solicitudes relacionadas con estos términos:\nEmail: support@bikerlink.app\nSitio web: www.bikerlink.it');

  // FRENCH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('CONDITIONS GÉNÉRALES D\'UTILISATION — FRANÇAIS', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ACCEPTATION DES CONDITIONS', 'En utilisant l\'app BikerLink, l\'utilisateur accepte intégralement les présentes Conditions Générales d\'Utilisation.\nSi vous n\'acceptez pas ces conditions, vous ne pouvez pas utiliser l\'application.\nL\'utilisation continue de l\'app après toute modification des conditions constitue une acceptation de ces modifications.');
  eulaSection(2, 'LICENCE D\'UTILISATION', 'BikerLink vous accorde une licence limitée, non exclusive, non transférable et révocable pour l\'utilisation personnelle de l\'application.\nIl est interdit de : copier, modifier, distribuer, vendre ou sous-licencier l\'application ou toute partie de celle-ci.\nIl est interdit de procéder à l\'ingénierie inverse, décompiler ou désassembler l\'application.\nIl est interdit d\'utiliser l\'application à des fins commerciales non autorisées.');
  eulaSection(3, 'LIMITATIONS ET RESTRICTIONS', 'Vous vous engagez à ne pas utiliser l\'application pour :\n- Des fins illicites ou en violation des lois applicables\n- Harcèlement, diffamation ou comportement offensant envers d\'autres utilisateurs\n- L\'envoi de spam, logiciels malveillants ou matériel inapproprié\n- La collecte non autorisée de données d\'autres utilisateurs\n- Interférence avec le bon fonctionnement du service\n- La création de faux comptes ou l\'usurpation d\'identité de tiers\nVous devez avoir au moins 18 ans pour utiliser le service.');
  eulaSection(4, 'PROPRIÉTÉ INTELLECTUELLE', 'L\'application BikerLink est la proprietà exclusive de BikerLink et est protégée par les lois sur le droit d\'auteur et la proprietà intellectuelle.\nLes contenus générés par les utilisateurs restent la proprietà des utilisateurs.\nLa marque BikerLink ne peut être utilisée sans autorisation écrite préalable.');
  eulaSection(5, 'CONFIDENTIALITÉ ET DONNÉES PERSONNELLES', 'Le traitement des données personnelles est effectué conformément au Règlement Général sur la Protection des Données (RGPD) UE 2016/679.\nLes données collectées sono utilizzate esclusivamente pour fornire et migliorare le service.\nLa localisation GPS est partagée uniquement lorsque l\'utilisateur est configuré comme \'disponibile\'.\nLes photos téléchargées sono soggette à moderazione avant publication.');
  eulaSection(6, 'RESPONSABILITÉ ET EXCLUSIONS', 'BikerLink n\'est pas responsabile des dommages directs, indirects, accessoires ou consécutifs découlant de l\'utilisation de l\'application.\nBikerLink n\'est pas responsabile des accidents, blessures ou dommages survenant lors de rencontres entre utilisateurs organisés via l\'app.\nChaque utilisateur est responsabile de sa propre sicurezza personnelle et doit respecter le Code de la Route.\nLe port d\'un casco homologado et d\'équipements de protezione individuale appropriés est obbligatorio.');
  eulaSection(7, 'RÉSILIATION', 'BikerLink se réserve le droit de sospendere ou de mettere fin à l\'accès au service en cas de violation des présentes condizioni.\nLes utilisateurs peuvent richiedere la eliminazione de leur compte à tout moment depuis la sezione Profil.\nLa eliminazione du compte devient definitiva dopo 30 jours à compter della richiesta.');
  eulaSection(8, 'DROIT APPLICABLE ET JURIDICTION COMPÉTENTE', 'Les présentes Conditions sont régies par la loi italienne.\nPour tout litige découlant de l\'utilisation de l\'application, les parties élisent le Tribunal de Milan comme juridiction compétente.\nBikerLink se réserve le droit de modificare les présentes conditions à tout moment.');
  eulaSection(9, 'CONTACT', 'Pour toute question, segnalazione ou richiesta relative aux présentes conditions :\nEmail : support@bikerlink.app\nSite web : www.bikerlink.it');
}

module.exports = {
  generateManualPart4,
  generateManualPart5,
  generateEulaInternalPart4
};
