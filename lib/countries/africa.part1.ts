import { CountryData } from './types';

const part1: CountryData[] = [
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
];

export default part1;
