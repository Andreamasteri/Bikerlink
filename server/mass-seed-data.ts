export const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
];

export const REGION_COORDS: Record<string, { lat: number; lng: number }> = {
  "Abruzzo": { lat: 42.19, lng: 13.73 },
  "Basilicata": { lat: 40.64, lng: 15.97 },
  "Calabria": { lat: 38.91, lng: 16.59 },
  "Campania": { lat: 40.85, lng: 14.27 },
  "Emilia-Romagna": { lat: 44.49, lng: 11.34 },
  "Friuli Venezia Giulia": { lat: 46.07, lng: 13.23 },
  "Lazio": { lat: 41.90, lng: 12.50 },
  "Liguria": { lat: 44.41, lng: 8.95 },
  "Lombardia": { lat: 45.46, lng: 9.19 },
  "Marche": { lat: 43.62, lng: 13.52 },
  "Molise": { lat: 41.56, lng: 14.67 },
  "Piemonte": { lat: 45.07, lng: 7.69 },
  "Puglia": { lat: 41.13, lng: 16.86 },
  "Sardegna": { lat: 39.22, lng: 9.12 },
  "Sicilia": { lat: 37.60, lng: 14.02 },
  "Toscana": { lat: 43.77, lng: 11.25 },
  "Trentino-Alto Adige": { lat: 46.07, lng: 11.13 },
  "Umbria": { lat: 43.00, lng: 12.64 },
  "Valle d'Aosta": { lat: 45.74, lng: 7.32 },
  "Veneto": { lat: 45.44, lng: 12.33 },
};

export const MALE_NAMES = [
  "Marco", "Luca", "Andrea", "Giuseppe", "Francesco", "Alessandro", "Antonio", "Giovanni",
  "Roberto", "Stefano", "Davide", "Matteo", "Federico", "Simone", "Daniele", "Paolo",
  "Fabio", "Riccardo", "Nicola", "Massimo", "Salvatore", "Vincenzo", "Domenico", "Filippo",
  "Gianluca", "Emanuele", "Cristian", "Lorenzo", "Tommaso", "Alberto", "Claudio", "Enrico",
  "Michele", "Angelo", "Sergio", "Giacomo", "Pietro", "Diego", "Raffaele", "Pasquale",
  "Mirko", "Ivan", "Edoardo", "Gabriele", "Aldo", "Bruno", "Carlo", "Dario",
  "Enzo", "Franco", "Gianni", "Luigi", "Mario", "Nino", "Oscar", "Piero",
  "Renato", "Sandro", "Tiziano", "Umberto", "Valerio", "Walter", "Adriano", "Agostino",
  "Alfredo", "Arturo", "Beppe", "Cesare", "Corrado", "Donato", "Elio", "Ernesto",
  "Fabrizio", "Gennaro", "Igor", "Italo", "Jacopo", "Luciano", "Marcello", "Mauro",
  "Nunzio", "Oreste", "Primo", "Rocco", "Ruggero", "Silvio", "Tancredi", "Tullio",
  "Ugo", "Vittorio", "Achille", "Armando", "Benito", "Carmelo", "Cosimo", "Emilio",
  "Flavio", "Gaetano", "Ignazio", "Ivano", "Lamberto", "Manlio", "Nello", "Ottavio",
  "Pellegrino", "Quirino", "Renzo", "Samuele", "Teo", "Vito", "Amedeo", "Biagio",
  "Clemente", "Dino", "Eugenio", "Ferruccio", "Guido", "Ivo", "Lauro", "Livio",
  "Massimiliano", "Nando", "Olindo", "Pompeo", "Raimondo", "Sebastiano", "Teodoro", "Ubaldo",
  "Venanzio", "Zeno", "Alessio", "Bernardo", "Camillo", "Duccio", "Erminio", "Fulvio",
  "Gaspare", "Hugo", "Isidoro", "Juri", "Kevin", "Leo", "Mattia", "Nicholas",
  "Omar", "Patrizio", "Quinto", "Romeo", "Samuel", "Tomas", "Ulisse", "Vladimiro",
  "William", "Xavier", "Yuri", "Zaccaria", "Adelmo", "Basilio", "Celestino", "Demetrio",
  "Efisio", "Fausto", "Gilberto", "Ippolito", "Leandro", "Modesto", "Norberto", "Oronzo",
  "Pancrazio", "Raniero", "Stanislao", "Tranquillo", "Urbano", "Valentino", "Wladimiro", "Zairo",
  "Alan", "Boris", "Cristiano", "Denis", "Ettore", "Fernando", "Gino", "Hans",
  "Ian", "Jonathan", "Karim", "Lino", "Manuel", "Neri", "Osvaldo", "Pino",
  "Rafael", "Sauro", "Tino", "Ulrico", "Vigilio", "Werther", "Yosef", "Zoran",
];

