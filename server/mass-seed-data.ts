export interface EuropeanZone {
  region: string;
  country: string;
  lat: number;
  lng: number;
  spokenLanguages: string[];
}

export const EUROPEAN_ZONES: EuropeanZone[] = [
  // ── ITALIA (20 regioni) ───────────────────────────────────────────────────────
  { region: "Lombardia", country: "IT", lat: 45.46, lng: 9.19, spokenLanguages: ["Italiano"] },
  { region: "Piemonte", country: "IT", lat: 45.07, lng: 7.69, spokenLanguages: ["Italiano"] },
  { region: "Veneto", country: "IT", lat: 45.44, lng: 12.31, spokenLanguages: ["Italiano"] },
  { region: "Emilia-Romagna", country: "IT", lat: 44.50, lng: 11.34, spokenLanguages: ["Italiano"] },
  { region: "Toscana", country: "IT", lat: 43.77, lng: 11.25, spokenLanguages: ["Italiano"] },
  { region: "Lazio", country: "IT", lat: 41.90, lng: 12.50, spokenLanguages: ["Italiano"] },
  { region: "Campania", country: "IT", lat: 40.85, lng: 14.27, spokenLanguages: ["Italiano"] },
  { region: "Puglia", country: "IT", lat: 41.12, lng: 16.87, spokenLanguages: ["Italiano"] },
  { region: "Calabria", country: "IT", lat: 38.91, lng: 16.59, spokenLanguages: ["Italiano"] },
  { region: "Sicilia", country: "IT", lat: 37.60, lng: 14.02, spokenLanguages: ["Italiano"] },
  { region: "Sardegna", country: "IT", lat: 39.22, lng: 9.12, spokenLanguages: ["Italiano"] },
  { region: "Liguria", country: "IT", lat: 44.41, lng: 8.93, spokenLanguages: ["Italiano"] },
  { region: "Marche", country: "IT", lat: 43.62, lng: 13.52, spokenLanguages: ["Italiano"] },
  { region: "Umbria", country: "IT", lat: 43.11, lng: 12.39, spokenLanguages: ["Italiano"] },
  { region: "Abruzzo", country: "IT", lat: 42.35, lng: 13.40, spokenLanguages: ["Italiano"] },
  { region: "Trentino-Alto Adige", country: "IT", lat: 46.07, lng: 11.12, spokenLanguages: ["Italiano"] },
  { region: "Friuli Venezia Giulia", country: "IT", lat: 46.06, lng: 13.23, spokenLanguages: ["Italiano"] },
  { region: "Basilicata", country: "IT", lat: 40.64, lng: 15.80, spokenLanguages: ["Italiano"] },
  { region: "Molise", country: "IT", lat: 41.56, lng: 14.66, spokenLanguages: ["Italiano"] },
  { region: "Valle d'Aosta", country: "IT", lat: 45.74, lng: 7.43, spokenLanguages: ["Italiano"] },

  // ── GERMANIA (11 Länder) ───────────────────────────────────────────────────────
  { region: "Bayern", country: "DE", lat: 48.14, lng: 11.58, spokenLanguages: ["Deutsch"] },
  { region: "Nordrhein-Westfalen", country: "DE", lat: 51.23, lng: 6.78, spokenLanguages: ["Deutsch"] },
  { region: "Baden-Württemberg", country: "DE", lat: 48.78, lng: 9.18, spokenLanguages: ["Deutsch"] },
  { region: "Berlin", country: "DE", lat: 52.52, lng: 13.41, spokenLanguages: ["Deutsch"] },
  { region: "Hamburg", country: "DE", lat: 53.55, lng: 9.99, spokenLanguages: ["Deutsch"] },
  { region: "Niedersachsen", country: "DE", lat: 52.37, lng: 9.73, spokenLanguages: ["Deutsch"] },
  { region: "Hessen", country: "DE", lat: 50.11, lng: 8.68, spokenLanguages: ["Deutsch"] },
  { region: "Sachsen", country: "DE", lat: 51.05, lng: 13.74, spokenLanguages: ["Deutsch"] },
  { region: "Rheinland-Pfalz", country: "DE", lat: 49.99, lng: 8.27, spokenLanguages: ["Deutsch"] },
  { region: "Thüringen", country: "DE", lat: 50.98, lng: 11.03, spokenLanguages: ["Deutsch"] },
  { region: "Brandenburg", country: "DE", lat: 52.40, lng: 12.97, spokenLanguages: ["Deutsch"] },

  // ── FRANCIA (11 regioni) ───────────────────────────────────────────────────────
  { region: "Île-de-France", country: "FR", lat: 48.86, lng: 2.35, spokenLanguages: ["Français"] },
  { region: "Provence-Alpes-Côte d'Azur", country: "FR", lat: 43.30, lng: 5.37, spokenLanguages: ["Français"] },
  { region: "Occitanie", country: "FR", lat: 43.60, lng: 1.44, spokenLanguages: ["Français"] },
  { region: "Bretagne", country: "FR", lat: 48.11, lng: -1.68, spokenLanguages: ["Français"] },
  { region: "Grand Est", country: "FR", lat: 48.57, lng: 7.75, spokenLanguages: ["Français"] },
  { region: "Auvergne-Rhône-Alpes", country: "FR", lat: 45.76, lng: 4.83, spokenLanguages: ["Français"] },
  { region: "Hauts-de-France", country: "FR", lat: 50.63, lng: 3.06, spokenLanguages: ["Français"] },
  { region: "Nouvelle-Aquitaine", country: "FR", lat: 44.84, lng: -0.58, spokenLanguages: ["Français"] },
  { region: "Normandie", country: "FR", lat: 49.18, lng: -0.36, spokenLanguages: ["Français"] },
  { region: "Pays de la Loire", country: "FR", lat: 47.22, lng: -1.55, spokenLanguages: ["Français"] },
  { region: "Bourgogne-Franche-Comté", country: "FR", lat: 47.32, lng: 5.04, spokenLanguages: ["Français"] },

  // ── SPAGNA (8 comunità) ───────────────────────────────────────────────────────
  { region: "Cataluña", country: "ES", lat: 41.39, lng: 2.17, spokenLanguages: ["Español"] },
  { region: "Comunidad de Madrid", country: "ES", lat: 40.42, lng: -3.70, spokenLanguages: ["Español"] },
  { region: "Andalucía", country: "ES", lat: 37.39, lng: -5.98, spokenLanguages: ["Español"] },
  { region: "País Vasco", country: "ES", lat: 43.26, lng: -2.93, spokenLanguages: ["Español"] },
  { region: "Comunidad Valenciana", country: "ES", lat: 39.47, lng: -0.38, spokenLanguages: ["Español"] },
  { region: "Galicia", country: "ES", lat: 42.88, lng: -8.54, spokenLanguages: ["Español"] },
  { region: "Aragón", country: "ES", lat: 41.65, lng: -0.88, spokenLanguages: ["Español"] },
  { region: "Castilla y León", country: "ES", lat: 41.65, lng: -4.72, spokenLanguages: ["Español"] },

  // ── POLONIA (3 voivodati) ───────────────────────────────────────────────────────
  { region: "Mazowieckie", country: "PL", lat: 52.23, lng: 21.01, spokenLanguages: ["English"] },
  { region: "Małopolskie", country: "PL", lat: 50.06, lng: 19.94, spokenLanguages: ["English"] },
  { region: "Śląskie", country: "PL", lat: 50.26, lng: 19.03, spokenLanguages: ["English"] },

  // ── PAESI BASSI (3 province) ───────────────────────────────────────────────────
  { region: "Noord-Holland", country: "NL", lat: 52.37, lng: 4.90, spokenLanguages: ["Nederlands"] },
  { region: "Zuid-Holland", country: "NL", lat: 51.92, lng: 4.48, spokenLanguages: ["Nederlands"] },
  { region: "Noord-Brabant", country: "NL", lat: 51.56, lng: 5.08, spokenLanguages: ["Nederlands"] },

  // ── BELGIO (2 regioni) ─────────────────────────────────────────────────────────
  { region: "Bruxelles", country: "BE", lat: 50.85, lng: 4.35, spokenLanguages: ["Français"] },
  { region: "Antwerpen", country: "BE", lat: 51.22, lng: 4.40, spokenLanguages: ["Nederlands"] },

  // ── SVIZZERA (2 cantoni) ───────────────────────────────────────────────────────
  { region: "Zürich", country: "CH", lat: 47.38, lng: 8.54, spokenLanguages: ["Deutsch"] },
  { region: "Genève", country: "CH", lat: 46.20, lng: 6.15, spokenLanguages: ["Français"] },

  // ── AUSTRIA (3 Länder) ─────────────────────────────────────────────────────────
  { region: "Wien", country: "AT", lat: 48.21, lng: 16.37, spokenLanguages: ["Deutsch"] },
  { region: "Tirol", country: "AT", lat: 47.26, lng: 11.39, spokenLanguages: ["Deutsch"] },
  { region: "Steiermark", country: "AT", lat: 47.07, lng: 15.44, spokenLanguages: ["Deutsch"] },

  // ── SVEZIA (3 regioni) ─────────────────────────────────────────────────────────
  { region: "Stockholm", country: "SE", lat: 59.33, lng: 18.07, spokenLanguages: ["English"] },
  { region: "Göteborg", country: "SE", lat: 57.71, lng: 11.97, spokenLanguages: ["English"] },
  { region: "Skåne", country: "SE", lat: 55.60, lng: 13.00, spokenLanguages: ["English"] },

  // ── PORTOGALLO (2 regioni) ─────────────────────────────────────────────────────
  { region: "Lisboa", country: "PT", lat: 38.72, lng: -9.14, spokenLanguages: ["Português"] },
  { region: "Norte", country: "PT", lat: 41.15, lng: -8.61, spokenLanguages: ["Português"] },

  // ── GRECIA (2 regioni) ─────────────────────────────────────────────────────────
  { region: "Attiki", country: "GR", lat: 37.98, lng: 23.73, spokenLanguages: ["Greek"] },
  { region: "Kentriki Makedonia", country: "GR", lat: 40.64, lng: 22.94, spokenLanguages: ["Greek"] },

  // ── REPUBBLICA CECA (2 regioni) ────────────────────────────────────────────────
  { region: "Praha", country: "CZ", lat: 50.08, lng: 14.44, spokenLanguages: ["English"] },
  { region: "Jihomoravský", country: "CZ", lat: 49.20, lng: 16.61, spokenLanguages: ["English"] },

  // ── UNGHERIA ──────────────────────────────────────────────────────────────────
  { region: "Budapest", country: "HU", lat: 47.50, lng: 19.04, spokenLanguages: ["English"] },

  // ── ROMANIA (2 regioni) ────────────────────────────────────────────────────────
  { region: "București", country: "RO", lat: 44.43, lng: 26.10, spokenLanguages: ["English"] },
  { region: "Cluj", country: "RO", lat: 46.77, lng: 23.59, spokenLanguages: ["English"] },

  // ── CROAZIA (2 regioni) ────────────────────────────────────────────────────────
  { region: "Zagreb", country: "HR", lat: 45.81, lng: 15.98, spokenLanguages: ["English"] },
  { region: "Splitsko-dalmatinska", country: "HR", lat: 43.51, lng: 16.44, spokenLanguages: ["English"] },

  // ── DANIMARCA ────────────────────────────────────────────────────────────────
  { region: "København", country: "DK", lat: 55.68, lng: 12.57, spokenLanguages: ["English"] },

  // ── FINLANDIA ────────────────────────────────────────────────────────────────
  { region: "Helsinki", country: "FI", lat: 60.17, lng: 24.94, spokenLanguages: ["English"] },

  // ── NORVEGIA (2 regioni) ───────────────────────────────────────────────────────
  { region: "Oslo", country: "NO", lat: 59.91, lng: 10.75, spokenLanguages: ["English"] },
  { region: "Vestland", country: "NO", lat: 60.39, lng: 5.33, spokenLanguages: ["English"] },

  // ── SLOVACCHIA ───────────────────────────────────────────────────────────────
  { region: "Bratislava", country: "SK", lat: 48.15, lng: 17.11, spokenLanguages: ["English"] },

  // ── SLOVENIA ─────────────────────────────────────────────────────────────────
  { region: "Ljubljana", country: "SI", lat: 46.06, lng: 14.51, spokenLanguages: ["English"] },

  // ── SERBIA (2 regioni) ─────────────────────────────────────────────────────────
  { region: "Beograd", country: "RS", lat: 44.79, lng: 20.45, spokenLanguages: ["English"] },
  { region: "Vojvodina", country: "RS", lat: 45.25, lng: 19.84, spokenLanguages: ["English"] },

  // ── IRLANDA ──────────────────────────────────────────────────────────────────
  { region: "Dublin", country: "IE", lat: 53.35, lng: -6.26, spokenLanguages: ["English"] },

  // ── INDIA (4 regioni) ─────────────────────────────────────────────────────
  { region: "Maharashtra", country: "IN", lat: 19.75, lng: 75.71, spokenLanguages: ["English"] },
  { region: "Delhi", country: "IN", lat: 28.61, lng: 77.21, spokenLanguages: ["English"] },
  { region: "Karnataka", country: "IN", lat: 15.32, lng: 75.71, spokenLanguages: ["English"] },
  { region: "Tamil Nadu", country: "IN", lat: 11.13, lng: 78.66, spokenLanguages: ["English"] },

  // ── AUSTRALIA (3 regioni) ─────────────────────────────────────────────────
  { region: "New South Wales", country: "AU", lat: -31.25, lng: 146.92, spokenLanguages: ["English"] },
  { region: "Victoria", country: "AU", lat: -37.02, lng: 144.96, spokenLanguages: ["English"] },
  { region: "Queensland", country: "AU", lat: -22.58, lng: 144.08, spokenLanguages: ["English"] },

  // ── INDONESIA (3 regioni) ─────────────────────────────────────────────────
  { region: "DKI Jakarta", country: "ID", lat: -6.21, lng: 106.85, spokenLanguages: ["English"] },
  { region: "Jawa Barat", country: "ID", lat: -7.09, lng: 107.67, spokenLanguages: ["English"] },
  { region: "Bali", country: "ID", lat: -8.34, lng: 115.09, spokenLanguages: ["English"] },

  // ── THAILANDIA (3 regioni) ────────────────────────────────────────────────
  { region: "Bangkok", country: "TH", lat: 13.76, lng: 100.50, spokenLanguages: ["English"] },
  { region: "Chiang Mai", country: "TH", lat: 18.79, lng: 98.99, spokenLanguages: ["English"] },
  { region: "Phuket", country: "TH", lat: 7.88, lng: 98.39, spokenLanguages: ["English"] },

  // ── SUDAFRICA (3 regioni) ─────────────────────────────────────────────────
  { region: "Gauteng", country: "ZA", lat: -26.27, lng: 28.11, spokenLanguages: ["English"] },
  { region: "Western Cape", country: "ZA", lat: -33.23, lng: 21.86, spokenLanguages: ["English"] },
  { region: "KwaZulu-Natal", country: "ZA", lat: -28.53, lng: 30.90, spokenLanguages: ["English"] },

  // ── NIGERIA (2 regioni) ───────────────────────────────────────────────────
  { region: "Lagos", country: "NG", lat: 6.52, lng: 3.38, spokenLanguages: ["English"] },
  { region: "Abuja (FCT)", country: "NG", lat: 9.06, lng: 7.50, spokenLanguages: ["English"] },

  // ── KENYA (2 regioni) ─────────────────────────────────────────────────────
  { region: "Nairobi", country: "KE", lat: -1.29, lng: 36.82, spokenLanguages: ["English"] },
  { region: "Coast", country: "KE", lat: -3.30, lng: 40.03, spokenLanguages: ["English"] },

  // ── STATI UNITI (8 aree) ────────────────────────────────────────────────────
  { region: "California", country: "US", lat: 34.05, lng: -118.24, spokenLanguages: ["English"] },
  { region: "Texas", country: "US", lat: 30.27, lng: -97.74, spokenLanguages: ["English"] },
  { region: "New York", country: "US", lat: 40.71, lng: -74.01, spokenLanguages: ["English"] },
  { region: "Florida", country: "US", lat: 25.77, lng: -80.19, spokenLanguages: ["English"] },
  { region: "Illinois", country: "US", lat: 41.88, lng: -87.63, spokenLanguages: ["English"] },
  { region: "Washington", country: "US", lat: 47.61, lng: -122.33, spokenLanguages: ["English"] },
  { region: "Georgia", country: "US", lat: 33.75, lng: -84.39, spokenLanguages: ["English"] },
  { region: "Michigan", country: "US", lat: 42.33, lng: -83.05, spokenLanguages: ["English"] },

  // ── BRASILE (4 aree) ─────────────────────────────────────────────────────────
  { region: "São Paulo", country: "BR", lat: -23.55, lng: -46.63, spokenLanguages: ["Português"] },
  { region: "Rio de Janeiro", country: "BR", lat: -22.91, lng: -43.17, spokenLanguages: ["Português"] },
  { region: "Minas Gerais", country: "BR", lat: -19.92, lng: -43.94, spokenLanguages: ["Português"] },
  { region: "Bahia", country: "BR", lat: -12.97, lng: -38.50, spokenLanguages: ["Português"] },

  // ── MESSICO (3 aree) ─────────────────────────────────────────────────────────
  { region: "Ciudad de Mexico", country: "MX", lat: 19.43, lng: -99.13, spokenLanguages: ["Español"] },
  { region: "Jalisco", country: "MX", lat: 20.67, lng: -103.35, spokenLanguages: ["Español"] },
  { region: "Nuevo León", country: "MX", lat: 25.67, lng: -100.31, spokenLanguages: ["Español"] },

  // ── CANADA (3 aree) ──────────────────────────────────────────────────────────
  { region: "Ontario", country: "CA", lat: 43.65, lng: -79.38, spokenLanguages: ["English"] },
  { region: "British Columbia", country: "CA", lat: 49.28, lng: -123.12, spokenLanguages: ["English"] },
  { region: "Quebec", country: "CA", lat: 45.51, lng: -73.56, spokenLanguages: ["Français"] },

  // ── ARGENTINA (2 aree) ───────────────────────────────────────────────────────
  { region: "Buenos Aires", country: "AR", lat: -34.60, lng: -58.38, spokenLanguages: ["Español"] },
  { region: "Córdoba", country: "AR", lat: -31.42, lng: -64.19, spokenLanguages: ["Español"] },

  // ── TURCHIA (3 aree) ─────────────────────────────────────────────────────────
  { region: "Istanbul", country: "TR", lat: 41.01, lng: 28.95, spokenLanguages: ["English"] },
  { region: "Ankara", country: "TR", lat: 39.93, lng: 32.86, spokenLanguages: ["English"] },
  { region: "Izmir", country: "TR", lat: 38.42, lng: 27.14, spokenLanguages: ["English"] },

  // ── GIAPPONE (4 aree) ────────────────────────────────────────────────────────
  { region: "Tokyo", country: "JP", lat: 35.69, lng: 139.69, spokenLanguages: ["English"] },
  { region: "Osaka", country: "JP", lat: 34.69, lng: 135.50, spokenLanguages: ["English"] },
  { region: "Aichi", country: "JP", lat: 35.18, lng: 136.91, spokenLanguages: ["English"] },
  { region: "Kanagawa", country: "JP", lat: 35.45, lng: 139.64, spokenLanguages: ["English"] },

  // ── COREA DEL SUD (2 aree) ───────────────────────────────────────────────────
  { region: "Seoul", country: "KR", lat: 37.57, lng: 126.98, spokenLanguages: ["English"] },
  { region: "Busan", country: "KR", lat: 35.18, lng: 129.07, spokenLanguages: ["English"] },

  // ── CINA (4 aree) ────────────────────────────────────────────────────────────
  { region: "Guangdong", country: "CN", lat: 23.13, lng: 113.26, spokenLanguages: ["English"] },
  { region: "Shanghai", country: "CN", lat: 31.23, lng: 121.47, spokenLanguages: ["English"] },
  { region: "Beijing", country: "CN", lat: 39.91, lng: 116.39, spokenLanguages: ["English"] },
  { region: "Sichuan", country: "CN", lat: 30.66, lng: 104.07, spokenLanguages: ["English"] },

  // ── UAE (1 area) ─────────────────────────────────────────────────────────────
  { region: "Dubai", country: "AE", lat: 25.20, lng: 55.27, spokenLanguages: ["English"] },

  // ── MAROCCO (2 aree) ─────────────────────────────────────────────────────────
  { region: "Casablanca", country: "MA", lat: 33.59, lng: -7.62, spokenLanguages: ["English"] },
  { region: "Marrakech", country: "MA", lat: 31.63, lng: -8.00, spokenLanguages: ["English"] },

  // ── EGITTO (1 area) ──────────────────────────────────────────────────────────
  { region: "Cairo", country: "EG", lat: 30.04, lng: 31.24, spokenLanguages: ["English"] },
];

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
  return (Math.random() - 0.5) * 0.5;
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickRandomN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

