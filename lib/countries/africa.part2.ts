import { CountryData } from './types';

const part2: CountryData[] = [
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
];

export default part2;