export const FEMALE_NAMES = [
  "Maria", "Anna", "Giulia", "Francesca", "Laura", "Sara", "Chiara", "Valentina",
  "Alessandra", "Silvia", "Elisa", "Federica", "Martina", "Simona", "Roberta", "Monica",
  "Paola", "Elena", "Claudia", "Daniela", "Cristina", "Stefania", "Barbara", "Ilaria",
  "Angela", "Rosa", "Teresa", "Lucia", "Concetta", "Grazia", "Antonella", "Patrizia",
  "Giovanna", "Aurora", "Ginevra", "Alice", "Beatrice", "Camilla", "Diana", "Emma",
  "Flavia", "Gloria", "Irene", "Jasmine", "Karen", "Letizia", "Marta", "Noemi",
  "Ornella", "Perla", "Rachele", "Sofia", "Tiziana", "Ursula", "Viola", "Wanda",
  "Xenia", "Ylenia", "Zoe", "Agata", "Bianca", "Carla", "Debora", "Eva",
  "Fiammetta", "Gaia", "Helena", "Isabella", "Jolanda", "Katia", "Lara", "Margherita",
  "Natalia", "Olga", "Piera", "Rita", "Sabrina", "Tamara", "Vanessa", "Ada",
  "Bruna", "Cinzia", "Donatella", "Eleonora", "Fabiana", "Gemma", "Ida", "Jenny",
  "Lorena", "Mirella", "Nadia", "Orietta", "Pina", "Renata", "Silvana", "Tina",
  "Vera", "Wilma", "Adriana", "Benedetta", "Cecilia", "Daria", "Emanuela", "Fulvia",
  "Graziella", "Immacolata", "Liliana", "Manuela", "Nicoletta", "Ottavia", "Pamela",
  "Romina", "Serena", "Tatiana", "Umberta", "Virginia", "Arianna", "Brenda", "Costanza",
  "Delia", "Eugenia", "Fiorella", "Giuseppina", "Ivana", "Luciana", "Marcella", "Nunzia",
  "Palmira", "Rosalba", "Susanna", "Tecla", "Viviana", "Assunta", "Berenice", "Clelia",
  "Edda", "Fortunata", "Gertrude", "Isotta", "Leonilda", "Maddalena", "Nella", "Ottilia",
  "Pia", "Rosaria", "Serafina", "Tosca", "Verdiana", "Amalia", "Brigida", "Consolata",
  "Domitilla", "Enrichetta", "Filomena", "Giuditta", "Iginia", "Lorella", "Milena", "Norma",
  "Ofelia", "Prisca", "Raffaella", "Smeralda", "Teodora", "Vittoria", "Alma", "Bettina",
  "Clarissa", "Diletta", "Elvira", "Fernanda", "Gigliola", "Ines", "Leda", "Miranda",
  "Nives", "Ondina", "Penelope", "Rosella", "Samanta", "Tania", "Valeria", "Zelda",
  "Agostina", "Carmela", "Erika", "Greta", "Luana", "Marilena", "Rossana", "Sonia",
  "Lidia", "Dina", "Franca", "Greca", "Ivonne", "Lisa", "Melania", "Nunziata",
];

