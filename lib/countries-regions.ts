export interface CityData {
  name: string;
  latitude: number;
  longitude: number;
}

export interface RegionData {
  name: string;
  latitude: number;
  longitude: number;
  cities?: CityData[];
}

export interface CountryData {
  code: string;
  name: string;
  flag: string;
  regions: RegionData[];
}

export interface ContinentData {
  key: string;
  label: string;
  countryCodes: string[];
}

export const ALL_COUNTRIES: CountryData[] = [
  {
    code: "IT", name: "Italia", flag: "🇮🇹",
    regions: [
      { name: "Abruzzo", latitude: 42.192, longitude: 13.7289 },
      { name: "Basilicata", latitude: 40.643, longitude: 15.97 },
      { name: "Calabria", latitude: 38.906, longitude: 16.594 },
      { name: "Campania", latitude: 40.8518, longitude: 14.2681 },
      { name: "Emilia-Romagna", latitude: 44.4949, longitude: 11.3426 },
      { name: "Friuli Venezia Giulia", latitude: 46.0711, longitude: 13.2346 },
      { name: "Lazio", latitude: 41.9028, longitude: 12.4964 },
      { name: "Liguria", latitude: 44.4056, longitude: 8.9463 },
      { name: "Lombardia", latitude: 45.4642, longitude: 9.19 },
      { name: "Marche", latitude: 43.6158, longitude: 13.5189 },
      { name: "Molise", latitude: 41.5609, longitude: 14.6685 },
      { name: "Piemonte", latitude: 45.0703, longitude: 7.6869 },
      { name: "Puglia", latitude: 41.1257, longitude: 16.862 },
      { name: "Sardegna", latitude: 39.2238, longitude: 9.1217 },
      { name: "Sicilia", latitude: 37.5999, longitude: 14.0154 },
      { name: "Toscana", latitude: 43.7711, longitude: 11.2486 },
      { name: "Trentino-Alto Adige", latitude: 46.0664, longitude: 11.1257 },
      { name: "Umbria", latitude: 42.9964, longitude: 12.6371 },
      { name: "Valle d'Aosta", latitude: 45.7375, longitude: 7.3154 },
      { name: "Veneto", latitude: 45.4398, longitude: 12.3319 },
    ],
  },
  {
    code: "DE", name: "Deutschland", flag: "🇩🇪",
    regions: [
      { name: "Baden-Württemberg", latitude: 48.6616, longitude: 9.3501 },
      { name: "Bayern", latitude: 48.7904, longitude: 11.4979 },
      { name: "Berlin", latitude: 52.52, longitude: 13.405 },
      { name: "Brandenburg", latitude: 52.4125, longitude: 12.5316 },
      { name: "Bremen", latitude: 53.0793, longitude: 8.8017 },
      { name: "Hamburg", latitude: 53.5511, longitude: 9.9937 },
      { name: "Hessen", latitude: 50.6521, longitude: 9.1624 },
      { name: "Mecklenburg-Vorpommern", latitude: 53.6127, longitude: 12.4296 },
      { name: "Niedersachsen", latitude: 52.6367, longitude: 9.8451 },
      { name: "Nordrhein-Westfalen", latitude: 51.4332, longitude: 7.6616 },
      { name: "Rheinland-Pfalz", latitude: 50.1183, longitude: 7.309 },
      { name: "Saarland", latitude: 49.3964, longitude: 7.023 },
      { name: "Sachsen", latitude: 51.1045, longitude: 13.2017 },
      { name: "Sachsen-Anhalt", latitude: 51.9503, longitude: 11.6923 },
      { name: "Schleswig-Holstein", latitude: 54.2194, longitude: 9.6961 },
      { name: "Thüringen", latitude: 50.861, longitude: 11.0514 },
    ],
  },
  {
    code: "AT", name: "Österreich", flag: "🇦🇹",
    regions: [
      { name: "Burgenland", latitude: 47.1537, longitude: 16.2689 },
      { name: "Kärnten", latitude: 46.7222, longitude: 14.1805 },
      { name: "Niederösterreich", latitude: 48.1083, longitude: 15.8049 },
      { name: "Oberösterreich", latitude: 48.0256, longitude: 13.972 },
      { name: "Salzburg", latitude: 47.8095, longitude: 13.055 },
      { name: "Steiermark", latitude: 47.3595, longitude: 14.47 },
      { name: "Tirol", latitude: 47.2537, longitude: 11.6015 },
      { name: "Vorarlberg", latitude: 47.2499, longitude: 9.9798 },
      { name: "Wien", latitude: 48.2082, longitude: 16.3738 },
    ],
  },
  {
    code: "CH", name: "Schweiz", flag: "🇨🇭",
    regions: [
      { name: "Aargau", latitude: 47.3887, longitude: 8.0455 },
      { name: "Basel-Stadt", latitude: 47.5596, longitude: 7.5886 },
      { name: "Bern", latitude: 46.948, longitude: 7.4474 },
      { name: "Genève", latitude: 46.2044, longitude: 6.1432 },
      { name: "Graubünden", latitude: 46.6568, longitude: 9.6282 },
      { name: "Luzern", latitude: 47.0502, longitude: 8.3093 },
      { name: "St. Gallen", latitude: 47.4245, longitude: 9.3767 },
      { name: "Ticino", latitude: 46.3315, longitude: 8.8004 },
      { name: "Vaud", latitude: 46.5613, longitude: 6.5368 },
      { name: "Zürich", latitude: 47.3769, longitude: 8.5417 },
      { name: "Valais", latitude: 46.2335, longitude: 7.3596 },
      { name: "Fribourg", latitude: 46.8065, longitude: 7.1621 },
    ],
  },
  {
    code: "FR", name: "France", flag: "🇫🇷",
    regions: [
      { name: "Auvergne-Rhône-Alpes", latitude: 45.4472, longitude: 4.3851 },
      { name: "Bourgogne-Franche-Comté", latitude: 47.2805, longitude: 4.9994 },
      { name: "Bretagne", latitude: 48.2021, longitude: -2.9326 },
      { name: "Centre-Val de Loire", latitude: 47.7516, longitude: 1.6751 },
      { name: "Corse", latitude: 42.0396, longitude: 9.0129 },
      { name: "Grand Est", latitude: 48.5802, longitude: 5.6818 },
      { name: "Hauts-de-France", latitude: 49.9659, longitude: 2.8241 },
      { name: "Île-de-France", latitude: 48.8566, longitude: 2.3522 },
      { name: "Normandie", latitude: 48.8798, longitude: 0.1712 },
      { name: "Nouvelle-Aquitaine", latitude: 45.7088, longitude: 0.6261 },
      { name: "Occitanie", latitude: 43.8927, longitude: 3.2828 },
      { name: "Pays de la Loire", latitude: 47.7633, longitude: -0.3296 },
      { name: "Provence-Alpes-Côte d'Azur", latitude: 43.9352, longitude: 6.0679 },
    ],
  },
  {
    code: "ES", name: "España", flag: "🇪🇸",
    regions: [
      { name: "Andalucía", latitude: 37.5443, longitude: -4.7278 },
      { name: "Aragón", latitude: 41.5976, longitude: -0.9057 },
      { name: "Asturias", latitude: 43.3614, longitude: -5.8593 },
      { name: "Canarias", latitude: 28.1235, longitude: -15.4363 },
      { name: "Cantabria", latitude: 43.1829, longitude: -3.9878 },
      { name: "Castilla y León", latitude: 41.8357, longitude: -4.3976 },
      { name: "Castilla-La Mancha", latitude: 39.2796, longitude: -3.0977 },
      { name: "Cataluña", latitude: 41.5912, longitude: 1.5209 },
      { name: "Comunidad Valenciana", latitude: 39.4842, longitude: -0.7533 },
      { name: "Extremadura", latitude: 39.4937, longitude: -6.0679 },
      { name: "Galicia", latitude: 42.5751, longitude: -8.1339 },
      { name: "Islas Baleares", latitude: 39.5713, longitude: 2.6467 },
      { name: "La Rioja", latitude: 42.2871, longitude: -2.5396 },
      { name: "Madrid", latitude: 40.4168, longitude: -3.7038 },
      { name: "Murcia", latitude: 37.9922, longitude: -1.1307 },
      { name: "Navarra", latitude: 42.6954, longitude: -1.6761 },
      { name: "País Vasco", latitude: 42.9896, longitude: -2.6189 },
    ],
  },
  {
    code: "PT", name: "Portugal", flag: "🇵🇹",
    regions: [
      { name: "Norte", latitude: 41.1579, longitude: -8.6291 },
      { name: "Centro", latitude: 40.2033, longitude: -8.4103 },
      { name: "Lisboa", latitude: 38.7223, longitude: -9.1393 },
      { name: "Alentejo", latitude: 38.5675, longitude: -7.9069 },
      { name: "Algarve", latitude: 37.0179, longitude: -7.9304 },
      { name: "Açores", latitude: 37.7412, longitude: -25.6756 },
      { name: "Madeira", latitude: 32.6669, longitude: -16.9241 },
    ],
  },
  {
    code: "GB", name: "United Kingdom", flag: "🇬🇧",
    regions: [
      { name: "England - East Midlands", latitude: 52.8311, longitude: -1.3328 },
      { name: "England - East of England", latitude: 52.2405, longitude: 0.9027 },
      { name: "England - London", latitude: 51.5074, longitude: -0.1278 },
      { name: "England - North East", latitude: 55.2083, longitude: -2.0784 },
      { name: "England - North West", latitude: 54.4509, longitude: -2.7731 },
      { name: "England - South East", latitude: 51.4353, longitude: -0.5572 },
      { name: "England - South West", latitude: 50.7772, longitude: -3.999 },
      { name: "England - West Midlands", latitude: 52.4751, longitude: -1.8298 },
      { name: "England - Yorkshire", latitude: 53.9591, longitude: -1.0815 },
      { name: "Scotland", latitude: 56.4907, longitude: -4.2026 },
      { name: "Wales", latitude: 52.1307, longitude: -3.7837 },
      { name: "Northern Ireland", latitude: 54.7877, longitude: -6.4923 },
    ],
  },
  {
    code: "IE", name: "Ireland", flag: "🇮🇪",
    regions: [
      { name: "Connacht", latitude: 53.7697, longitude: -8.8 },
      { name: "Leinster", latitude: 53.1618, longitude: -7.1525 },
      { name: "Munster", latitude: 52.2394, longitude: -8.8574 },
      { name: "Ulster", latitude: 54.5973, longitude: -7.3092 },
    ],
  },
  {
    code: "NL", name: "Nederland", flag: "🇳🇱",
    regions: [
      { name: "Drenthe", latitude: 52.8619, longitude: 6.6832 },
      { name: "Flevoland", latitude: 52.4272, longitude: 5.575 },
      { name: "Friesland", latitude: 53.1642, longitude: 5.7817 },
      { name: "Gelderland", latitude: 52.0452, longitude: 5.8718 },
      { name: "Groningen", latitude: 53.2194, longitude: 6.5665 },
      { name: "Limburg", latitude: 51.4427, longitude: 6.0608 },
      { name: "Noord-Brabant", latitude: 51.4826, longitude: 5.2321 },
      { name: "Noord-Holland", latitude: 52.5206, longitude: 4.788 },
      { name: "Overijssel", latitude: 52.4389, longitude: 6.5016 },
      { name: "Utrecht", latitude: 52.0907, longitude: 5.1214 },
      { name: "Zeeland", latitude: 51.4941, longitude: 3.8497 },
      { name: "Zuid-Holland", latitude: 51.9851, longitude: 4.4928 },
    ],
  },
  {
    code: "BE", name: "Belgique", flag: "🇧🇪",
    regions: [
      { name: "Bruxelles-Capitale", latitude: 50.8503, longitude: 4.3517 },
      { name: "Wallonie", latitude: 50.4541, longitude: 4.4525 },
      { name: "Vlaanderen", latitude: 51.0501, longitude: 3.7303 },
    ],
  },
  {
    code: "LU", name: "Luxembourg", flag: "🇱🇺",
    regions: [
      { name: "Luxembourg", latitude: 49.6117, longitude: 6.13 },
      { name: "Diekirch", latitude: 49.8683, longitude: 6.1597 },
      { name: "Grevenmacher", latitude: 49.6806, longitude: 6.4407 },
    ],
  },
  {
    code: "DK", name: "Danmark", flag: "🇩🇰",
    regions: [
      { name: "Hovedstaden", latitude: 55.6761, longitude: 12.5683 },
      { name: "Midtjylland", latitude: 56.3019, longitude: 9.3027 },
      { name: "Nordjylland", latitude: 57.048, longitude: 9.9214 },
      { name: "Sjælland", latitude: 55.4038, longitude: 11.3529 },
      { name: "Syddanmark", latitude: 55.3308, longitude: 9.1292 },
    ],
  },
  {
    code: "SE", name: "Sverige", flag: "🇸🇪",
    regions: [
      { name: "Götaland", latitude: 57.7089, longitude: 11.9746 },
      { name: "Svealand", latitude: 59.3293, longitude: 18.0686 },
      { name: "Norrland", latitude: 63.8258, longitude: 20.2631 },
    ],
  },
  {
    code: "NO", name: "Norge", flag: "🇳🇴",
    regions: [
      { name: "Østlandet", latitude: 59.9139, longitude: 10.7522 },
      { name: "Vestlandet", latitude: 60.3913, longitude: 5.3221 },
      { name: "Sørlandet", latitude: 58.1462, longitude: 7.9956 },
      { name: "Trøndelag", latitude: 63.4305, longitude: 10.3951 },
      { name: "Nord-Norge", latitude: 69.6496, longitude: 18.9554 },
    ],
  },
  {
    code: "FI", name: "Suomi", flag: "🇫🇮",
    regions: [
      { name: "Etelä-Suomi", latitude: 60.1699, longitude: 24.9384 },
      { name: "Länsi-Suomi", latitude: 61.4978, longitude: 23.761 },
      { name: "Itä-Suomi", latitude: 62.8924, longitude: 27.6783 },
      { name: "Pohjois-Suomi", latitude: 65.0121, longitude: 25.4651 },
      { name: "Lappi", latitude: 68.0588, longitude: 24.0581 },
    ],
  },
  {
    code: "PL", name: "Polska", flag: "🇵🇱",
    regions: [
      { name: "Dolnośląskie", latitude: 51.1079, longitude: 17.0385 },
      { name: "Kujawsko-Pomorskie", latitude: 53.1235, longitude: 18.0084 },
      { name: "Lubelskie", latitude: 51.2465, longitude: 22.5684 },
      { name: "Lubuskie", latitude: 52.7273, longitude: 15.2378 },
      { name: "Łódzkie", latitude: 51.7592, longitude: 19.456 },
      { name: "Małopolskie", latitude: 50.0647, longitude: 19.945 },
      { name: "Mazowieckie", latitude: 52.2297, longitude: 21.0122 },
      { name: "Opolskie", latitude: 50.6751, longitude: 17.9213 },
      { name: "Podkarpackie", latitude: 50.0412, longitude: 22.0047 },
      { name: "Podlaskie", latitude: 53.1325, longitude: 23.1688 },
      { name: "Pomorskie", latitude: 54.352, longitude: 18.6466 },
      { name: "Śląskie", latitude: 50.2649, longitude: 19.0238 },
      { name: "Świętokrzyskie", latitude: 50.8661, longitude: 20.6286 },
      { name: "Warmińsko-Mazurskie", latitude: 53.778, longitude: 20.4801 },
      { name: "Wielkopolskie", latitude: 52.4064, longitude: 16.9252 },
      { name: "Zachodniopomorskie", latitude: 53.4285, longitude: 14.553 },
    ],
  },
  {
    code: "CZ", name: "Česko", flag: "🇨🇿",
    regions: [
      { name: "Praha", latitude: 50.0755, longitude: 14.4378 },
      { name: "Středočeský", latitude: 49.8175, longitude: 15.473 },
      { name: "Jihočeský", latitude: 49.0475, longitude: 14.0571 },
      { name: "Plzeňský", latitude: 49.7384, longitude: 13.3736 },
      { name: "Karlovarský", latitude: 50.2329, longitude: 12.8714 },
      { name: "Ústecký", latitude: 50.661, longitude: 14.053 },
      { name: "Liberecký", latitude: 50.7663, longitude: 15.0543 },
      { name: "Královéhradecký", latitude: 50.2104, longitude: 15.8253 },
      { name: "Pardubický", latitude: 49.9444, longitude: 15.9932 },
      { name: "Vysočina", latitude: 49.478, longitude: 15.7946 },
      { name: "Jihomoravský", latitude: 49.2128, longitude: 16.6244 },
      { name: "Olomoucký", latitude: 49.5938, longitude: 17.2509 },
      { name: "Zlínský", latitude: 49.2249, longitude: 17.6628 },
      { name: "Moravskoslezský", latitude: 49.8209, longitude: 18.2625 },
    ],
  },
  {
    code: "SK", name: "Slovensko", flag: "🇸🇰",
    regions: [
      { name: "Bratislavský", latitude: 48.1486, longitude: 17.1077 },
      { name: "Trnavský", latitude: 48.3774, longitude: 17.5866 },
      { name: "Trenčiansky", latitude: 48.8945, longitude: 18.0444 },
      { name: "Nitriansky", latitude: 48.3069, longitude: 18.0868 },
      { name: "Žilinský", latitude: 49.2231, longitude: 18.7394 },
      { name: "Banskobystrický", latitude: 48.7358, longitude: 19.146 },
      { name: "Prešovský", latitude: 49.0, longitude: 21.2393 },
      { name: "Košický", latitude: 48.7164, longitude: 21.2611 },
    ],
  },
  {
    code: "HU", name: "Magyarország", flag: "🇭🇺",
    regions: [
      { name: "Budapest", latitude: 47.4979, longitude: 19.0402 },
      { name: "Közép-Dunántúl", latitude: 47.1897, longitude: 18.4216 },
      { name: "Nyugat-Dunántúl", latitude: 47.0849, longitude: 16.8416 },
      { name: "Dél-Dunántúl", latitude: 46.0727, longitude: 18.2328 },
      { name: "Észak-Magyarország", latitude: 48.0935, longitude: 20.3432 },
      { name: "Észak-Alföld", latitude: 47.5316, longitude: 21.6273 },
      { name: "Dél-Alföld", latitude: 46.253, longitude: 20.1414 },
    ],
  },
  {
    code: "RO", name: "România", flag: "🇷🇴",
    regions: [
      { name: "București", latitude: 44.4268, longitude: 26.1025 },
      { name: "Transilvania", latitude: 46.7712, longitude: 23.6236 },
      { name: "Moldova", latitude: 47.1585, longitude: 27.6014 },
      { name: "Muntenia", latitude: 44.4268, longitude: 26.1025 },
      { name: "Oltenia", latitude: 44.3302, longitude: 23.7949 },
      { name: "Banat", latitude: 45.7489, longitude: 21.2087 },
      { name: "Dobrogea", latitude: 44.1598, longitude: 28.6348 },
    ],
  },
  {
    code: "BG", name: "България", flag: "🇧🇬",
    regions: [
      { name: "Sofia", latitude: 42.6977, longitude: 23.3219 },
      { name: "Plovdiv", latitude: 42.1354, longitude: 24.7453 },
      { name: "Varna", latitude: 43.2141, longitude: 27.9147 },
      { name: "Burgas", latitude: 42.5048, longitude: 27.4626 },
      { name: "Veliko Tarnovo", latitude: 43.0757, longitude: 25.6172 },
    ],
  },
  {
    code: "HR", name: "Hrvatska", flag: "🇭🇷",
    regions: [
      { name: "Zagreb", latitude: 45.815, longitude: 15.9819 },
      { name: "Slavonija", latitude: 45.554, longitude: 18.6955 },
      { name: "Dalmacija", latitude: 43.5081, longitude: 16.4402 },
      { name: "Istra", latitude: 45.2128, longitude: 13.8038 },
      { name: "Kvarner", latitude: 45.3271, longitude: 14.4422 },
    ],
  },
  {
    code: "SI", name: "Slovenija", flag: "🇸🇮",
    regions: [
      { name: "Ljubljana", latitude: 46.0569, longitude: 14.5058 },
      { name: "Maribor", latitude: 46.5547, longitude: 15.6459 },
      { name: "Primorska", latitude: 45.7275, longitude: 13.8507 },
      { name: "Gorenjska", latitude: 46.3539, longitude: 14.0854 },
    ],
  },
  {
    code: "RS", name: "Srbija", flag: "🇷🇸",
    regions: [
      { name: "Beograd", latitude: 44.7866, longitude: 20.4489 },
      { name: "Vojvodina", latitude: 45.2517, longitude: 19.8369 },
      { name: "Šumadija", latitude: 44.0165, longitude: 20.9079 },
      { name: "Južna Srbija", latitude: 43.3209, longitude: 21.8954 },
    ],
  },
  {
    code: "BA", name: "Bosna i Hercegovina", flag: "🇧🇦",
    regions: [
      { name: "Federacija BiH", latitude: 43.8563, longitude: 18.4131 },
      { name: "Republika Srpska", latitude: 44.7758, longitude: 17.1858 },
    ],
  },
  {
    code: "ME", name: "Crna Gora", flag: "🇲🇪",
    regions: [
      { name: "Podgorica", latitude: 42.4304, longitude: 19.2594 },
      { name: "Primorje", latitude: 42.294, longitude: 18.8395 },
    ],
  },
  {
    code: "MK", name: "Северна Македонија", flag: "🇲🇰",
    regions: [
      { name: "Skopje", latitude: 41.9981, longitude: 21.4254 },
      { name: "Ohrid", latitude: 41.1171, longitude: 20.802 },
    ],
  },
  {
    code: "AL", name: "Shqipëria", flag: "🇦🇱",
    regions: [
      { name: "Tiranë", latitude: 41.3275, longitude: 19.8187 },
      { name: "Durrës", latitude: 41.3233, longitude: 19.4543 },
      { name: "Vlorë", latitude: 40.4607, longitude: 19.4911 },
      { name: "Shkodër", latitude: 42.0693, longitude: 19.5126 },
    ],
  },
  {
    code: "GR", name: "Ελλάδα", flag: "🇬🇷",
    regions: [
      { name: "Attikí", latitude: 37.9838, longitude: 23.7275 },
      { name: "Kentrikí Makedonía", latitude: 40.6401, longitude: 22.9444 },
      { name: "Thessalía", latitude: 39.6391, longitude: 22.4191 },
      { name: "Dytikí Elláda", latitude: 38.2466, longitude: 21.735 },
      { name: "Kríti", latitude: 35.2401, longitude: 24.4709 },
      { name: "Pelopónnisos", latitude: 37.508, longitude: 22.375 },
      { name: "Nótio Aigaío", latitude: 37.4415, longitude: 25.3489 },
    ],
  },
  {
    code: "CY", name: "Κύπρος", flag: "🇨🇾",
    regions: [
      { name: "Lefkosía", latitude: 35.1856, longitude: 33.3823 },
      { name: "Lemesós", latitude: 34.6823, longitude: 33.0464 },
      { name: "Páfos", latitude: 34.7595, longitude: 32.4217 },
    ],
  },
  {
    code: "MT", name: "Malta", flag: "🇲🇹",
    regions: [
      { name: "Malta", latitude: 35.8989, longitude: 14.5146 },
      { name: "Gozo", latitude: 36.0444, longitude: 14.2518 },
    ],
  },
  {
    code: "EE", name: "Eesti", flag: "🇪🇪",
    regions: [
      { name: "Tallinn", latitude: 59.437, longitude: 24.7536 },
      { name: "Tartu", latitude: 58.378, longitude: 26.7291 },
    ],
  },
  {
    code: "LV", name: "Latvija", flag: "🇱🇻",
    regions: [
      { name: "Rīga", latitude: 56.9496, longitude: 24.1052 },
      { name: "Vidzeme", latitude: 57.5389, longitude: 25.4232 },
      { name: "Kurzeme", latitude: 56.9523, longitude: 21.5601 },
      { name: "Latgale", latitude: 56.6523, longitude: 27.2445 },
    ],
  },
  {
    code: "LT", name: "Lietuva", flag: "🇱🇹",
    regions: [
      { name: "Vilnius", latitude: 54.6872, longitude: 25.2797 },
      { name: "Kaunas", latitude: 54.8985, longitude: 23.9036 },
      { name: "Klaipėda", latitude: 55.7033, longitude: 21.1443 },
    ],
  },
  {
    code: "IS", name: "Ísland", flag: "🇮🇸",
    regions: [
      { name: "Höfuðborgarsvæðið", latitude: 64.1466, longitude: -21.9426 },
      { name: "Suðurland", latitude: 63.9453, longitude: -20.6671 },
      { name: "Norðurland", latitude: 65.6835, longitude: -18.0878 },
    ],
  },
  {
    code: "TR", name: "Türkiye", flag: "🇹🇷",
    regions: [
      { name: "İstanbul", latitude: 41.0082, longitude: 28.9784 },
      { name: "Ankara", latitude: 39.9334, longitude: 32.8597 },
      { name: "İzmir", latitude: 38.4237, longitude: 27.1428 },
      { name: "Antalya", latitude: 36.8969, longitude: 30.7133 },
      { name: "Bursa", latitude: 40.1826, longitude: 29.0665 },
      { name: "Karadeniz", latitude: 41.0027, longitude: 39.7168 },
      { name: "Güneydoğu Anadolu", latitude: 37.0662, longitude: 37.3833 },
      { name: "İç Anadolu", latitude: 38.7312, longitude: 35.4787 },
    ],
  },
  {
    code: "AD", name: "Andorra", flag: "🇦🇩",
    regions: [
      { name: "Andorra la Vella", latitude: 42.5063, longitude: 1.5218 },
      { name: "Escaldes-Engordany", latitude: 42.5086, longitude: 1.5394 },
      { name: "Encamp", latitude: 42.5348, longitude: 1.5831 },
      { name: "La Massana", latitude: 42.5449, longitude: 1.5148 },
      { name: "Ordino", latitude: 42.5561, longitude: 1.5332 },
      { name: "Sant Julià de Lòria", latitude: 42.4637, longitude: 1.4913 },
      { name: "Canillo", latitude: 42.5672, longitude: 1.5977 },
    ],
  },
  {
    code: "BY", name: "Belarus", flag: "🇧🇾",
    regions: [
      { name: "Minsk", latitude: 53.9045, longitude: 27.5615 },
      { name: "Brest", latitude: 52.0976, longitude: 23.6877 },
      { name: "Grodno", latitude: 53.6884, longitude: 23.8258 },
      { name: "Gomel", latitude: 52.4345, longitude: 30.9754 },
      { name: "Mogilev", latitude: 53.8998, longitude: 30.3449 },
      { name: "Vitebsk", latitude: 55.1846, longitude: 30.2058 },
    ],
  },
  {
    code: "LI", name: "Liechtenstein", flag: "🇱🇮",
    regions: [
      { name: "Vaduz", latitude: 47.1410, longitude: 9.5215 },
      { name: "Schaan", latitude: 47.1647, longitude: 9.5094 },
      { name: "Balzers", latitude: 47.0667, longitude: 9.5000 },
      { name: "Triesen", latitude: 47.1073, longitude: 9.5272 },
      { name: "Eschen", latitude: 47.2107, longitude: 9.5222 },
    ],
  },
  {
    code: "MC", name: "Monaco", flag: "🇲🇨",
    regions: [
      { name: "Monaco-Ville", latitude: 43.7311, longitude: 7.4197 },
      { name: "Monte-Carlo", latitude: 43.7402, longitude: 7.4266 },
      { name: "La Condamine", latitude: 43.7350, longitude: 7.4200 },
      { name: "Fontvieille", latitude: 43.7271, longitude: 7.4137 },
    ],
  },
  {
    code: "MD", name: "Moldova", flag: "🇲🇩",
    regions: [
      { name: "Chișinău", latitude: 47.0105, longitude: 28.8638 },
      { name: "Bălți", latitude: 47.7617, longitude: 27.9290 },
      { name: "Cahul", latitude: 45.9046, longitude: 28.1941 },
      { name: "Orhei", latitude: 47.3824, longitude: 28.8236 },
      { name: "Ungheni", latitude: 47.2100, longitude: 27.8004 },
      { name: "Soroca", latitude: 48.1665, longitude: 28.2982 },
      { name: "Gagauzia", latitude: 46.3000, longitude: 28.6500 },
    ],
  },
  {
    code: "SM", name: "San Marino", flag: "🇸🇲",
    regions: [
      { name: "San Marino Città", latitude: 43.9333, longitude: 12.4500 },
      { name: "Borgo Maggiore", latitude: 43.9414, longitude: 12.4478 },
      { name: "Serravalle", latitude: 43.9696, longitude: 12.4760 },
      { name: "Domagnano", latitude: 43.9500, longitude: 12.4667 },
      { name: "Faetano", latitude: 43.9264, longitude: 12.4953 },
      { name: "Fiorentino", latitude: 43.9097, longitude: 12.4581 },
    ],
  },
  {
    code: "UA", name: "Ucraina", flag: "🇺🇦",
    regions: [
      { name: "Kyiv", latitude: 50.4501, longitude: 30.5234 },
      { name: "Kharkiv", latitude: 49.9935, longitude: 36.2304 },
      { name: "Odesa", latitude: 46.4825, longitude: 30.7233 },
      { name: "Dnipro", latitude: 48.4647, longitude: 35.0462 },
      { name: "Lviv", latitude: 49.8397, longitude: 24.0297 },
      { name: "Zaporizhzhia", latitude: 47.8388, longitude: 35.1396 },
      { name: "Vinnytsia", latitude: 49.2328, longitude: 28.4816 },
      { name: "Poltava", latitude: 49.5883, longitude: 34.5514 },
      { name: "Chernihiv", latitude: 51.4982, longitude: 31.2893 },
      { name: "Ivano-Frankivsk", latitude: 48.9226, longitude: 24.7111 },
      { name: "Ternopil", latitude: 49.5535, longitude: 25.5948 },
      { name: "Zakarpattia", latitude: 48.6208, longitude: 22.2879 },
    ],
  },
  {
    code: "VA", name: "Città del Vaticano", flag: "🇻🇦",
    regions: [
      { name: "Città del Vaticano", latitude: 41.9029, longitude: 12.4534 },
    ],
  },
  {
    code: "XK", name: "Kosovo", flag: "🇽🇰",
    regions: [
      { name: "Prishtina", latitude: 42.6629, longitude: 21.1655 },
      { name: "Prizren", latitude: 42.2139, longitude: 20.7397 },
      { name: "Peja", latitude: 42.6593, longitude: 20.2888 },
      { name: "Gjilan", latitude: 42.4635, longitude: 21.4694 },
      { name: "Mitrovica", latitude: 42.8833, longitude: 20.8667 },
      { name: "Ferizaj", latitude: 42.3703, longitude: 21.1553 },
    ],
  },
  {
    code: "GE", name: "Georgia", flag: "🇬🇪",
    regions: [
      { name: "Tbilisi", latitude: 41.7151, longitude: 44.8271 },
      { name: "Batumi", latitude: 41.6168, longitude: 41.6367 },
      { name: "Kutaisi", latitude: 42.2679, longitude: 42.6946 },
      { name: "Kakheti", latitude: 41.6483, longitude: 45.6906 },
      { name: "Imereti", latitude: 42.2300, longitude: 42.7000 },
    ],
  },
  {
    code: "AM", name: "Armenia", flag: "🇦🇲",
    regions: [
      { name: "Yerevan", latitude: 40.1792, longitude: 44.4991 },
      { name: "Gyumri", latitude: 40.7894, longitude: 43.8475 },
      { name: "Vanadzor", latitude: 40.8128, longitude: 44.4883 },
      { name: "Ararat", latitude: 39.8303, longitude: 44.7000 },
    ],
  },
  {
    code: "AZ", name: "Azerbaijan", flag: "🇦🇿",
    regions: [
      { name: "Baku", latitude: 40.4093, longitude: 49.8671 },
      { name: "Ganja", latitude: 40.6828, longitude: 46.3606 },
      { name: "Sumgait", latitude: 40.5897, longitude: 49.6318 },
      { name: "Lankaran", latitude: 38.7539, longitude: 48.8511 },
    ],
  },
  {
    code: "RU", name: "Russia", flag: "🇷🇺",
    regions: [
      { name: "Mosca", latitude: 55.7558, longitude: 37.6173 },
      { name: "San Pietroburgo", latitude: 59.9343, longitude: 30.3351 },
      { name: "Kaliningrad", latitude: 54.7104, longitude: 20.4522 },
      { name: "Krasnodar", latitude: 45.0353, longitude: 38.9753 },
      { name: "Kazan", latitude: 55.7879, longitude: 49.1233 },
      { name: "Nizhny Novgorod", latitude: 56.2965, longitude: 43.9361 },
      { name: "Novosibirsk", latitude: 55.0084, longitude: 82.9357 },
      { name: "Ekaterinburg", latitude: 56.8389, longitude: 60.6057 },
      { name: "Sochi", latitude: 43.5855, longitude: 39.7231 },
      { name: "Rostov-on-Don", latitude: 47.2357, longitude: 39.7015 },
      { name: "Samara", latitude: 53.1959, longitude: 50.1002 },
      { name: "Volgograd", latitude: 48.7080, longitude: 44.5133 },
    ],
  },
  {
    code: "US", name: "United States", flag: "🇺🇸",
    regions: [
      { name: "Alabama", latitude: 32.3617, longitude: -86.2792, cities: [
        { name: "Birmingham", latitude: 33.5186, longitude: -86.8104 },
        { name: "Montgomery", latitude: 32.3668, longitude: -86.2999 },
        { name: "Huntsville", latitude: 34.7304, longitude: -86.5861 },
        { name: "Mobile", latitude: 30.6954, longitude: -88.0399 },
        { name: "Tuscaloosa", latitude: 33.2098, longitude: -87.5692 },
      ]},
      { name: "Alaska", latitude: 64.2008, longitude: -153.4937, cities: [
        { name: "Anchorage", latitude: 61.2181, longitude: -149.9003 },
        { name: "Fairbanks", latitude: 64.8378, longitude: -147.7164 },
        { name: "Juneau", latitude: 58.3005, longitude: -134.4197 },
        { name: "Sitka", latitude: 57.0531, longitude: -135.3300 },
        { name: "Ketchikan", latitude: 55.3422, longitude: -131.6461 },
      ]},
      { name: "Arizona", latitude: 34.0489, longitude: -111.0937, cities: [
        { name: "Phoenix", latitude: 33.4484, longitude: -112.0740 },
        { name: "Tucson", latitude: 32.2226, longitude: -110.9747 },
        { name: "Mesa", latitude: 33.4152, longitude: -111.8315 },
        { name: "Chandler", latitude: 33.3062, longitude: -111.8413 },
        { name: "Scottsdale", latitude: 33.4942, longitude: -111.9261 },
        { name: "Tempe", latitude: 33.4255, longitude: -111.9400 },
      ]},
      { name: "Arkansas", latitude: 34.9697, longitude: -92.3731, cities: [
        { name: "Little Rock", latitude: 34.7465, longitude: -92.2896 },
        { name: "Fort Smith", latitude: 35.3859, longitude: -94.3985 },
        { name: "Fayetteville", latitude: 36.0822, longitude: -94.1719 },
        { name: "Springdale", latitude: 36.1867, longitude: -94.1288 },
        { name: "Jonesboro", latitude: 35.8423, longitude: -90.7043 },
      ]},
      { name: "California", latitude: 36.7783, longitude: -119.4179, cities: [
        { name: "Los Angeles", latitude: 34.0522, longitude: -118.2437 },
        { name: "San Francisco", latitude: 37.7749, longitude: -122.4194 },
        { name: "San Diego", latitude: 32.7157, longitude: -117.1611 },
        { name: "San Jose", latitude: 37.3382, longitude: -121.8863 },
        { name: "Sacramento", latitude: 38.5816, longitude: -121.4944 },
        { name: "Fresno", latitude: 36.7378, longitude: -119.7871 },
        { name: "Long Beach", latitude: 33.7701, longitude: -118.1937 },
      ]},
      { name: "Colorado", latitude: 39.5501, longitude: -105.7821, cities: [
        { name: "Denver", latitude: 39.7392, longitude: -104.9903 },
        { name: "Colorado Springs", latitude: 38.8339, longitude: -104.8214 },
        { name: "Aurora", latitude: 39.7294, longitude: -104.8319 },
        { name: "Fort Collins", latitude: 40.5853, longitude: -105.0844 },
        { name: "Boulder", latitude: 40.0150, longitude: -105.2705 },
      ]},
      { name: "Connecticut", latitude: 41.6032, longitude: -73.0877, cities: [
        { name: "Bridgeport", latitude: 41.1865, longitude: -73.1952 },
        { name: "New Haven", latitude: 41.3082, longitude: -72.9282 },
        { name: "Stamford", latitude: 41.0534, longitude: -73.5387 },
        { name: "Hartford", latitude: 41.7658, longitude: -72.6851 },
        { name: "Waterbury", latitude: 41.5582, longitude: -73.0515 },
      ]},
      { name: "Delaware", latitude: 38.9108, longitude: -75.5277, cities: [
        { name: "Wilmington", latitude: 39.7447, longitude: -75.5484 },
        { name: "Dover", latitude: 39.1582, longitude: -75.5244 },
        { name: "Newark", latitude: 39.6837, longitude: -75.7497 },
        { name: "Middletown", latitude: 39.4496, longitude: -75.7163 },
        { name: "Smyrna", latitude: 39.2998, longitude: -75.6052 },
      ]},
      { name: "Florida", latitude: 27.6648, longitude: -81.5158, cities: [
        { name: "Jacksonville", latitude: 30.3322, longitude: -81.6557 },
        { name: "Miami", latitude: 25.7617, longitude: -80.1918 },
        { name: "Tampa", latitude: 27.9506, longitude: -82.4572 },
        { name: "Orlando", latitude: 28.5383, longitude: -81.3792 },
        { name: "St. Petersburg", latitude: 27.7676, longitude: -82.6403 },
        { name: "Hialeah", latitude: 25.8576, longitude: -80.2781 },
      ]},
      { name: "Georgia", latitude: 32.1656, longitude: -82.9001, cities: [
        { name: "Atlanta", latitude: 33.7490, longitude: -84.3880 },
        { name: "Augusta", latitude: 33.4735, longitude: -82.0105 },
        { name: "Columbus", latitude: 32.4610, longitude: -84.9877 },
        { name: "Macon", latitude: 32.8407, longitude: -83.6324 },
        { name: "Savannah", latitude: 32.0835, longitude: -81.0998 },
        { name: "Athens", latitude: 33.9519, longitude: -83.3576 },
      ]},
      { name: "Hawaii", latitude: 19.8968, longitude: -155.5828, cities: [
        { name: "Honolulu", latitude: 21.3069, longitude: -157.8583 },
        { name: "Hilo", latitude: 19.7297, longitude: -155.0900 },
        { name: "Kailua", latitude: 21.4022, longitude: -157.7394 },
        { name: "Kapolei", latitude: 21.3352, longitude: -158.0736 },
        { name: "Kaneohe", latitude: 21.4022, longitude: -157.8008 },
      ]},
      { name: "Idaho", latitude: 44.0682, longitude: -114.7420, cities: [
        { name: "Boise", latitude: 43.6150, longitude: -116.2023 },
        { name: "Nampa", latitude: 43.5407, longitude: -116.5635 },
        { name: "Meridian", latitude: 43.6121, longitude: -116.3915 },
        { name: "Idaho Falls", latitude: 43.4917, longitude: -112.0340 },
        { name: "Pocatello", latitude: 42.8713, longitude: -112.4455 },
      ]},
      { name: "Illinois", latitude: 40.6331, longitude: -89.3985, cities: [
        { name: "Chicago", latitude: 41.8781, longitude: -87.6298 },
        { name: "Aurora", latitude: 41.7606, longitude: -88.3201 },
        { name: "Naperville", latitude: 41.7508, longitude: -88.1535 },
        { name: "Rockford", latitude: 42.2711, longitude: -89.0940 },
        { name: "Springfield", latitude: 39.7817, longitude: -89.6501 },
        { name: "Joliet", latitude: 41.5250, longitude: -88.0817 },
      ]},
      { name: "Indiana", latitude: 40.2672, longitude: -86.1349, cities: [
        { name: "Indianapolis", latitude: 39.7684, longitude: -86.1581 },
        { name: "Fort Wayne", latitude: 41.1306, longitude: -85.1289 },
        { name: "Evansville", latitude: 37.9716, longitude: -87.5711 },
        { name: "South Bend", latitude: 41.6764, longitude: -86.2520 },
        { name: "Carmel", latitude: 39.9784, longitude: -86.1180 },
      ]},
      { name: "Iowa", latitude: 41.8780, longitude: -93.0977, cities: [
        { name: "Des Moines", latitude: 41.6005, longitude: -93.6091 },
        { name: "Cedar Rapids", latitude: 41.9779, longitude: -91.6656 },
        { name: "Davenport", latitude: 41.5236, longitude: -90.5776 },
        { name: "Sioux City", latitude: 42.4999, longitude: -96.4003 },
        { name: "Iowa City", latitude: 41.6611, longitude: -91.5302 },
      ]},
      { name: "Kansas", latitude: 39.0119, longitude: -98.4842, cities: [
        { name: "Wichita", latitude: 37.6872, longitude: -97.3301 },
        { name: "Overland Park", latitude: 38.9822, longitude: -94.6708 },
        { name: "Kansas City", latitude: 39.1155, longitude: -94.6268 },
        { name: "Topeka", latitude: 39.0473, longitude: -95.6752 },
        { name: "Olathe", latitude: 38.8814, longitude: -94.8191 },
      ]},
      { name: "Kentucky", latitude: 37.8393, longitude: -84.2700, cities: [
        { name: "Louisville", latitude: 38.2527, longitude: -85.7585 },
        { name: "Lexington", latitude: 38.0406, longitude: -84.5037 },
        { name: "Bowling Green", latitude: 36.9903, longitude: -86.4436 },
        { name: "Owensboro", latitude: 37.7719, longitude: -87.1112 },
        { name: "Covington", latitude: 39.0837, longitude: -84.5086 },
      ]},
      { name: "Louisiana", latitude: 30.9843, longitude: -91.9623, cities: [
        { name: "New Orleans", latitude: 29.9511, longitude: -90.0715 },
        { name: "Baton Rouge", latitude: 30.4515, longitude: -91.1871 },
        { name: "Shreveport", latitude: 32.5252, longitude: -93.7502 },
        { name: "Metairie", latitude: 29.9999, longitude: -90.1731 },
        { name: "Lafayette", latitude: 30.2241, longitude: -92.0198 },
      ]},
      { name: "Maine", latitude: 45.2538, longitude: -69.4455, cities: [
        { name: "Portland", latitude: 43.6615, longitude: -70.2553 },
        { name: "Lewiston", latitude: 44.1004, longitude: -70.2148 },
        { name: "Bangor", latitude: 44.8012, longitude: -68.7778 },
        { name: "South Portland", latitude: 43.6415, longitude: -70.2409 },
        { name: "Auburn", latitude: 44.0978, longitude: -70.2312 },
      ]},
      { name: "Maryland", latitude: 39.0458, longitude: -76.6413, cities: [
        { name: "Baltimore", latitude: 39.2904, longitude: -76.6122 },
        { name: "Frederick", latitude: 39.4143, longitude: -77.4105 },
        { name: "Rockville", latitude: 39.0840, longitude: -77.1528 },
        { name: "Gaithersburg", latitude: 39.1434, longitude: -77.2014 },
        { name: "Annapolis", latitude: 38.9784, longitude: -76.4922 },
      ]},
      { name: "Massachusetts", latitude: 42.4072, longitude: -71.3824, cities: [
        { name: "Boston", latitude: 42.3601, longitude: -71.0589 },
        { name: "Worcester", latitude: 42.2626, longitude: -71.8023 },
        { name: "Springfield", latitude: 42.1015, longitude: -72.5898 },
        { name: "Cambridge", latitude: 42.3736, longitude: -71.1097 },
        { name: "Lowell", latitude: 42.6334, longitude: -71.3162 },
      ]},
      { name: "Michigan", latitude: 44.3148, longitude: -85.6024, cities: [
        { name: "Detroit", latitude: 42.3314, longitude: -83.0458 },
        { name: "Grand Rapids", latitude: 42.9634, longitude: -85.6681 },
        { name: "Warren", latitude: 42.5145, longitude: -83.0147 },
        { name: "Sterling Heights", latitude: 42.5803, longitude: -83.0302 },
        { name: "Ann Arbor", latitude: 42.2808, longitude: -83.7430 },
      ]},
      { name: "Minnesota", latitude: 46.7296, longitude: -94.6859, cities: [
        { name: "Minneapolis", latitude: 44.9778, longitude: -93.2650 },
        { name: "Saint Paul", latitude: 44.9537, longitude: -93.0900 },
        { name: "Rochester", latitude: 44.0121, longitude: -92.4802 },
        { name: "Duluth", latitude: 46.7867, longitude: -92.1005 },
        { name: "Bloomington", latitude: 44.8408, longitude: -93.3477 },
      ]},
      { name: "Mississippi", latitude: 32.3547, longitude: -89.3985, cities: [
        { name: "Jackson", latitude: 32.2988, longitude: -90.1848 },
        { name: "Gulfport", latitude: 30.3674, longitude: -89.0928 },
        { name: "Southaven", latitude: 34.9890, longitude: -90.0023 },
        { name: "Hattiesburg", latitude: 31.3271, longitude: -89.2903 },
        { name: "Biloxi", latitude: 30.3960, longitude: -88.8853 },
      ]},
      { name: "Missouri", latitude: 37.9643, longitude: -91.8318, cities: [
        { name: "Kansas City", latitude: 39.0997, longitude: -94.5786 },
        { name: "Saint Louis", latitude: 38.6270, longitude: -90.1994 },
        { name: "Springfield", latitude: 37.2090, longitude: -93.2923 },
        { name: "Columbia", latitude: 38.9517, longitude: -92.3341 },
        { name: "Independence", latitude: 39.0911, longitude: -94.4155 },
      ]},
      { name: "Montana", latitude: 46.8797, longitude: -110.3626, cities: [
        { name: "Billings", latitude: 45.7833, longitude: -108.5007 },
        { name: "Missoula", latitude: 46.8721, longitude: -113.9940 },
        { name: "Great Falls", latitude: 47.4941, longitude: -111.2833 },
        { name: "Bozeman", latitude: 45.6770, longitude: -111.0429 },
        { name: "Butte", latitude: 45.9991, longitude: -112.5348 },
      ]},
      { name: "Nebraska", latitude: 41.4925, longitude: -99.9018, cities: [
        { name: "Omaha", latitude: 41.2565, longitude: -95.9345 },
        { name: "Lincoln", latitude: 40.8136, longitude: -96.7026 },
        { name: "Bellevue", latitude: 41.1544, longitude: -95.9146 },
        { name: "Grand Island", latitude: 40.9250, longitude: -98.3420 },
        { name: "Kearney", latitude: 40.6993, longitude: -99.0817 },
      ]},
      { name: "Nevada", latitude: 38.8026, longitude: -116.4194, cities: [
        { name: "Las Vegas", latitude: 36.1699, longitude: -115.1398 },
        { name: "Henderson", latitude: 36.0395, longitude: -114.9817 },
        { name: "Reno", latitude: 39.5296, longitude: -119.8138 },
        { name: "North Las Vegas", latitude: 36.1989, longitude: -115.1175 },
        { name: "Sparks", latitude: 39.5349, longitude: -119.7527 },
      ]},
      { name: "New Hampshire", latitude: 43.1939, longitude: -71.5724, cities: [
        { name: "Manchester", latitude: 42.9956, longitude: -71.4548 },
        { name: "Nashua", latitude: 42.7654, longitude: -71.4676 },
        { name: "Concord", latitude: 43.2081, longitude: -71.5376 },
        { name: "Derry", latitude: 42.8809, longitude: -71.3273 },
        { name: "Dover", latitude: 43.1979, longitude: -70.8737 },
      ]},
      { name: "New Jersey", latitude: 40.0583, longitude: -74.4057, cities: [
        { name: "Newark", latitude: 40.7357, longitude: -74.1724 },
        { name: "Jersey City", latitude: 40.7178, longitude: -74.0431 },
        { name: "Paterson", latitude: 40.9168, longitude: -74.1718 },
        { name: "Elizabeth", latitude: 40.6640, longitude: -74.2107 },
        { name: "Edison", latitude: 40.5187, longitude: -74.4121 },
      ]},
      { name: "New Mexico", latitude: 34.5199, longitude: -105.8701, cities: [
        { name: "Albuquerque", latitude: 35.0844, longitude: -106.6504 },
        { name: "Las Cruces", latitude: 32.3199, longitude: -106.7637 },
        { name: "Rio Rancho", latitude: 35.2334, longitude: -106.6640 },
        { name: "Santa Fe", latitude: 35.6870, longitude: -105.9378 },
        { name: "Roswell", latitude: 33.3943, longitude: -104.5230 },
      ]},
      { name: "New York", latitude: 42.1657, longitude: -74.9481, cities: [
        { name: "New York City", latitude: 40.7128, longitude: -74.0060 },
        { name: "Buffalo", latitude: 42.8864, longitude: -78.8784 },
        { name: "Rochester", latitude: 43.1566, longitude: -77.6088 },
        { name: "Yonkers", latitude: 40.9312, longitude: -73.8988 },
        { name: "Syracuse", latitude: 43.0481, longitude: -76.1474 },
        { name: "Albany", latitude: 42.6526, longitude: -73.7562 },
      ]},
      { name: "North Carolina", latitude: 35.7596, longitude: -79.0193, cities: [
        { name: "Charlotte", latitude: 35.2271, longitude: -80.8431 },
        { name: "Raleigh", latitude: 35.7796, longitude: -78.6382 },
        { name: "Greensboro", latitude: 36.0726, longitude: -79.7920 },
        { name: "Durham", latitude: 35.9940, longitude: -78.8986 },
        { name: "Winston-Salem", latitude: 36.0999, longitude: -80.2442 },
      ]},
      { name: "North Dakota", latitude: 47.5515, longitude: -101.0020, cities: [
        { name: "Fargo", latitude: 46.8772, longitude: -96.7898 },
        { name: "Bismarck", latitude: 46.8083, longitude: -100.7837 },
        { name: "Grand Forks", latitude: 47.9253, longitude: -97.0329 },
        { name: "Minot", latitude: 48.2325, longitude: -101.2963 },
        { name: "West Fargo", latitude: 46.8749, longitude: -96.8998 },
      ]},
      { name: "Ohio", latitude: 40.4173, longitude: -82.9071, cities: [
        { name: "Columbus", latitude: 39.9612, longitude: -82.9988 },
        { name: "Cleveland", latitude: 41.4993, longitude: -81.6944 },
        { name: "Cincinnati", latitude: 39.1031, longitude: -84.5120 },
        { name: "Toledo", latitude: 41.6639, longitude: -83.5552 },
        { name: "Akron", latitude: 41.0814, longitude: -81.5190 },
      ]},
      { name: "Oklahoma", latitude: 35.4676, longitude: -97.5164, cities: [
        { name: "Oklahoma City", latitude: 35.4676, longitude: -97.5164 },
        { name: "Tulsa", latitude: 36.1540, longitude: -95.9928 },
        { name: "Norman", latitude: 35.2226, longitude: -97.4395 },
        { name: "Broken Arrow", latitude: 36.0526, longitude: -95.7908 },
        { name: "Edmond", latitude: 35.6528, longitude: -97.4781 },
      ]},
      { name: "Oregon", latitude: 43.8041, longitude: -120.5542, cities: [
        { name: "Portland", latitude: 45.5051, longitude: -122.6750 },
        { name: "Eugene", latitude: 44.0521, longitude: -123.0868 },
        { name: "Salem", latitude: 44.9429, longitude: -123.0351 },
        { name: "Gresham", latitude: 45.5001, longitude: -122.4302 },
        { name: "Hillsboro", latitude: 45.5229, longitude: -122.9898 },
      ]},
      { name: "Pennsylvania", latitude: 41.2033, longitude: -77.1945, cities: [
        { name: "Philadelphia", latitude: 39.9526, longitude: -75.1652 },
        { name: "Pittsburgh", latitude: 40.4406, longitude: -79.9959 },
        { name: "Allentown", latitude: 40.6084, longitude: -75.4902 },
        { name: "Erie", latitude: 42.1292, longitude: -80.0851 },
        { name: "Reading", latitude: 40.3356, longitude: -75.9269 },
      ]},
      { name: "Rhode Island", latitude: 41.6809, longitude: -71.5118, cities: [
        { name: "Providence", latitude: 41.8240, longitude: -71.4128 },
        { name: "Cranston", latitude: 41.7798, longitude: -71.4373 },
        { name: "Warwick", latitude: 41.7001, longitude: -71.4162 },
        { name: "Pawtucket", latitude: 41.8787, longitude: -71.3826 },
        { name: "East Providence", latitude: 41.8137, longitude: -71.3706 },
      ]},
      { name: "South Carolina", latitude: 33.8361, longitude: -81.1637, cities: [
        { name: "Charleston", latitude: 32.7765, longitude: -79.9311 },
        { name: "Columbia", latitude: 34.0007, longitude: -81.0348 },
        { name: "North Charleston", latitude: 32.8546, longitude: -79.9748 },
        { name: "Mount Pleasant", latitude: 32.8323, longitude: -79.8284 },
        { name: "Rock Hill", latitude: 34.9249, longitude: -81.0251 },
      ]},
      { name: "South Dakota", latitude: 43.9695, longitude: -99.9018, cities: [
        { name: "Sioux Falls", latitude: 43.5473, longitude: -96.7283 },
        { name: "Rapid City", latitude: 44.0805, longitude: -103.2310 },
        { name: "Aberdeen", latitude: 45.4647, longitude: -98.4865 },
        { name: "Brookings", latitude: 44.3114, longitude: -96.7984 },
        { name: "Watertown", latitude: 44.8994, longitude: -97.1209 },
      ]},
      { name: "Tennessee", latitude: 35.5175, longitude: -86.5804, cities: [
        { name: "Nashville", latitude: 36.1627, longitude: -86.7816 },
        { name: "Memphis", latitude: 35.1495, longitude: -90.0490 },
        { name: "Knoxville", latitude: 35.9606, longitude: -83.9207 },
        { name: "Chattanooga", latitude: 35.0456, longitude: -85.3097 },
        { name: "Clarksville", latitude: 36.5298, longitude: -87.3595 },
      ]},
      { name: "Texas", latitude: 31.9686, longitude: -99.9018, cities: [
        { name: "Houston", latitude: 29.7604, longitude: -95.3698 },
        { name: "San Antonio", latitude: 29.4241, longitude: -98.4936 },
        { name: "Dallas", latitude: 32.7767, longitude: -96.7970 },
        { name: "Austin", latitude: 30.2672, longitude: -97.7431 },
        { name: "Fort Worth", latitude: 32.7555, longitude: -97.3308 },
        { name: "El Paso", latitude: 31.7619, longitude: -106.4850 },
      ]},
      { name: "Utah", latitude: 39.3210, longitude: -111.0937, cities: [
        { name: "Salt Lake City", latitude: 40.7608, longitude: -111.8910 },
        { name: "West Valley City", latitude: 40.6916, longitude: -112.0011 },
        { name: "Provo", latitude: 40.2338, longitude: -111.6585 },
        { name: "West Jordan", latitude: 40.6097, longitude: -111.9391 },
        { name: "Orem", latitude: 40.2969, longitude: -111.6946 },
      ]},
      { name: "Vermont", latitude: 44.5588, longitude: -72.5778, cities: [
        { name: "Burlington", latitude: 44.4759, longitude: -73.2121 },
        { name: "Essex", latitude: 44.4912, longitude: -73.1121 },
        { name: "South Burlington", latitude: 44.4670, longitude: -73.1710 },
        { name: "Colchester", latitude: 44.5432, longitude: -73.1540 },
        { name: "Rutland", latitude: 43.6106, longitude: -72.9726 },
      ]},
      { name: "Virginia", latitude: 37.4316, longitude: -78.6569, cities: [
        { name: "Virginia Beach", latitude: 36.8529, longitude: -75.9780 },
        { name: "Norfolk", latitude: 36.8508, longitude: -76.2859 },
        { name: "Chesapeake", latitude: 36.7682, longitude: -76.2875 },
        { name: "Richmond", latitude: 37.5407, longitude: -77.4360 },
        { name: "Arlington", latitude: 38.8816, longitude: -77.0910 },
      ]},
      { name: "Washington", latitude: 47.7511, longitude: -120.7401, cities: [
        { name: "Seattle", latitude: 47.6062, longitude: -122.3321 },
        { name: "Spokane", latitude: 47.6588, longitude: -117.4260 },
        { name: "Tacoma", latitude: 47.2529, longitude: -122.4443 },
        { name: "Vancouver", latitude: 45.6387, longitude: -122.6615 },
        { name: "Bellevue", latitude: 47.6101, longitude: -122.2015 },
      ]},
      { name: "West Virginia", latitude: 38.5976, longitude: -80.4549, cities: [
        { name: "Charleston", latitude: 38.3498, longitude: -81.6326 },
        { name: "Huntington", latitude: 38.4192, longitude: -82.4452 },
        { name: "Morgantown", latitude: 39.6295, longitude: -79.9559 },
        { name: "Parkersburg", latitude: 39.2667, longitude: -81.5615 },
        { name: "Wheeling", latitude: 40.0639, longitude: -80.7209 },
      ]},
      { name: "Wisconsin", latitude: 43.7844, longitude: -88.7879, cities: [
        { name: "Milwaukee", latitude: 43.0389, longitude: -87.9065 },
        { name: "Madison", latitude: 43.0731, longitude: -89.4012 },
        { name: "Green Bay", latitude: 44.5133, longitude: -88.0133 },
        { name: "Kenosha", latitude: 42.5847, longitude: -87.8212 },
        { name: "Racine", latitude: 42.7261, longitude: -87.7829 },
      ]},
      { name: "Wyoming", latitude: 43.0760, longitude: -107.2903, cities: [
        { name: "Cheyenne", latitude: 41.1400, longitude: -104.8202 },
        { name: "Casper", latitude: 42.8501, longitude: -106.3252 },
        { name: "Laramie", latitude: 41.3114, longitude: -105.5911 },
        { name: "Gillette", latitude: 44.2911, longitude: -105.5022 },
        { name: "Rock Springs", latitude: 41.5875, longitude: -109.2029 },
      ]},
    ],
  },
  {
    code: "CA", name: "Canada", flag: "🇨🇦",
    regions: [
      { name: "Alberta", latitude: 53.9333, longitude: -116.5765, cities: [
        { name: "Calgary", latitude: 51.0447, longitude: -114.0719 },
        { name: "Edmonton", latitude: 53.5461, longitude: -113.4938 },
        { name: "Red Deer", latitude: 52.2690, longitude: -113.8116 },
        { name: "Lethbridge", latitude: 49.6956, longitude: -112.8451 },
        { name: "Medicine Hat", latitude: 50.0405, longitude: -110.6764 },
      ]},
      { name: "British Columbia", latitude: 53.7267, longitude: -127.6476, cities: [
        { name: "Vancouver", latitude: 49.2827, longitude: -123.1207 },
        { name: "Victoria", latitude: 48.4284, longitude: -123.3656 },
        { name: "Kelowna", latitude: 49.8880, longitude: -119.4960 },
        { name: "Abbotsford", latitude: 49.0504, longitude: -122.3045 },
        { name: "Burnaby", latitude: 49.2488, longitude: -122.9805 },
      ]},
      { name: "Manitoba", latitude: 53.7609, longitude: -98.8139, cities: [
        { name: "Winnipeg", latitude: 49.8951, longitude: -97.1384 },
        { name: "Brandon", latitude: 49.8437, longitude: -99.9529 },
        { name: "Steinbach", latitude: 49.5258, longitude: -96.6843 },
        { name: "Thompson", latitude: 55.7435, longitude: -97.8553 },
        { name: "Portage la Prairie", latitude: 49.9728, longitude: -98.2921 },
      ]},
      { name: "New Brunswick", latitude: 46.5653, longitude: -66.4619, cities: [
        { name: "Moncton", latitude: 46.0878, longitude: -64.7782 },
        { name: "Saint John", latitude: 45.2733, longitude: -66.0633 },
        { name: "Fredericton", latitude: 45.9636, longitude: -66.6431 },
        { name: "Miramichi", latitude: 47.0028, longitude: -65.4994 },
        { name: "Bathurst", latitude: 47.6199, longitude: -65.6515 },
      ]},
      { name: "Newfoundland and Labrador", latitude: 53.1355, longitude: -57.6604, cities: [
        { name: "St. John's", latitude: 47.5615, longitude: -52.7126 },
        { name: "Corner Brook", latitude: 48.9500, longitude: -57.9500 },
        { name: "Gander", latitude: 48.9540, longitude: -54.6081 },
        { name: "Grand Falls-Windsor", latitude: 48.9335, longitude: -55.6647 },
        { name: "Mount Pearl", latitude: 47.5138, longitude: -52.8058 },
      ]},
      { name: "Nova Scotia", latitude: 44.6820, longitude: -63.7443, cities: [
        { name: "Halifax", latitude: 44.6488, longitude: -63.5752 },
        { name: "Dartmouth", latitude: 44.6667, longitude: -63.5667 },
        { name: "Sydney", latitude: 46.1368, longitude: -60.1942 },
        { name: "Truro", latitude: 45.3647, longitude: -63.2825 },
        { name: "New Glasgow", latitude: 45.5833, longitude: -62.6500 },
      ]},
      { name: "Ontario", latitude: 51.2538, longitude: -85.3232, cities: [
        { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
        { name: "Ottawa", latitude: 45.4215, longitude: -75.6972 },
        { name: "Mississauga", latitude: 43.5890, longitude: -79.6441 },
        { name: "Brampton", latitude: 43.7315, longitude: -79.7624 },
        { name: "Hamilton", latitude: 43.2557, longitude: -79.8711 },
        { name: "London", latitude: 42.9849, longitude: -81.2453 },
      ]},
      { name: "Prince Edward Island", latitude: 46.5107, longitude: -63.4168, cities: [
        { name: "Charlottetown", latitude: 46.2382, longitude: -63.1311 },
        { name: "Summerside", latitude: 46.3962, longitude: -63.7898 },
        { name: "Stratford", latitude: 46.2186, longitude: -63.0832 },
        { name: "Cornwall", latitude: 46.2311, longitude: -63.2084 },
        { name: "Montague", latitude: 46.1670, longitude: -62.6432 },
      ]},
      { name: "Quebec", latitude: 52.9399, longitude: -73.5491, cities: [
        { name: "Montreal", latitude: 45.5017, longitude: -73.5673 },
        { name: "Quebec City", latitude: 46.8139, longitude: -71.2080 },
        { name: "Laval", latitude: 45.5833, longitude: -73.7500 },
        { name: "Gatineau", latitude: 45.4765, longitude: -75.7013 },
        { name: "Longueuil", latitude: 45.5313, longitude: -73.5185 },
      ]},
      { name: "Saskatchewan", latitude: 52.9399, longitude: -106.4509, cities: [
        { name: "Saskatoon", latitude: 52.1332, longitude: -106.6700 },
        { name: "Regina", latitude: 50.4452, longitude: -104.6189 },
        { name: "Prince Albert", latitude: 53.2033, longitude: -105.7531 },
        { name: "Moose Jaw", latitude: 50.3930, longitude: -105.5350 },
        { name: "Swift Current", latitude: 50.2881, longitude: -107.7939 },
      ]},
      { name: "Northwest Territories", latitude: 64.8255, longitude: -124.8457, cities: [
        { name: "Yellowknife", latitude: 62.4540, longitude: -114.3718 },
        { name: "Hay River", latitude: 60.8156, longitude: -115.7997 },
        { name: "Inuvik", latitude: 68.3607, longitude: -133.7230 },
        { name: "Fort Smith", latitude: 60.0005, longitude: -111.8879 },
        { name: "Behchokò", latitude: 62.7933, longitude: -116.0316 },
      ]},
      { name: "Nunavut", latitude: 70.2998, longitude: -83.1076, cities: [
        { name: "Iqaluit", latitude: 63.7467, longitude: -68.5170 },
        { name: "Rankin Inlet", latitude: 62.8082, longitude: -92.0853 },
        { name: "Arviat", latitude: 61.1065, longitude: -94.0693 },
        { name: "Baker Lake", latitude: 64.3183, longitude: -96.0221 },
        { name: "Cambridge Bay", latitude: 69.1169, longitude: -105.0530 },
      ]},
      { name: "Yukon", latitude: 64.2823, longitude: -135.0000, cities: [
        { name: "Whitehorse", latitude: 60.7212, longitude: -135.0568 },
        { name: "Dawson City", latitude: 64.0599, longitude: -139.4322 },
        { name: "Watson Lake", latitude: 60.0634, longitude: -128.7065 },
        { name: "Haines Junction", latitude: 60.7534, longitude: -137.5119 },
        { name: "Faro", latitude: 62.2333, longitude: -133.3500 },
      ]},
    ],
  },
  {
    code: "BR", name: "Brasil", flag: "🇧🇷",
    regions: [
      { name: "São Paulo", latitude: -23.5505, longitude: -46.6333 },
      { name: "Rio de Janeiro", latitude: -22.9068, longitude: -43.1729 },
      { name: "Minas Gerais", latitude: -18.5122, longitude: -44.5550 },
      { name: "Bahia", latitude: -12.5797, longitude: -41.7007 },
      { name: "Paraná", latitude: -25.2521, longitude: -52.0215 },
      { name: "Rio Grande do Sul", latitude: -30.0346, longitude: -51.2177 },
      { name: "Pernambuco", latitude: -8.8137, longitude: -36.9541 },
      { name: "Ceará", latitude: -5.4984, longitude: -39.3206 },
      { name: "Pará", latitude: -3.4168, longitude: -52.0000 },
      { name: "Santa Catarina", latitude: -27.2423, longitude: -50.2189 },
      { name: "Goiás", latitude: -15.8270, longitude: -49.8362 },
      { name: "Amazonas", latitude: -3.4168, longitude: -65.8561 },
      { name: "Maranhão", latitude: -4.9609, longitude: -45.2744 },
      { name: "Espírito Santo", latitude: -19.1834, longitude: -40.3089 },
      { name: "Mato Grosso", latitude: -12.6819, longitude: -56.9211 },
      { name: "Brasília (DF)", latitude: -15.7801, longitude: -47.9292 },
    ],
  },
  {
    code: "AR", name: "Argentina", flag: "🇦🇷",
    regions: [
      { name: "Buenos Aires", latitude: -34.6037, longitude: -58.3816 },
      { name: "Córdoba", latitude: -31.4201, longitude: -64.1888 },
      { name: "Rosario (Santa Fe)", latitude: -32.9468, longitude: -60.6393 },
      { name: "Mendoza", latitude: -32.8908, longitude: -68.8272 },
      { name: "Tucumán", latitude: -26.8083, longitude: -65.2176 },
      { name: "Salta", latitude: -24.7859, longitude: -65.4117 },
      { name: "Jujuy", latitude: -24.1858, longitude: -65.2995 },
      { name: "Neuquén", latitude: -38.9516, longitude: -68.0591 },
      { name: "Chubut", latitude: -43.2930, longitude: -65.1023 },
      { name: "Santa Cruz", latitude: -51.6230, longitude: -69.2168 },
      { name: "Tierra del Fuego", latitude: -54.8019, longitude: -68.3030 },
      { name: "Patagonia", latitude: -45.0000, longitude: -70.0000 },
    ],
  },
  {
    code: "CL", name: "Chile", flag: "🇨🇱",
    regions: [
      { name: "Santiago", latitude: -33.4569, longitude: -70.6483 },
      { name: "Valparaíso", latitude: -33.0472, longitude: -71.6127 },
      { name: "Bío-Bío", latitude: -37.0000, longitude: -72.0000 },
      { name: "Araucanía", latitude: -38.9489, longitude: -72.3311 },
      { name: "Los Lagos", latitude: -41.9500, longitude: -72.4500 },
      { name: "Antofagasta", latitude: -23.6509, longitude: -70.3954 },
      { name: "Coquimbo", latitude: -29.9533, longitude: -71.3395 },
      { name: "Atacama", latitude: -27.3668, longitude: -70.3323 },
      { name: "Arica y Parinacota", latitude: -18.4746, longitude: -70.2979 },
      { name: "Magallanes", latitude: -53.1638, longitude: -70.9171 },
    ],
  },
  {
    code: "CO", name: "Colombia", flag: "🇨🇴",
    regions: [
      { name: "Bogotá", latitude: 4.7110, longitude: -74.0721 },
      { name: "Medellín (Antioquia)", latitude: 6.2442, longitude: -75.5812 },
      { name: "Cali (Valle del Cauca)", latitude: 3.4516, longitude: -76.5320 },
      { name: "Barranquilla (Atlántico)", latitude: 10.9685, longitude: -74.7813 },
      { name: "Cartagena (Bolívar)", latitude: 10.3910, longitude: -75.4794 },
      { name: "Santander", latitude: 6.6437, longitude: -73.6536 },
      { name: "Cundinamarca", latitude: 5.0263, longitude: -74.0301 },
      { name: "Nariño", latitude: 1.2892, longitude: -77.3579 },
      { name: "Meta", latitude: 3.9928, longitude: -73.5836 },
      { name: "Amazonas", latitude: -1.4429, longitude: -71.5724 },
    ],
  },
  {
    code: "PE", name: "Perú", flag: "🇵🇪",
    regions: [
      { name: "Lima", latitude: -12.0464, longitude: -77.0428 },
      { name: "Arequipa", latitude: -16.4090, longitude: -71.5375 },
      { name: "Cusco", latitude: -13.5319, longitude: -71.9675 },
      { name: "La Libertad", latitude: -8.1120, longitude: -79.0288 },
      { name: "Piura", latitude: -5.1945, longitude: -80.6328 },
      { name: "Puno", latitude: -15.8402, longitude: -70.0219 },
      { name: "Junín", latitude: -11.9175, longitude: -75.2536 },
      { name: "Loreto", latitude: -4.8601, longitude: -74.7441 },
      { name: "Áncash", latitude: -9.5343, longitude: -77.5639 },
      { name: "Ica", latitude: -14.0677, longitude: -75.7286 },
    ],
  },
  {
    code: "VE", name: "Venezuela", flag: "🇻🇪",
    regions: [
      { name: "Caracas (Dtto. Capital)", latitude: 10.4806, longitude: -66.9036 },
      { name: "Maracaibo (Zulia)", latitude: 10.6544, longitude: -71.6118 },
      { name: "Valencia (Carabobo)", latitude: 10.1801, longitude: -67.9965 },
      { name: "Barquisimeto (Lara)", latitude: 10.0640, longitude: -69.3571 },
      { name: "Maturín (Monagas)", latitude: 9.7453, longitude: -63.1891 },
      { name: "Ciudad Guayana (Bolívar)", latitude: 8.3520, longitude: -62.6430 },
      { name: "Mérida", latitude: 8.5933, longitude: -71.1440 },
      { name: "Táchira", latitude: 7.9133, longitude: -72.1833 },
      { name: "Anzoátegui", latitude: 9.3302, longitude: -64.9926 },
      { name: "Miranda", latitude: 10.2035, longitude: -66.4290 },
    ],
  },
  {
    code: "UY", name: "Uruguay", flag: "🇺🇾",
    regions: [
      { name: "Montevideo", latitude: -34.9011, longitude: -56.1645 },
      { name: "Canelones", latitude: -34.5226, longitude: -56.2839 },
      { name: "Maldonado", latitude: -34.9011, longitude: -54.9595 },
      { name: "Salto", latitude: -31.3833, longitude: -57.9667 },
      { name: "Paysandú", latitude: -32.3167, longitude: -58.0833 },
      { name: "Rivera", latitude: -30.9058, longitude: -55.5508 },
      { name: "Colonia", latitude: -34.4626, longitude: -57.8400 },
    ],
  },
  {
    code: "PY", name: "Paraguay", flag: "🇵🇾",
    regions: [
      { name: "Asunción", latitude: -25.2867, longitude: -57.6470 },
      { name: "Central", latitude: -25.5000, longitude: -57.5500 },
      { name: "Alto Paraná", latitude: -25.5098, longitude: -54.6222 },
      { name: "Itapúa", latitude: -26.8667, longitude: -55.6667 },
      { name: "Canindeyú", latitude: -24.1397, longitude: -55.6608 },
      { name: "Amambay", latitude: -22.5524, longitude: -55.7335 },
      { name: "Concepción", latitude: -23.4107, longitude: -57.4348 },
    ],
  },
  {
    code: "BO", name: "Bolivia", flag: "🇧🇴",
    regions: [
      { name: "La Paz", latitude: -16.5000, longitude: -68.1500 },
      { name: "Santa Cruz", latitude: -17.7833, longitude: -63.1833 },
      { name: "Cochabamba", latitude: -17.3895, longitude: -66.1568 },
      { name: "Oruro", latitude: -17.9833, longitude: -67.1167 },
      { name: "Potosí", latitude: -19.5836, longitude: -65.7531 },
      { name: "Sucre (Chuquisaca)", latitude: -19.0432, longitude: -65.2596 },
      { name: "Beni", latitude: -14.8333, longitude: -64.9000 },
      { name: "Tarija", latitude: -21.5355, longitude: -64.7296 },
      { name: "Pando", latitude: -11.0275, longitude: -68.7665 },
    ],
  },
  {
    code: "EC", name: "Ecuador", flag: "🇪🇨",
    regions: [
      { name: "Quito (Pichincha)", latitude: -0.1807, longitude: -78.4678 },
      { name: "Guayaquil (Guayas)", latitude: -2.1709, longitude: -79.9224 },
      { name: "Cuenca (Azuay)", latitude: -2.9001, longitude: -79.0059 },
      { name: "Manabí", latitude: -1.0543, longitude: -80.4548 },
      { name: "El Oro", latitude: -3.2581, longitude: -79.9553 },
      { name: "Esmeraldas", latitude: 0.9592, longitude: -79.6545 },
      { name: "Galápagos", latitude: -0.9538, longitude: -90.9656 },
      { name: "Imbabura", latitude: 0.3500, longitude: -78.1167 },
      { name: "Loja", latitude: -3.9931, longitude: -79.2042 },
      { name: "Tungurahua", latitude: -1.2543, longitude: -78.6237 },
    ],
  },
  {
    code: "GY", name: "Guyana", flag: "🇬🇾",
    regions: [
      { name: "Georgetown", latitude: 6.8013, longitude: -58.1551 },
      { name: "Linden", latitude: 5.9998, longitude: -58.2930 },
      { name: "New Amsterdam", latitude: 6.2477, longitude: -57.5170 },
      { name: "Berbice", latitude: 6.3667, longitude: -57.5167 },
      { name: "Essequibo", latitude: 6.5833, longitude: -58.4667 },
    ],
  },
  {
    code: "SR", name: "Suriname", flag: "🇸🇷",
    regions: [
      { name: "Paramaribo", latitude: 5.8520, longitude: -55.2038 },
      { name: "Wanica", latitude: 5.7500, longitude: -55.2500 },
      { name: "Nickerie", latitude: 5.9334, longitude: -56.9833 },
      { name: "Marowijne", latitude: 5.4500, longitude: -54.2167 },
      { name: "Sipaliwini", latitude: 3.6666, longitude: -56.0000 },
    ],
  },
  {
    code: "GY", name: "Guyana", flag: "🇬🇾",
    regions: [
      { name: "Demerara-Mahaica", latitude: 6.8013, longitude: -58.1551 },
      { name: "Essequibo Coast-West Demerara", latitude: 6.5833, longitude: -58.4500 },
      { name: "Berbice", latitude: 5.8921, longitude: -57.6667 },
      { name: "Barima-Waini", latitude: 7.4500, longitude: -59.7667 },
      { name: "Upper Takutu-Upper Essequibo", latitude: 2.8000, longitude: -59.2000 },
    ],
  },
  {
    code: "SR", name: "Suriname", flag: "🇸🇷",
    regions: [
      { name: "Paramaribo", latitude: 5.8520, longitude: -55.2038 },
      { name: "Wanica", latitude: 5.7333, longitude: -55.2500 },
      { name: "Nickerie", latitude: 5.9333, longitude: -56.9833 },
      { name: "Commewijne", latitude: 5.8667, longitude: -54.9167 },
      { name: "Marowijne", latitude: 5.6167, longitude: -54.0500 },
      { name: "Brokopondo", latitude: 4.7667, longitude: -55.0167 },
    ],
  },
  {
    code: "GF", name: "Guyane (FR)", flag: "🇬🇫",
    regions: [
      { name: "Cayenne", latitude: 4.9224, longitude: -52.3135 },
      { name: "Saint-Laurent-du-Maroni", latitude: 5.4977, longitude: -54.0336 },
      { name: "Kourou", latitude: 5.1610, longitude: -52.6479 },
      { name: "Matoury", latitude: 4.8565, longitude: -52.3253 },
    ],
  },
  {
    code: "MX", name: "México", flag: "🇲🇽",
    regions: [
      { name: "Baja California", latitude: 30.8406, longitude: -115.2838 },
      { name: "Chiapas", latitude: 16.7569, longitude: -93.1292 },
      { name: "Chihuahua", latitude: 28.6353, longitude: -106.0889 },
      { name: "Ciudad de México", latitude: 19.4326, longitude: -99.1332 },
      { name: "Coahuila", latitude: 27.2587, longitude: -102.0686 },
      { name: "Guanajuato", latitude: 21.0190, longitude: -101.2574 },
      { name: "Guerrero", latitude: 17.4392, longitude: -100.0000 },
      { name: "Jalisco", latitude: 20.6595, longitude: -103.3494 },
      { name: "Michoacán", latitude: 19.5665, longitude: -101.7068 },
      { name: "Nuevo León", latitude: 25.5922, longitude: -99.9962 },
      { name: "Oaxaca", latitude: 17.0732, longitude: -96.7266 },
      { name: "Puebla", latitude: 19.0414, longitude: -98.2063 },
      { name: "Quintana Roo", latitude: 19.1817, longitude: -88.4791 },
      { name: "Sinaloa", latitude: 25.1721, longitude: -107.4795 },
      { name: "Sonora", latitude: 29.2972, longitude: -110.3309 },
      { name: "Tamaulipas", latitude: 24.2669, longitude: -98.8363 },
      { name: "Veracruz", latitude: 19.1738, longitude: -96.1342 },
      { name: "Yucatán", latitude: 20.7099, longitude: -89.0943 },
    ],
  },
  {
    code: "MA", name: "Marocco", flag: "🇲🇦",
    regions: [
      { name: "Rabat-Salé-Kénitra", latitude: 34.0133, longitude: -6.8326 },
      { name: "Casablanca-Settat", latitude: 33.5731, longitude: -7.5898 },
      { name: "Marrakech-Safi", latitude: 31.6295, longitude: -7.9811 },
      { name: "Fès-Meknès", latitude: 33.9716, longitude: -5.0078 },
      { name: "Tanger-Tétouan-Al Hoceïma", latitude: 35.7595, longitude: -5.8340 },
      { name: "Souss-Massa", latitude: 30.4278, longitude: -9.5981 },
      { name: "Oriental", latitude: 34.6814, longitude: -1.9086 },
      { name: "Draâ-Tafilalet", latitude: 31.0678, longitude: -4.3478 },
      { name: "Béni Mellal-Khénifra", latitude: 32.3373, longitude: -6.3498 },
      { name: "Laâyoune-Sakia El Hamra", latitude: 27.1418, longitude: -13.1625 },
    ],
  },
  {
    code: "DZ", name: "Algeria", flag: "🇩🇿",
    regions: [
      { name: "Alger", latitude: 36.7372, longitude: 3.0865 },
      { name: "Oran", latitude: 35.6969, longitude: -0.6331 },
      { name: "Constantine", latitude: 36.3650, longitude: 6.6147 },
      { name: "Annaba", latitude: 36.9000, longitude: 7.7667 },
      { name: "Blida", latitude: 36.4700, longitude: 2.8300 },
      { name: "Sétif", latitude: 36.1898, longitude: 5.4108 },
      { name: "Tlemcen", latitude: 34.8786, longitude: -1.3154 },
      { name: "Béjaïa", latitude: 36.7515, longitude: 5.0564 },
      { name: "Ghardaïa", latitude: 32.4847, longitude: 3.6736 },
      { name: "Tamanrasset", latitude: 22.7850, longitude: 5.5228 },
    ],
  },
  {
    code: "TN", name: "Tunisia", flag: "🇹🇳",
    regions: [
      { name: "Tunis", latitude: 36.8190, longitude: 10.1658 },
      { name: "Sfax", latitude: 34.7406, longitude: 10.7603 },
      { name: "Sousse", latitude: 35.8245, longitude: 10.6346 },
      { name: "Kairouan", latitude: 35.6781, longitude: 10.0964 },
      { name: "Bizerte", latitude: 37.2744, longitude: 9.8739 },
      { name: "Gabès", latitude: 33.8814, longitude: 10.0982 },
      { name: "Nabeul", latitude: 36.4513, longitude: 10.7357 },
      { name: "Monastir", latitude: 35.7643, longitude: 10.8113 },
      { name: "Djerba (Médenine)", latitude: 33.8076, longitude: 10.8451 },
    ],
  },
  {
    code: "LY", name: "Libya", flag: "🇱🇾",
    regions: [
      { name: "Tripoli", latitude: 32.8752, longitude: 13.1875 },
      { name: "Benghazi", latitude: 32.1154, longitude: 20.0682 },
      { name: "Misrata", latitude: 32.3754, longitude: 15.0925 },
      { name: "Tobruk", latitude: 32.0765, longitude: 23.9720 },
      { name: "Sebha", latitude: 27.0377, longitude: 14.4283 },
      { name: "Zintan", latitude: 31.9341, longitude: 12.2504 },
      { name: "Al-Khums", latitude: 32.6499, longitude: 14.2615 },
    ],
  },
  {
    code: "EG", name: "Egitto", flag: "🇪🇬",
    regions: [
      { name: "Cairo", latitude: 30.0444, longitude: 31.2357 },
      { name: "Alexandria", latitude: 31.2001, longitude: 29.9187 },
      { name: "Giza", latitude: 30.0131, longitude: 31.2089 },
      { name: "Sharm El-Sheikh", latitude: 27.9158, longitude: 34.3300 },
      { name: "Hurghada", latitude: 27.2579, longitude: 33.8116 },
      { name: "Luxor", latitude: 25.6872, longitude: 32.6396 },
      { name: "Aswan", latitude: 24.0889, longitude: 32.8998 },
      { name: "Suez", latitude: 29.9668, longitude: 32.5498 },
      { name: "Port Said", latitude: 31.2565, longitude: 32.2841 },
      { name: "Ismailia", latitude: 30.5965, longitude: 32.2715 },
      { name: "Sinai", latitude: 29.5000, longitude: 34.0000 },
    ],
  },
  {
    code: "AO", name: "Angola", flag: "🇦🇴",
    regions: [
      { name: "Luanda", latitude: -8.8368, longitude: 13.2343 },
      { name: "Huambo", latitude: -12.7761, longitude: 15.7394 },
      { name: "Lubango", latitude: -14.9177, longitude: 13.4927 },
      { name: "Benguela", latitude: -12.5763, longitude: 13.4055 },
      { name: "Cabinda", latitude: -5.5500, longitude: 12.2000 },
    ],
  },
  {
    code: "BF", name: "Burkina Faso", flag: "🇧🇫",
    regions: [
      { name: "Ouagadougou", latitude: 12.3647, longitude: -1.5333 },
      { name: "Bobo-Dioulasso", latitude: 11.1771, longitude: -4.2979 },
      { name: "Koudougou", latitude: 12.2500, longitude: -2.3667 },
      { name: "Banfora", latitude: 10.6333, longitude: -4.7667 },
      { name: "Ouahigouya", latitude: 13.5833, longitude: -2.4333 },
    ],
  },
  {
    code: "BI", name: "Burundi", flag: "🇧🇮",
    regions: [
      { name: "Bujumbura", latitude: -3.3822, longitude: 29.3644 },
      { name: "Gitega", latitude: -3.4271, longitude: 29.9249 },
      { name: "Muyinga", latitude: -2.8452, longitude: 30.3376 },
      { name: "Ngozi", latitude: -2.9076, longitude: 29.8301 },
      { name: "Rumonge", latitude: -3.9747, longitude: 29.4387 },
    ],
  },
  {
    code: "BJ", name: "Bénin", flag: "🇧🇯",
    regions: [
      { name: "Cotonou", latitude: 6.3654, longitude: 2.4183 },
      { name: "Porto-Novo", latitude: 6.4966, longitude: 2.6289 },
      { name: "Parakou", latitude: 9.3373, longitude: 2.6278 },
      { name: "Abomey", latitude: 7.1836, longitude: 1.9886 },
      { name: "Natitingou", latitude: 10.3167, longitude: 1.3833 },
    ],
  },
  {
    code: "BW", name: "Botswana", flag: "🇧🇼",
    regions: [
      { name: "Gaborone", latitude: -24.6282, longitude: 25.9231 },
      { name: "Francistown", latitude: -21.1664, longitude: 27.5078 },
      { name: "Molepolole", latitude: -24.4065, longitude: 25.4957 },
      { name: "Maun", latitude: -19.9833, longitude: 23.4167 },
      { name: "Serowe", latitude: -22.3914, longitude: 26.7119 },
    ],
  },
  {
    code: "CD", name: "DR Congo", flag: "🇨🇩",
    regions: [
      { name: "Kinshasa", latitude: -4.3217, longitude: 15.3222 },
      { name: "Lubumbashi", latitude: -11.6609, longitude: 27.4794 },
      { name: "Mbuji-Mayi", latitude: -6.1500, longitude: 23.6000 },
      { name: "Kisangani", latitude: 0.5154, longitude: 25.1988 },
      { name: "Bukavu", latitude: -2.5085, longitude: 28.8612 },
      { name: "Goma", latitude: -1.6777, longitude: 29.2285 },
    ],
  },
  {
    code: "CF", name: "Centrafrique", flag: "🇨🇫",
    regions: [
      { name: "Bangui", latitude: 4.3612, longitude: 18.5550 },
      { name: "Bimbo", latitude: 4.2565, longitude: 18.4148 },
      { name: "Berbérati", latitude: 4.2614, longitude: 15.7883 },
      { name: "Bambari", latitude: 5.7656, longitude: 20.6703 },
      { name: "Bouar", latitude: 5.9333, longitude: 15.5667 },
    ],
  },
  {
    code: "CG", name: "Congo", flag: "🇨🇬",
    regions: [
      { name: "Brazzaville", latitude: -4.2694, longitude: 15.2712 },
      { name: "Pointe-Noire", latitude: -4.7692, longitude: 11.8660 },
      { name: "Dolisie", latitude: -4.1980, longitude: 12.6667 },
      { name: "Nkayi", latitude: -4.1667, longitude: 13.2833 },
      { name: "Impfondo", latitude: 1.6167, longitude: 18.0667 },
    ],
  },
  {
    code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮",
    regions: [
      { name: "Abidjan", latitude: 5.3600, longitude: -4.0083 },
      { name: "Yamoussoukro", latitude: 6.8276, longitude: -5.2893 },
      { name: "Bouaké", latitude: 7.6900, longitude: -5.0302 },
      { name: "Daloa", latitude: 6.8771, longitude: -6.4501 },
      { name: "Korhogo", latitude: 9.4582, longitude: -5.6290 },
    ],
  },
  {
    code: "CM", name: "Cameroun", flag: "🇨🇲",
    regions: [
      { name: "Yaoundé", latitude: 3.8480, longitude: 11.5021 },
      { name: "Douala", latitude: 4.0483, longitude: 9.7043 },
      { name: "Garoua", latitude: 9.3017, longitude: 13.3968 },
      { name: "Bamenda", latitude: 5.9527, longitude: 10.1466 },
      { name: "Bafoussam", latitude: 5.4737, longitude: 10.4179 },
    ],
  },
  {
    code: "CV", name: "Cabo Verde", flag: "🇨🇻",
    regions: [
      { name: "Praia", latitude: 14.9330, longitude: -23.5133 },
      { name: "Mindelo", latitude: 16.8918, longitude: -24.9800 },
      { name: "Santa Maria", latitude: 16.5986, longitude: -22.9003 },
      { name: "Assomada", latitude: 15.0956, longitude: -23.6713 },
      { name: "Sal Rei", latitude: 16.1769, longitude: -22.9167 },
    ],
  },
  {
    code: "DJ", name: "Djibouti", flag: "🇩🇯",
    regions: [
      { name: "Djibouti Ville", latitude: 11.5886, longitude: 43.1451 },
      { name: "Arta", latitude: 11.5252, longitude: 42.8440 },
      { name: "Ali Sabieh", latitude: 11.1574, longitude: 42.7138 },
      { name: "Dikhil", latitude: 11.1053, longitude: 42.3697 },
      { name: "Tadjoura", latitude: 11.7840, longitude: 42.8832 },
    ],
  },
  {
    code: "ER", name: "Eritrea", flag: "🇪🇷",
    regions: [
      { name: "Asmara", latitude: 15.3394, longitude: 38.9318 },
      { name: "Keren", latitude: 15.7765, longitude: 38.4537 },
      { name: "Massawa", latitude: 15.6092, longitude: 39.4675 },
      { name: "Assab", latitude: 13.0009, longitude: 42.7344 },
      { name: "Mendefera", latitude: 14.8833, longitude: 38.8167 },
    ],
  },
  {
    code: "ET", name: "Ethiopia", flag: "🇪🇹",
    regions: [
      { name: "Addis Ababa", latitude: 9.0054, longitude: 38.7636 },
      { name: "Dire Dawa", latitude: 9.5931, longitude: 41.8661 },
      { name: "Mekelle", latitude: 13.4967, longitude: 39.4753 },
      { name: "Gondar", latitude: 12.6080, longitude: 37.4682 },
      { name: "Bahir Dar", latitude: 11.5742, longitude: 37.3614 },
      { name: "Hawassa", latitude: 7.0600, longitude: 38.4800 },
    ],
  },
  {
    code: "GA", name: "Gabon", flag: "🇬🇦",
    regions: [
      { name: "Libreville", latitude: 0.3901, longitude: 9.4544 },
      { name: "Port-Gentil", latitude: -0.7193, longitude: 8.7815 },
      { name: "Franceville", latitude: -1.6333, longitude: 13.5833 },
      { name: "Oyem", latitude: 1.5994, longitude: 11.5786 },
      { name: "Moanda", latitude: -1.5667, longitude: 13.2000 },
    ],
  },
  {
    code: "GH", name: "Ghana", flag: "🇬🇭",
    regions: [
      { name: "Accra", latitude: 5.6037, longitude: -0.1870 },
      { name: "Kumasi", latitude: 6.6885, longitude: -1.6244 },
      { name: "Tamale", latitude: 9.4008, longitude: -0.8393 },
      { name: "Sekondi-Takoradi", latitude: 4.9016, longitude: -1.7556 },
      { name: "Sunyani", latitude: 7.3349, longitude: -2.3295 },
    ],
  },
  {
    code: "GM", name: "Gambia", flag: "🇬🇲",
    regions: [
      { name: "Banjul", latitude: 13.4531, longitude: -16.5775 },
      { name: "Serekunda", latitude: 13.4383, longitude: -16.6785 },
      { name: "Brikama", latitude: 13.2714, longitude: -16.6485 },
      { name: "Farafenni", latitude: 13.5676, longitude: -15.5985 },
      { name: "Janjanbureh", latitude: 13.5424, longitude: -14.7704 },
    ],
  },
  {
    code: "GN", name: "Guinée", flag: "🇬🇳",
    regions: [
      { name: "Conakry", latitude: 9.5370, longitude: -13.6773 },
      { name: "N'Zérékoré", latitude: 7.7564, longitude: -8.8179 },
      { name: "Kankan", latitude: 10.3852, longitude: -9.3058 },
      { name: "Kindia", latitude: 10.0667, longitude: -12.8667 },
      { name: "Labé", latitude: 11.3167, longitude: -12.2833 },
    ],
  },
  {
    code: "GQ", name: "Guinea Ecuatorial", flag: "🇬🇶",
    regions: [
      { name: "Malabo", latitude: 3.7500, longitude: 8.7833 },
      { name: "Bata", latitude: 1.8650, longitude: 9.7700 },
      { name: "Ebebiyín", latitude: 2.1500, longitude: 11.3333 },
      { name: "Aconibe", latitude: 1.3000, longitude: 10.9333 },
      { name: "Mongomo", latitude: 1.6333, longitude: 13.6167 },
    ],
  },
  {
    code: "GW", name: "Guinée-Bissau", flag: "🇬🇼",
    regions: [
      { name: "Bissau", latitude: 11.8636, longitude: -15.5977 },
      { name: "Bafatá", latitude: 12.1703, longitude: -14.6550 },
      { name: "Gabú", latitude: 12.2800, longitude: -14.2167 },
      { name: "Bissorã", latitude: 12.2167, longitude: -15.5000 },
      { name: "Bolama", latitude: 11.5745, longitude: -15.4759 },
    ],
  },
  {
    code: "KE", name: "Kenya", flag: "🇰🇪",
    regions: [
      { name: "Nairobi", latitude: -1.2921, longitude: 36.8219 },
      { name: "Mombasa", latitude: -4.0435, longitude: 39.6682 },
      { name: "Kisumu", latitude: -0.1022, longitude: 34.7617 },
      { name: "Nakuru", latitude: -0.3031, longitude: 36.0800 },
      { name: "Eldoret", latitude: 0.5143, longitude: 35.2698 },
      { name: "Turkana", latitude: 3.1192, longitude: 35.5956 },
    ],
  },
  {
    code: "KM", name: "Comores", flag: "🇰🇲",
    regions: [
      { name: "Moroni", latitude: -11.7004, longitude: 43.2551 },
      { name: "Mutsamudu", latitude: -12.1693, longitude: 44.4018 },
      { name: "Fomboni", latitude: -12.2941, longitude: 43.7406 },
      { name: "Domoni", latitude: -12.2500, longitude: 44.5333 },
    ],
  },
  {
    code: "LR", name: "Liberia", flag: "🇱🇷",
    regions: [
      { name: "Monrovia", latitude: 6.3005, longitude: -10.7969 },
      { name: "Gbarnga", latitude: 6.9982, longitude: -9.4720 },
      { name: "Kakata", latitude: 6.5263, longitude: -10.3509 },
      { name: "Bensonville", latitude: 6.4460, longitude: -10.6068 },
      { name: "Harper", latitude: 4.3750, longitude: -7.7167 },
    ],
  },
  {
    code: "LS", name: "Lesotho", flag: "🇱🇸",
    regions: [
      { name: "Maseru", latitude: -29.3167, longitude: 27.4833 },
      { name: "Teyateyaneng", latitude: -29.1500, longitude: 27.7333 },
      { name: "Mafeteng", latitude: -29.8167, longitude: 27.2333 },
      { name: "Hlotse", latitude: -28.8833, longitude: 28.0500 },
      { name: "Mohale's Hoek", latitude: -30.1500, longitude: 27.4667 },
    ],
  },
  {
    code: "MG", name: "Madagascar", flag: "🇲🇬",
    regions: [
      { name: "Antananarivo", latitude: -18.9137, longitude: 47.5361 },
      { name: "Toamasina", latitude: -18.1443, longitude: 49.3956 },
      { name: "Antsirabe", latitude: -19.8659, longitude: 47.0339 },
      { name: "Fianarantsoa", latitude: -21.4531, longitude: 47.0866 },
      { name: "Mahajanga", latitude: -15.7167, longitude: 46.3167 },
      { name: "Toliara", latitude: -23.3568, longitude: 43.6714 },
    ],
  },
  {
    code: "ML", name: "Mali", flag: "🇲🇱",
    regions: [
      { name: "Bamako", latitude: 12.6392, longitude: -8.0029 },
      { name: "Sikasso", latitude: 11.3167, longitude: -5.6667 },
      { name: "Mopti", latitude: 14.4833, longitude: -4.2000 },
      { name: "Ségou", latitude: 13.4500, longitude: -6.2667 },
      { name: "Timbuktu", latitude: 16.7667, longitude: -3.0026 },
    ],
  },
  {
    code: "MR", name: "Mauritanie", flag: "🇲🇷",
    regions: [
      { name: "Nouakchott", latitude: 18.0735, longitude: -15.9582 },
      { name: "Nouadhibou", latitude: 20.9313, longitude: -17.0347 },
      { name: "Kiffa", latitude: 16.6167, longitude: -11.4000 },
      { name: "Kaédi", latitude: 16.1500, longitude: -13.5000 },
      { name: "Rosso", latitude: 16.5130, longitude: -15.8054 },
    ],
  },
  {
    code: "MU", name: "Maurice", flag: "🇲🇺",
    regions: [
      { name: "Port Louis", latitude: -20.1609, longitude: 57.4978 },
      { name: "Beau Bassin-Rose Hill", latitude: -20.2333, longitude: 57.4667 },
      { name: "Vacoas-Phoenix", latitude: -20.2997, longitude: 57.4822 },
      { name: "Curepipe", latitude: -20.3163, longitude: 57.5180 },
      { name: "Quatre Bornes", latitude: -20.2667, longitude: 57.4833 },
    ],
  },
  {
    code: "MW", name: "Malawi", flag: "🇲🇼",
    regions: [
      { name: "Lilongwe", latitude: -13.9626, longitude: 33.7741 },
      { name: "Blantyre", latitude: -15.7861, longitude: 35.0058 },
      { name: "Mzuzu", latitude: -11.4658, longitude: 33.6481 },
      { name: "Zomba", latitude: -15.3833, longitude: 35.3333 },
      { name: "Kasungu", latitude: -13.0333, longitude: 33.4833 },
    ],
  },
  {
    code: "MZ", name: "Moçambique", flag: "🇲🇿",
    regions: [
      { name: "Maputo", latitude: -25.9692, longitude: 32.5732 },
      { name: "Matola", latitude: -25.9667, longitude: 32.4667 },
      { name: "Beira", latitude: -19.8437, longitude: 34.8389 },
      { name: "Nampula", latitude: -15.1165, longitude: 39.2666 },
      { name: "Quelimane", latitude: -17.8786, longitude: 36.8883 },
    ],
  },
  {
    code: "NA", name: "Namibia", flag: "🇳🇦",
    regions: [
      { name: "Windhoek", latitude: -22.5597, longitude: 17.0832 },
      { name: "Rundu", latitude: -17.9333, longitude: 19.7667 },
      { name: "Walvis Bay", latitude: -22.9575, longitude: 14.5053 },
      { name: "Oshakati", latitude: -17.7833, longitude: 15.6833 },
      { name: "Swakopmund", latitude: -22.6783, longitude: 14.5269 },
    ],
  },
  {
    code: "NE", name: "Niger", flag: "🇳🇪",
    regions: [
      { name: "Niamey", latitude: 13.5137, longitude: 2.1098 },
      { name: "Zinder", latitude: 13.8000, longitude: 8.9833 },
      { name: "Maradi", latitude: 13.4997, longitude: 7.1000 },
      { name: "Agadez", latitude: 16.9742, longitude: 7.9901 },
      { name: "Tahoua", latitude: 14.8889, longitude: 5.2680 },
    ],
  },
  {
    code: "NG", name: "Nigeria", flag: "🇳🇬",
    regions: [
      { name: "Lagos", latitude: 6.5244, longitude: 3.3792 },
      { name: "Abuja", latitude: 9.0579, longitude: 7.4951 },
      { name: "Kano", latitude: 12.0022, longitude: 8.5920 },
      { name: "Ibadan", latitude: 7.3775, longitude: 3.9470 },
      { name: "Port Harcourt", latitude: 4.8156, longitude: 7.0498 },
      { name: "Kaduna", latitude: 10.5264, longitude: 7.4382 },
    ],
  },
  {
    code: "RW", name: "Rwanda", flag: "🇷🇼",
    regions: [
      { name: "Kigali", latitude: -1.9441, longitude: 30.0619 },
      { name: "Butare", latitude: -2.5967, longitude: 29.7403 },
      { name: "Gitarama", latitude: -2.0748, longitude: 29.7564 },
      { name: "Ruhengeri", latitude: -1.4990, longitude: 29.6330 },
      { name: "Gisenyi", latitude: -1.7028, longitude: 29.2565 },
    ],
  },
  {
    code: "SC", name: "Seychelles", flag: "🇸🇨",
    regions: [
      { name: "Victoria", latitude: -4.6191, longitude: 55.4513 },
      { name: "Anse Boileau", latitude: -4.7200, longitude: 55.4833 },
      { name: "Beau Vallon", latitude: -4.6167, longitude: 55.4333 },
      { name: "Takamaka", latitude: -4.7667, longitude: 55.5167 },
    ],
  },
  {
    code: "SD", name: "Sudan", flag: "🇸🇩",
    regions: [
      { name: "Khartoum", latitude: 15.5518, longitude: 32.5324 },
      { name: "Omdurman", latitude: 15.6500, longitude: 32.4833 },
      { name: "Port Sudan", latitude: 19.6152, longitude: 37.2162 },
      { name: "Kassala", latitude: 15.4500, longitude: 36.4000 },
      { name: "Nyala", latitude: 12.0500, longitude: 24.8833 },
    ],
  },
  {
    code: "SL", name: "Sierra Leone", flag: "🇸🇱",
    regions: [
      { name: "Freetown", latitude: 8.4897, longitude: -13.2344 },
      { name: "Bo", latitude: 7.9647, longitude: -11.7383 },
      { name: "Kenema", latitude: 7.8773, longitude: -11.1865 },
      { name: "Makeni", latitude: 8.8833, longitude: -12.0500 },
      { name: "Koidu", latitude: 8.6386, longitude: -10.9797 },
    ],
  },
  {
    code: "SN", name: "Sénégal", flag: "🇸🇳",
    regions: [
      { name: "Dakar", latitude: 14.6928, longitude: -17.4467 },
      { name: "Touba", latitude: 14.8653, longitude: -15.8828 },
      { name: "Thiès", latitude: 14.7910, longitude: -16.9256 },
      { name: "Kaolack", latitude: 14.1500, longitude: -16.0833 },
      { name: "Ziguinchor", latitude: 12.5667, longitude: -16.2667 },
    ],
  },
  {
    code: "SO", name: "Somalia", flag: "🇸🇴",
    regions: [
      { name: "Mogadishu", latitude: 2.0469, longitude: 45.3182 },
      { name: "Hargeisa", latitude: 9.5596, longitude: 44.0650 },
      { name: "Kismayo", latitude: -0.3582, longitude: 42.5454 },
      { name: "Bosaso", latitude: 11.2753, longitude: 49.1875 },
      { name: "Garowe", latitude: 8.4054, longitude: 48.4845 },
    ],
  },
  {
    code: "SS", name: "Sudan del Sud", flag: "🇸🇸",
    regions: [
      { name: "Juba", latitude: 4.8594, longitude: 31.5713 },
      { name: "Wau", latitude: 7.7040, longitude: 28.0000 },
      { name: "Malakal", latitude: 9.5340, longitude: 31.6604 },
      { name: "Bor", latitude: 6.2100, longitude: 31.5593 },
      { name: "Yambio", latitude: 4.5696, longitude: 28.3962 },
    ],
  },
  {
    code: "ST", name: "São Tomé e Príncipe", flag: "🇸🇹",
    regions: [
      { name: "São Tomé", latitude: 0.3365, longitude: 6.7273 },
      { name: "Santo António", latitude: 1.6477, longitude: 7.4167 },
      { name: "Neves", latitude: 0.3617, longitude: 6.5533 },
    ],
  },
  {
    code: "SZ", name: "Eswatini", flag: "🇸🇿",
    regions: [
      { name: "Mbabane", latitude: -26.3186, longitude: 31.1410 },
      { name: "Manzini", latitude: -26.4833, longitude: 31.3667 },
      { name: "Lobamba", latitude: -26.4333, longitude: 31.2000 },
      { name: "Nhlangano", latitude: -27.1167, longitude: 31.2000 },
      { name: "Siteki", latitude: -26.4500, longitude: 31.9500 },
    ],
  },
  {
    code: "TD", name: "Tchad", flag: "🇹🇩",
    regions: [
      { name: "N'Djamena", latitude: 12.1048, longitude: 15.0445 },
      { name: "Moundou", latitude: 8.5654, longitude: 16.0871 },
      { name: "Sarh", latitude: 9.1443, longitude: 18.3869 },
      { name: "Abéché", latitude: 13.8314, longitude: 20.8325 },
      { name: "Kélo", latitude: 9.3000, longitude: 15.8000 },
    ],
  },
  {
    code: "TG", name: "Togo", flag: "🇹🇬",
    regions: [
      { name: "Lomé", latitude: 6.1375, longitude: 1.2123 },
      { name: "Sokodé", latitude: 8.9833, longitude: 1.1333 },
      { name: "Kara", latitude: 9.5500, longitude: 1.1833 },
      { name: "Atakpamé", latitude: 7.5333, longitude: 1.1333 },
      { name: "Bassar", latitude: 9.2500, longitude: 0.7833 },
    ],
  },
  {
    code: "TZ", name: "Tanzania", flag: "🇹🇿",
    regions: [
      { name: "Dar es Salaam", latitude: -6.7924, longitude: 39.2083 },
      { name: "Dodoma", latitude: -6.1722, longitude: 35.7395 },
      { name: "Mwanza", latitude: -2.5167, longitude: 32.9000 },
      { name: "Arusha", latitude: -3.3869, longitude: 36.6822 },
      { name: "Zanzibar", latitude: -6.1659, longitude: 39.2026 },
      { name: "Kilimanjaro", latitude: -3.2167, longitude: 37.0333 },
    ],
  },
  {
    code: "UG", name: "Uganda", flag: "🇺🇬",
    regions: [
      { name: "Kampala", latitude: 0.3476, longitude: 32.5825 },
      { name: "Gulu", latitude: 2.7751, longitude: 32.2990 },
      { name: "Lira", latitude: 2.2498, longitude: 32.8998 },
      { name: "Mbarara", latitude: -0.6075, longitude: 30.6568 },
      { name: "Jinja", latitude: 0.4478, longitude: 33.2026 },
    ],
  },
  {
    code: "ZA", name: "South Africa", flag: "🇿🇦",
    regions: [
      { name: "Gauteng", latitude: -26.2708, longitude: 28.1123 },
      { name: "Western Cape", latitude: -33.9249, longitude: 18.4241 },
      { name: "KwaZulu-Natal", latitude: -29.8587, longitude: 31.0218 },
      { name: "Eastern Cape", latitude: -32.2968, longitude: 26.4193 },
      { name: "Limpopo", latitude: -23.9045, longitude: 29.4685 },
      { name: "Mpumalanga", latitude: -25.5653, longitude: 30.5279 },
      { name: "Free State", latitude: -28.4541, longitude: 26.7968 },
      { name: "North West", latitude: -26.6638, longitude: 25.2838 },
      { name: "Northern Cape", latitude: -29.0467, longitude: 21.8569 },
    ],
  },
  {
    code: "ZM", name: "Zambia", flag: "🇿🇲",
    regions: [
      { name: "Lusaka", latitude: -15.4167, longitude: 28.2833 },
      { name: "Kitwe", latitude: -12.8167, longitude: 28.2000 },
      { name: "Ndola", latitude: -12.9667, longitude: 28.6333 },
      { name: "Livingstone", latitude: -17.8500, longitude: 25.8500 },
      { name: "Chipata", latitude: -13.6333, longitude: 32.6500 },
    ],
  },
  {
    code: "ZW", name: "Zimbabwe", flag: "🇿🇼",
    regions: [
      { name: "Harare", latitude: -17.8252, longitude: 31.0335 },
      { name: "Bulawayo", latitude: -20.1500, longitude: 28.5833 },
      { name: "Chitungwiza", latitude: -18.0127, longitude: 31.0756 },
      { name: "Mutare", latitude: -18.9667, longitude: 32.6667 },
      { name: "Gweru", latitude: -19.4500, longitude: 29.8167 },
    ],
  },
  {
    code: "JP", name: "Giappone", flag: "🇯🇵",
    regions: [
      { name: "Hokkaido", latitude: 43.0642, longitude: 141.3469 },
      { name: "Aomori", latitude: 40.8244, longitude: 140.7400 },
      { name: "Iwate", latitude: 39.7036, longitude: 141.1527 },
      { name: "Miyagi", latitude: 38.2688, longitude: 140.8721 },
      { name: "Akita", latitude: 39.7186, longitude: 140.1023 },
      { name: "Yamagata", latitude: 38.2404, longitude: 140.3635 },
      { name: "Fukushima", latitude: 37.7500, longitude: 140.4676 },
      { name: "Ibaraki", latitude: 36.3418, longitude: 140.4468 },
      { name: "Tochigi", latitude: 36.5658, longitude: 139.8836 },
      { name: "Gunma", latitude: 36.3911, longitude: 139.0608 },
      { name: "Saitama", latitude: 35.8569, longitude: 139.6489 },
      { name: "Chiba", latitude: 35.6047, longitude: 140.1233 },
      { name: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
      { name: "Kanagawa", latitude: 35.4476, longitude: 139.6425 },
      { name: "Niigata", latitude: 37.9161, longitude: 139.0364 },
      { name: "Toyama", latitude: 36.6953, longitude: 137.2113 },
      { name: "Ishikawa", latitude: 36.5947, longitude: 136.6256 },
      { name: "Fukui", latitude: 36.0652, longitude: 136.2216 },
      { name: "Yamanashi", latitude: 35.6640, longitude: 138.5684 },
      { name: "Nagano", latitude: 36.6513, longitude: 138.1810 },
      { name: "Shizuoka", latitude: 34.9769, longitude: 138.3831 },
      { name: "Aichi", latitude: 35.1802, longitude: 136.9066 },
      { name: "Gifu", latitude: 35.4232, longitude: 136.7608 },
      { name: "Mie", latitude: 34.7303, longitude: 136.5086 },
      { name: "Shiga", latitude: 35.0045, longitude: 135.8686 },
      { name: "Kyoto", latitude: 35.0116, longitude: 135.7681 },
      { name: "Osaka", latitude: 34.6937, longitude: 135.5023 },
      { name: "Hyogo", latitude: 34.6913, longitude: 135.1830 },
      { name: "Nara", latitude: 34.6851, longitude: 135.8049 },
      { name: "Wakayama", latitude: 34.2260, longitude: 135.1675 },
      { name: "Tottori", latitude: 35.5011, longitude: 134.2351 },
      { name: "Shimane", latitude: 35.4723, longitude: 133.0505 },
      { name: "Okayama", latitude: 34.6617, longitude: 133.9350 },
      { name: "Hiroshima", latitude: 34.3853, longitude: 132.4553 },
      { name: "Yamaguchi", latitude: 34.1859, longitude: 131.4706 },
      { name: "Tokushima", latitude: 34.0657, longitude: 134.5593 },
      { name: "Kagawa", latitude: 34.3401, longitude: 134.0434 },
      { name: "Ehime", latitude: 33.8417, longitude: 132.7657 },
      { name: "Kochi", latitude: 33.5597, longitude: 133.5311 },
      { name: "Fukuoka", latitude: 33.5902, longitude: 130.4017 },
      { name: "Saga", latitude: 33.2494, longitude: 130.2988 },
      { name: "Nagasaki", latitude: 32.7448, longitude: 129.8737 },
      { name: "Kumamoto", latitude: 32.7898, longitude: 130.7417 },
      { name: "Oita", latitude: 33.2382, longitude: 131.6126 },
      { name: "Miyazaki", latitude: 31.9077, longitude: 131.4202 },
      { name: "Kagoshima", latitude: 31.5602, longitude: 130.5581 },
      { name: "Okinawa", latitude: 26.2124, longitude: 127.6809 },
    ],
  },
  {
    code: "IN", name: "India", flag: "🇮🇳",
    regions: [
      { name: "Andhra Pradesh", latitude: 15.9129, longitude: 79.7400 },
      { name: "Arunachal Pradesh", latitude: 28.2180, longitude: 94.7278 },
      { name: "Assam", latitude: 26.2006, longitude: 92.9376 },
      { name: "Bihar", latitude: 25.0961, longitude: 85.3131 },
      { name: "Chhattisgarh", latitude: 21.2787, longitude: 81.8661 },
      { name: "Goa", latitude: 15.2993, longitude: 74.1240 },
      { name: "Gujarat", latitude: 22.2587, longitude: 71.1924 },
      { name: "Haryana", latitude: 29.0588, longitude: 76.0856 },
      { name: "Himachal Pradesh", latitude: 31.1048, longitude: 77.1734 },
      { name: "Jharkhand", latitude: 23.6102, longitude: 85.2799 },
      { name: "Karnataka", latitude: 15.3173, longitude: 75.7139 },
      { name: "Kerala", latitude: 10.8505, longitude: 76.2711 },
      { name: "Madhya Pradesh", latitude: 22.9734, longitude: 78.6569 },
      { name: "Maharashtra", latitude: 19.7515, longitude: 75.7139 },
      { name: "Manipur", latitude: 24.6637, longitude: 93.9063 },
      { name: "Meghalaya", latitude: 25.4670, longitude: 91.3662 },
      { name: "Mizoram", latitude: 23.1645, longitude: 92.9376 },
      { name: "Nagaland", latitude: 26.1584, longitude: 94.5624 },
      { name: "Odisha", latitude: 20.9517, longitude: 85.0985 },
      { name: "Punjab", latitude: 31.1471, longitude: 75.3412 },
      { name: "Rajasthan", latitude: 27.0238, longitude: 74.2179 },
      { name: "Sikkim", latitude: 27.5330, longitude: 88.5122 },
      { name: "Tamil Nadu", latitude: 11.1271, longitude: 78.6569 },
      { name: "Telangana", latitude: 18.1124, longitude: 79.0193 },
      { name: "Tripura", latitude: 23.9408, longitude: 91.9882 },
      { name: "Uttar Pradesh", latitude: 26.8467, longitude: 80.9462 },
      { name: "Uttarakhand", latitude: 30.0668, longitude: 79.0193 },
      { name: "West Bengal", latitude: 22.9868, longitude: 87.8550 },
      { name: "Andaman and Nicobar Islands", latitude: 11.7401, longitude: 92.6586 },
      { name: "Chandigarh", latitude: 30.7333, longitude: 76.7794 },
      { name: "Dadra and Nagar Haveli and Daman and Diu", latitude: 20.1809, longitude: 73.0169 },
      { name: "Delhi (NCT)", latitude: 28.7041, longitude: 77.1025 },
      { name: "Jammu and Kashmir", latitude: 33.7782, longitude: 76.5762 },
      { name: "Ladakh", latitude: 34.2268, longitude: 77.5619 },
      { name: "Lakshadweep", latitude: 10.5667, longitude: 72.6417 },
      { name: "Puducherry", latitude: 11.9416, longitude: 79.8083 },
    ],
  },
  {
    code: "AU", name: "Australia", flag: "🇦🇺",
    regions: [
      { name: "New South Wales", latitude: -33.8688, longitude: 151.2093 },
      { name: "Victoria", latitude: -37.8136, longitude: 144.9631 },
      { name: "Queensland", latitude: -27.4705, longitude: 153.0260 },
      { name: "Western Australia", latitude: -31.9505, longitude: 115.8605 },
      { name: "South Australia", latitude: -34.9285, longitude: 138.6007 },
      { name: "Tasmania", latitude: -42.8821, longitude: 147.3272 },
      { name: "Northern Territory", latitude: -12.4634, longitude: 130.8456 },
      { name: "Australian Capital Territory", latitude: -35.2809, longitude: 149.1300 },
    ],
  },
  {
    code: "NZ", name: "New Zealand", flag: "🇳🇿",
    regions: [
      { name: "Auckland", latitude: -36.8485, longitude: 174.7633 },
      { name: "Wellington", latitude: -41.2865, longitude: 174.7762 },
      { name: "Canterbury", latitude: -43.5321, longitude: 172.6362 },
      { name: "Waikato", latitude: -37.7870, longitude: 175.2793 },
      { name: "Bay of Plenty", latitude: -37.7870, longitude: 176.1651 },
      { name: "Otago", latitude: -45.8788, longitude: 170.5028 },
      { name: "Northland", latitude: -35.7275, longitude: 174.3238 },
    ],
  },
  {
    code: "PG", name: "Papua Nuova Guinea", flag: "🇵🇬",
    regions: [
      { name: "Port Moresby", latitude: -9.4438, longitude: 147.1803 },
      { name: "Lae", latitude: -6.7286, longitude: 146.9980 },
      { name: "Mount Hagen", latitude: -5.8597, longitude: 144.2256 },
      { name: "Madang", latitude: -5.2189, longitude: 145.7939 },
      { name: "Wewak", latitude: -3.5535, longitude: 143.6335 },
    ],
  },
  {
    code: "FJ", name: "Figi", flag: "🇫🇯",
    regions: [
      { name: "Suva", latitude: -18.1416, longitude: 178.4419 },
      { name: "Nadi", latitude: -17.8000, longitude: 177.4167 },
      { name: "Lautoka", latitude: -17.6167, longitude: 177.4500 },
      { name: "Labasa", latitude: -16.4333, longitude: 179.3667 },
      { name: "Ba", latitude: -17.5333, longitude: 177.6833 },
    ],
  },
  {
    code: "SB", name: "Isole Salomone", flag: "🇸🇧",
    regions: [
      { name: "Honiara", latitude: -9.4319, longitude: 159.9550 },
      { name: "Gizo", latitude: -8.1000, longitude: 156.8333 },
      { name: "Auki", latitude: -8.7667, longitude: 160.7000 },
      { name: "Kirakira", latitude: -10.4540, longitude: 161.9205 },
    ],
  },
  {
    code: "VU", name: "Vanuatu", flag: "🇻🇺",
    regions: [
      { name: "Port Vila", latitude: -17.7334, longitude: 168.3210 },
      { name: "Luganville", latitude: -15.5333, longitude: 167.1667 },
      { name: "Lakatoro", latitude: -16.1000, longitude: 167.4167 },
      { name: "Isangel", latitude: -19.5500, longitude: 169.2667 },
    ],
  },
  {
    code: "WS", name: "Samoa", flag: "🇼🇸",
    regions: [
      { name: "Apia", latitude: -13.8314, longitude: -171.8672 },
      { name: "Vaitele", latitude: -13.8500, longitude: -171.9000 },
      { name: "Salelologa", latitude: -13.7333, longitude: -172.3500 },
      { name: "Falealupo", latitude: -13.4833, longitude: -172.7833 },
    ],
  },
  {
    code: "TO", name: "Tonga", flag: "🇹🇴",
    regions: [
      { name: "Nukuʻalofa", latitude: -21.1320, longitude: -175.2018 },
      { name: "Neiafu", latitude: -18.6500, longitude: -173.9833 },
      { name: "Haveluloto", latitude: -21.1667, longitude: -175.1667 },
      { name: "Pangai", latitude: -19.8000, longitude: -174.3500 },
    ],
  },
  {
    code: "FM", name: "Micronesia", flag: "🇫🇲",
    regions: [
      { name: "Palikir", latitude: 6.9248, longitude: 158.1610 },
      { name: "Weno", latitude: 7.4589, longitude: 151.8481 },
      { name: "Tofol", latitude: 5.3231, longitude: 163.0148 },
      { name: "Kolonia", latitude: 6.9600, longitude: 158.2100 },
    ],
  },
  {
    code: "PW", name: "Palau", flag: "🇵🇼",
    regions: [
      { name: "Ngerulmud", latitude: 7.5000, longitude: 134.6241 },
      { name: "Koror", latitude: 7.3419, longitude: 134.4790 },
      { name: "Airai", latitude: 7.3667, longitude: 134.5667 },
    ],
  },
  {
    code: "MH", name: "Isole Marshall", flag: "🇲🇭",
    regions: [
      { name: "Majuro", latitude: 7.1164, longitude: 171.1858 },
      { name: "Ebeye", latitude: 8.7833, longitude: 167.7333 },
      { name: "Jabor", latitude: 5.9167, longitude: 169.6667 },
    ],
  },
  {
    code: "NR", name: "Nauru", flag: "🇳🇷",
    regions: [
      { name: "Yaren", latitude: -0.5477, longitude: 166.9209 },
      { name: "Aiwo", latitude: -0.5333, longitude: 166.9167 },
      { name: "Boe", latitude: -0.5333, longitude: 166.9333 },
    ],
  },
  {
    code: "TV", name: "Tuvalu", flag: "🇹🇻",
    regions: [
      { name: "Funafuti", latitude: -8.5211, longitude: 179.1983 },
      { name: "Vaiaku", latitude: -8.5167, longitude: 179.2167 },
    ],
  },
  {
    code: "KI", name: "Kiribati", flag: "🇰🇮",
    regions: [
      { name: "South Tarawa", latitude: 1.3290, longitude: 172.9790 },
      { name: "Betio", latitude: 1.3517, longitude: 172.9327 },
      { name: "London", latitude: 1.9828, longitude: -157.4729 },
    ],
  },
];

export const EUROPEAN_COUNTRIES: CountryData[] = ALL_COUNTRIES;

export const CONTINENT_MAP: ContinentData[] = [
  {
    key: "AF",
    label: "Africa",
    countryCodes: ["AO","BF","BI","BJ","BW","CD","CF","CG","CI","CM","CV","DJ","DZ","EG","ER","ET","GA","GH","GM","GN","GQ","GW","KE","KM","LR","LS","LY","MA","MG","ML","MR","MU","MW","MZ","NA","NE","NG","RW","SC","SD","SL","SN","SO","SS","ST","SZ","TD","TG","TN","TZ","UG","ZA","ZM","ZW"],
  },
  {
    key: "AS",
    label: "Asia",
    countryCodes: ["IN","JP"],
  },
  {
    key: "EU",
    label: "Europa",
    countryCodes: ["AD","AL","AM","AT","AZ","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES","FI","FR","GB","GE","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV","MC","MD","ME","MK","MT","NL","NO","PL","PT","RO","RS","RU","SE","SI","SK","SM","TR","UA","VA","XK"],
  },
  {
    key: "NA",
    label: "Nord America",
    countryCodes: ["CA","US"],
  },
  {
    key: "OC",
    label: "Oceania",
    countryCodes: ["AU","FJ","FM","KI","MH","NR","NZ","PG","PW","SB","TO","TV","VU","WS"],
  },
  {
    key: "SA",
    label: "Sud America",
    countryCodes: ["AR","BO","BR","CL","CO","EC","GY","PE","PY","SR","UY","VE"],
  },
];

export function getCountryByCode(code: string): CountryData | undefined {
  return ALL_COUNTRIES.find((c) => c.code === code);
}

export function getRegionsForCountry(code: string): RegionData[] {
  return getCountryByCode(code)?.regions ?? [];
}

export function getCountryFlag(code: string): string {
  return getCountryByCode(code)?.flag ?? "";
}

export function getCountryName(code: string): string {
  return getCountryByCode(code)?.name ?? code;
}

export function getRegionCoordinates(countryCode: string | null | undefined, regionName: string | null | undefined): { latitude: number; longitude: number } {
  if (countryCode) {
    const country = getCountryByCode(countryCode);
    if (country) {
      if (regionName) {
        const region = country.regions.find((r) => r.name === regionName);
        if (region) return { latitude: region.latitude, longitude: region.longitude };
      }
      if (country.regions.length > 0) {
        return { latitude: country.regions[0].latitude, longitude: country.regions[0].longitude };
      }
    }
  }
  if (regionName) {
    for (const c of ALL_COUNTRIES) {
      const r = c.regions.find((reg) => reg.name === regionName);
      if (r) return { latitude: r.latitude, longitude: r.longitude };
    }
  }
  return { latitude: 41.9028, longitude: 12.4964 };
}

export function findCountryByRegion(regionName: string): string | null {
  for (const c of ALL_COUNTRIES) {
    if (c.regions.some((r) => r.name === regionName)) {
      return c.code;
    }
  }
  return null;
}

export function getContinentForCountry(code: string): ContinentData | undefined {
  return CONTINENT_MAP.find((c) => c.countryCodes.includes(code));
}

export function getCountriesForContinent(continentKey: string): CountryData[] {
  const continent = CONTINENT_MAP.find((c) => c.key === continentKey);
  if (!continent) return [];
  return continent.countryCodes
    .map((code) => getCountryByCode(code))
    .filter((c): c is CountryData => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
}