export function getMotoYear(): number {
  const cur = new Date().getFullYear();
  return cur - Math.floor(Math.random() * 15);
}

export function randBirthYear(): number {
  return 1970 + Math.floor(Math.random() * 35);
}

const BIOS_BIKER_M = [
  "Motociclista appassionato, giro ogni weekend alla scoperta di nuove strade.",
  "In sella da 20 anni, conosco ogni curva della mia regione. Sempre pronto per un nuovo giro!",
  "La moto è la mia libertà. Cerco compagni di viaggio con la stessa passione.",
  "Biker del weekend ma con l'anima da viaggiatore. Nessuna strada è troppo lontana.",
  "Ogni giro è un'avventura. Mi piace esplorare strade nuove e scoprire borghi nascosti.",
];

const BIOS_BIKER_F = [
  "Biker appassionata, la moto è la mia libertà. Cerco compagni di viaggio!",
  "In sella da anni, amo le strade di montagna e i tramonti sul mare.",
  "La moto mi ha cambiato la vita. Giro ogni weekend e non mi fermo mai.",
  "Pilotessa convinta, adoro i tornanti e le strade panoramiche.",
  "Donne in moto: più di quante pensi! Cerco compagnia per i giri del weekend.",
];

const BIOS_ZAV = [
  "Non guido ma adoro la velocità! Cerco un biker con cui esplorare le strade più belle.",
  "Sogno di girare in moto da sempre. Qualcuno mi porta a scoprire le strade panoramiche?",
  "Il vento tra i capelli e il paesaggio che scorre... cerco la mia prima esperienza in moto.",
  "Mi fido di chi conosce la strada. Cerco un biker affidabile per un'avventura su due ruote.",
  "Pronta per la mia prima avventura in moto! Cerco qualcuno di paziente e simpatico.",
];

export function getBio(userType: string, sex?: string | null): string {
  if (userType === "biker" && sex === "F") return pickRandom(BIOS_BIKER_F);
  if (userType === "biker") return pickRandom(BIOS_BIKER_M);
  return pickRandom(BIOS_ZAV);
}

export * from "./mass-seed-data.part2";

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