export const SURNAMES = [
  "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci",
  "Marino", "Greco", "Bruno", "Gallo", "Conti", "DeLuca", "Mancini", "Costa",
  "Giordano", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro", "Mariani",
  "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "Longo", "Gentile",
  "Martinelli", "Vitale", "Lombardo", "Serra", "Coppola", "DeSantis", "DAngelis", "Marchetti",
  "Fabbri", "Pellegrini", "Palumbo", "Sanna", "Farina", "Rizzi", "Monti", "Cattaneo",
  "Morandi", "Guerra", "Valentini", "Sala", "Grasso", "Ferri", "Testa", "Silvestri",
  "Giuliani", "Benedetti", "Barone", "Orlando", "Conte", "Marini", "Grassi", "Bianco",
  "Parisi", "Neri", "DiMaio", "Basile", "Ferraro", "Pellegrino", "Amato", "Sorrentino",
  "Messina", "Gatti", "Ruggiero", "Bernardi", "Vitali", "Marchese", "DiPietro", "Riva",
  "Piras", "Palmieri", "Montanari", "Caputo", "Donati", "Pagano", "Negri", "Mazza",
  "DeRosa", "Battaglia", "Sartori", "Carbone", "Poli", "Rossetti", "DiMarco", "Damiani",
  "Oliva", "Pugliese", "Arena", "Pinto", "Ferretti", "DAmico", "Falcone", "Fiore",
  "Moro", "Ceccarelli", "Verdi", "Piazza", "Capasso", "Marotta", "Maggio", "Mantovani",
  "DiStefano", "Perna", "DAgostino", "Genovese", "Fiorini", "Gambino", "Alberti", "Rosso",
  "Massa", "Bellini", "Bruni", "Franco", "Ruggeri", "Napoli", "Angelini", "Romagnoli",
  "Volpe", "Mori", "Costanzo", "Romani", "Taviani", "Lucchesi", "Colucci", "Mazzola",
  "Innocenti", "Catalano", "Carnevale", "Valenti", "Bucci", "Quaranta", "Lauro", "Zanetti",
  "Moroni", "Trevisan", "Ventura", "Giannini", "Ardito", "Cecconi", "Padovano", "Ferrante",
  "Giuliani", "Maffei", "Pozzi", "Crespi", "DelVecchio", "Marchi", "Viviani", "Zanella",
  "Orsini", "Berti", "Pisano", "Russo", "Mauri", "Corti", "Pandolfi", "Fumagalli",
  "Landi", "Bottoni", "Gabrielli", "Marra", "Santini", "Pizzo", "Piacenti", "Ranieri",
  "Manfredi", "Tedeschi", "Baldi", "Bosco", "Carrara", "Fusco", "Guarnieri", "Mele",
  "Pavan", "Scarpa", "Sordi", "Tosi", "Venturi", "Zani", "Bertini", "Capra",
  "Drago", "Ferro", "Merlini", "Pastore", "Righi", "Sassi", "Ugolini", "Valli",
];

