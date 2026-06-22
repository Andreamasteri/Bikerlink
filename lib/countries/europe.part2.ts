import { CountryData } from './types';

const part2: CountryData[] = [
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
];

export default part2;