export const MOTORCYCLES = [
  { brand: "Ducati", model: "Monster 821", displacement: 821, type: "Naked", style: "Sportiva" },
  { brand: "Ducati", model: "Monster 937", displacement: 937, type: "Naked", style: "Sportiva" },
  { brand: "Ducati", model: "Multistrada V4", displacement: 1158, type: "Adventure", style: "Turistica" },
  { brand: "Ducati", model: "Multistrada V2", displacement: 937, type: "Adventure", style: "Turistica" },
  { brand: "Ducati", model: "Scrambler Icon", displacement: 803, type: "Naked", style: "Allegra" },
  { brand: "Ducati", model: "Panigale V2", displacement: 955, type: "Sport", style: "Sportiva" },
  { brand: "Ducati", model: "Diavel V4", displacement: 1158, type: "Cruiser", style: "Sportiva" },
  { brand: "Ducati", model: "DesertX", displacement: 937, type: "Enduro", style: "Allegra" },
  { brand: "Yamaha", model: "MT-09", displacement: 890, type: "Naked", style: "Sportiva" },
  { brand: "Yamaha", model: "MT-07", displacement: 689, type: "Naked", style: "Allegra" },
  { brand: "Yamaha", model: "MT-03", displacement: 321, type: "Naked", style: "Allegra" },
  { brand: "Yamaha", model: "Tracer 9", displacement: 890, type: "Touring", style: "Turistica" },
  { brand: "Yamaha", model: "Tracer 7", displacement: 689, type: "Touring", style: "Turistica" },
  { brand: "Yamaha", model: "Ténéré 700", displacement: 689, type: "Adventure", style: "Allegra" },
  { brand: "Yamaha", model: "XSR 900", displacement: 890, type: "Naked", style: "Allegra" },
  { brand: "Honda", model: "Africa Twin", displacement: 1100, type: "Adventure", style: "Turistica" },
  { brand: "Honda", model: "CB 650R", displacement: 649, type: "Naked", style: "Tranquilla" },
  { brand: "Honda", model: "CB 500F", displacement: 471, type: "Naked", style: "Tranquilla" },
  { brand: "Honda", model: "Rebel 500", displacement: 471, type: "Cruiser", style: "Tranquilla" },
  { brand: "Honda", model: "NC 750X", displacement: 745, type: "Adventure", style: "Tranquilla" },
  { brand: "Honda", model: "Gold Wing", displacement: 1833, type: "Touring", style: "Turistica" },
  { brand: "Honda", model: "CBR 650R", displacement: 649, type: "Sport", style: "Sportiva" },
  { brand: "BMW", model: "R 1250 GS", displacement: 1254, type: "Adventure", style: "Turistica" },
  { brand: "BMW", model: "R 1250 RT", displacement: 1254, type: "Touring", style: "Turistica" },
  { brand: "BMW", model: "F 850 GS", displacement: 853, type: "Adventure", style: "Allegra" },
  { brand: "BMW", model: "F 900 R", displacement: 895, type: "Naked", style: "Sportiva" },
  { brand: "BMW", model: "S 1000 RR", displacement: 999, type: "Sport", style: "Sportiva" },
  { brand: "BMW", model: "R nineT", displacement: 1170, type: "Naked", style: "Allegra" },
  { brand: "KTM", model: "790 Duke", displacement: 790, type: "Naked", style: "Sportiva" },
  { brand: "KTM", model: "390 Adventure", displacement: 373, type: "Adventure", style: "Allegra" },
  { brand: "KTM", model: "890 Adventure", displacement: 889, type: "Adventure", style: "Turistica" },
  { brand: "KTM", model: "1290 Super Duke", displacement: 1290, type: "Naked", style: "Sportiva" },
  { brand: "KTM", model: "690 Enduro", displacement: 690, type: "Enduro", style: "Sportiva" },
  { brand: "Aprilia", model: "Tuono V4", displacement: 1077, type: "Naked", style: "Sportiva" },
  { brand: "Aprilia", model: "RS 660", displacement: 659, type: "Sport", style: "Sportiva" },
  { brand: "Aprilia", model: "Tuono 660", displacement: 659, type: "Naked", style: "Allegra" },
  { brand: "Triumph", model: "Tiger 900", displacement: 888, type: "Adventure", style: "Turistica" },
  { brand: "Triumph", model: "Street Triple", displacement: 765, type: "Naked", style: "Sportiva" },
  { brand: "Triumph", model: "Bonneville T120", displacement: 1200, type: "Naked", style: "Tranquilla" },
  { brand: "Triumph", model: "Speed Triple", displacement: 1160, type: "Naked", style: "Sportiva" },
  { brand: "Triumph", model: "Scrambler 900", displacement: 900, type: "Naked", style: "Allegra" },
  { brand: "Kawasaki", model: "Z900", displacement: 948, type: "Naked", style: "Sportiva" },
  { brand: "Kawasaki", model: "Z650", displacement: 649, type: "Naked", style: "Allegra" },
  { brand: "Kawasaki", model: "Versys 650", displacement: 649, type: "Touring", style: "Turistica" },
  { brand: "Kawasaki", model: "Ninja 650", displacement: 649, type: "Sport", style: "Sportiva" },
  { brand: "Kawasaki", model: "Vulcan S", displacement: 649, type: "Cruiser", style: "Tranquilla" },
  { brand: "Harley-Davidson", model: "Iron 883", displacement: 883, type: "Cruiser", style: "Tranquilla" },
  { brand: "Harley-Davidson", model: "Sportster S", displacement: 1252, type: "Cruiser", style: "Allegra" },
  { brand: "Harley-Davidson", model: "Fat Boy", displacement: 1868, type: "Cruiser", style: "Tranquilla" },
  { brand: "Harley-Davidson", model: "Road King", displacement: 1868, type: "Touring", style: "Turistica" },
  { brand: "Moto Guzzi", model: "V85 TT", displacement: 853, type: "Adventure", style: "Turistica" },
  { brand: "Moto Guzzi", model: "V7", displacement: 744, type: "Naked", style: "Tranquilla" },
  { brand: "Moto Guzzi", model: "V100 Mandello", displacement: 1042, type: "Touring", style: "Turistica" },
  { brand: "Benelli", model: "TRK 502", displacement: 500, type: "Adventure", style: "Turistica" },
  { brand: "Benelli", model: "Leoncino 500", displacement: 500, type: "Naked", style: "Allegra" },
  { brand: "Suzuki", model: "V-Strom 650", displacement: 645, type: "Adventure", style: "Turistica" },
  { brand: "Suzuki", model: "GSX-S750", displacement: 749, type: "Naked", style: "Sportiva" },
  { brand: "Suzuki", model: "SV650", displacement: 645, type: "Naked", style: "Allegra" },
  { brand: "Royal Enfield", model: "Himalayan 450", displacement: 452, type: "Adventure", style: "Tranquilla" },
  { brand: "Royal Enfield", model: "Interceptor 650", displacement: 648, type: "Naked", style: "Tranquilla" },
];

const BIKER_M_BIOS = [
  "Biker della domenica, ma in sella mi sento un campione! Cerco compagni per bei giri",
  "Amo le curve e le strade di montagna. Weekend = moto, sempre!",
  "La moto è libertà. Punto. Cerco gente con la stessa passione",
  "Chilometri su chilometri, non mi fermo mai. Chi viene con me?",
  "Motociclista da sempre, le due ruote sono la mia vita",
  "Giro per tutta Italia appena posso. Le strade belle non finiscono mai",
  "Appassionato di moto e buon cibo. Meglio se insieme!",
  "Cerco compagni per giri nei weekend. No perditempo, solo passione vera",
  "La mia moto è la mia migliore amica. Cercasi altri amici su due ruote",
  "Ogni curva è un'emozione. Ogni viaggio un'avventura. Vieni?",
  "Nato in sella, morirò in sella. Nel frattempo cerco buona compagnia",
  "Weekend in moto, birra al tramonto. Cosa c'è di meglio?",
  "Strade panoramiche e tornanti: il mio habitat naturale",
  "Motociclista esperto, cerco gruppo per viaggi lunghi e avventure",
  "Due ruote, una passione infinita. Scrivetemi se condividete!",
];

const BIKER_F_BIOS = [
  "Motociclista e fiera di esserlo! Le ragazze in moto sono le migliori",
  "Chi dice che la moto è roba da uomini non ha mai visto me in sella!",
  "Amo la libertà della strada e il vento tra i capelli (sotto il casco!)",
  "Biker girl con la passione per i viaggi lunghi. Chi mi segue?",
  "La moto mi ha cambiato la vita. Cerco altre biker per condividere la passione",
  "Guido da sola ma preferisco la compagnia. Ragazze biker, dove siete?",
  "Strade, curve, tramonti e la mia moto. Cos'altro serve?",
  "Non lasciatevi ingannare dal look: in moto sono una furia!",
  "Weekend in sella, giorni feriali sogno la prossima uscita",
  "La moto è il mio antistress. Cerco anime affini per bei giri",
];

const ZAV_F_BIOS = [
  "Cerco un biker che mi porti a scoprire posti nuovi! Sono simpatica e avventurosa",
  "Sogno un giro in moto da sempre. Chi mi porta?",
  "Mi piace stare in moto dietro e godermi il panorama. Cercasi pilota!",
  "Avventurosa e senza paura: cercasi biker per belle esperienze",
  "La moto mi affascina ma non guido. Cerco qualcuno che mi porti a fare un giro",
  "Amo la velocità e il vento in faccia. Chi mi offre un passaggio?",
  "Cercasi biker affidabile per giri nel weekend. Sono buona compagnia!",
  "Un giro in moto è sempre una bella avventura. Mi offro come passeggera ideale!",
  "Sognatrice con la passione per le due ruote. Cercasi cavaliere motorizzato",
  "Mi piacerebbe provare l'emozione della moto. Chi mi accompagna?",
];

const ZAV_M_BIOS = [
  "Sì, sono un ragazzo zavorrina! La guida la lascio a chi è più bravo",
  "Mi piace stare dietro e godermi il viaggio. Cerco bikers esperti!",
  "Non ho la patente A ma amo la moto. Cercasi pilota per bei giri",
  "Passeggero per passione! La moto mi piace ma preferisco non guidare",
  "Cerco biker per condividere l'esperienza su due ruote, io dietro ovviamente!",
];

const COUPLE_BIOS = [
  "Coppia unita dalla passione per la moto. Viaggiamo insieme ovunque!",
  "In moto insieme da anni, cerchiamo altri amici motociclisti",
  "Due cuori e una moto. Cerchiamo compagni per giri di gruppo",
  "La moto ci ha fatto incontrare e non ci ha più separato!",
  "Coppia on the road: cerchiamo altri per condividere avventure su due ruote",
  "Sempre insieme in sella. Le strade italiane sono il nostro parco giochi",
  "La nostra storia d'amore è iniziata su una moto. Il resto è storia!",
  "Due persone, una moto, mille avventure. Chi si unisce?",
];

const WELCOME_MESSAGES: Record<string, string[]> = {
  biker_m: [
    "Benvenuto su BikerLink! 🏍️ Qui troverai altri motociclisti della tua zona. Completa il profilo e inizia a cercare compagni di viaggio!",
    "Ciao biker! Benvenuto nella community di BikerLink. Aggiungi le tue moto al garage e fatti trovare dagli altri motociclisti!",
  ],
  biker_f: [
    "Benvenuta su BikerLink! 🏍️ Qui troverai altri motociclisti della tua zona. Completa il profilo e inizia a cercare compagni di viaggio!",
    "Ciao biker! Benvenuta nella community di BikerLink. Aggiungi le tue moto al garage e fatti trovare!",
  ],
  zav_f: [
    "Benvenuta su BikerLink! 🛵 Come zavorrina potrai trovare biker disponibili nella tua zona. Compila la tua lista desideri per trovare il passaggio perfetto!",
    "Ciao! Benvenuta su BikerLink. Qui potrai trovare biker che offrono passaggi nella tua zona. Aggiungi le tue preferenze!",
  ],
  zav_m: [
    "Benvenuto su BikerLink! 🛵 Come zavorrina potrai trovare biker disponibili nella tua zona. Compila la tua lista desideri!",
    "Ciao! Benvenuto su BikerLink. Qui potrai trovare biker che offrono passaggi. Aggiungi le tue preferenze!",
  ],
  couple: [
    "Benvenuti su BikerLink! 🏍️ Come coppia potrete trovare altri motociclisti e gruppi nella vostra zona. Completate il profilo!",
    "Ciao coppia! Benvenuti nella community. Aggiungete le vostre moto al garage e trovate compagni di viaggio!",
  ],
};

export function randOffset(): number {
  return (Math.random() - 0.5) * 0.8;
}

export function randBirthYear(): number {
  return 1970 + Math.floor(Math.random() * 36);
}

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function getMotoYear(): number {
  return 2016 + Math.floor(Math.random() * 9);
}

export function getBio(type: string, sex?: string | null): string {
  if (type === "biker" && sex === "M") return pickRandom(BIKER_M_BIOS);
  if (type === "biker" && sex === "F") return pickRandom(BIKER_F_BIOS);
  if (type === "zavorrina" && sex === "F") return pickRandom(ZAV_F_BIOS);
  if (type === "zavorrina" && sex === "M") return pickRandom(ZAV_M_BIOS);
  return pickRandom(COUPLE_BIOS);
}

export function getWelcomeMessage(type: string, sex?: string | null): string {
  if (type === "biker" && sex === "F") return pickRandom(WELCOME_MESSAGES.biker_f);
  if (type === "biker") return pickRandom(WELCOME_MESSAGES.biker_m);
  if (type === "zavorrina" && sex === "M") return pickRandom(WELCOME_MESSAGES.zav_m);
  if (type === "zavorrina") return pickRandom(WELCOME_MESSAGES.zav_f);
  return pickRandom(WELCOME_MESSAGES.couple);
}

export function distributeUniformly(total: number, regionCount: number): number[] {
  const base = Math.floor(total / regionCount);
  const remainder = total % regionCount;
  return Array.from({ length: regionCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function generateUniqueNickname(sex: string, usedNicknames: Set<string>): string {
  const names = sex === "F" ? FEMALE_NAMES : MALE_NAMES;
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = pickRandom(names);
    const surname = pickRandom(SURNAMES);
    const suffix = Math.floor(Math.random() * 999);
    const nick = `${name}${surname}${suffix}`;
    if (!usedNicknames.has(nick.toLowerCase())) {
      usedNicknames.add(nick.toLowerCase());
      return nick;
    }
  }
  const fallback = `User${Date.now()}${Math.floor(Math.random() * 9999)}`;
  usedNicknames.add(fallback.toLowerCase());
  return fallback;
}

export function generateUniqueEmail(nickname: string, usedEmails: Set<string>): string {
  const domains = ["gmail.com", "yahoo.it", "libero.it", "hotmail.it", "outlook.com", "alice.it", "tiscali.it"];
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? "" : `${Math.floor(Math.random() * 9999)}`;
    const email = `${nickname.toLowerCase()}${suffix}@${pickRandom(domains)}`;
    if (!usedEmails.has(email)) {
      usedEmails.add(email);
      return email;
    }
  }
  const email = `${nickname.toLowerCase()}.${Date.now()}@${pickRandom(domains)}`;
  usedEmails.add(email);
  return email;
}
