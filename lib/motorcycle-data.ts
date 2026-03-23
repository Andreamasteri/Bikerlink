const MOTORCYCLE_DATA: Record<string, string[]> = {
  "Aprilia": [
    "RSV4", "RSV4 Factory",
    "RSV Mille", "RSV Mille R",
    "Tuono V4", "Tuono V4 Factory", "Tuono",
    "RS", "Dorsoduro", "Shiver",
    "Caponord", "Futura", "Falco",
    "Pegaso Trail", "Pegaso Strada",
  ],
  "Arch Motorcycle": [
    "KRGT-1", "1S",
  ],
  "Benelli": [
    "TRK 502", "TRK 502 X",
    "Leoncino", "752S", "BN 302",
    "TNT 600", "TNT", "Imperiale 400",
  ],
  "Beta": [
    "RR", "Xtrainer",
  ],
  "Bimota": [
    "Tesi 3D", "Tesi H2",
    "DB5", "DB7", "DB9", "DB10",
    "HB3", "HB4",
  ],
  "BMW Motorrad": [
    "R nineT", "R nineT Scrambler", "R nineT Pure", "R nineT Racer", "R nineT Urban G/S",
    "R 1250 GS", "R 1250 GS Adventure",
    "R 1200 GS", "R 1200 GS Adventure",
    "R 1150 GS", "R 1100 GS",
    "S 1000 RR", "M 1000 RR", "S 1000 XR", "S 1000 R", "M 1000 R",
    "F 900 R", "F 900 XR",
    "F 850 GS", "F 850 GS Adventure",
    "F 750 GS", "F 700 GS", "F 650 GS",
    "K 1600 GT", "K 1600 GTL", "K 1600 B",
    "K 1300 R", "K 1300 S", "K 1300 GT",
    "HP2", "HP4",
    "G 310 R", "G 310 GS", "CE 04",
  ],
  "Brixton": [
    "Cromwell", "Felsberg", "Rayburn",
  ],
  "BSA": [
    "Gold Star",
  ],
  "Buell": [
    "XB9R Firebolt", "XB9S Lightning",
    "XB12R Firebolt", "XB12S Lightning",
    "XB12X Ulysses",
    "1125R", "1125CR", "Blast",
  ],
  "Cagiva": [
    "Raptor", "V-Raptor", "Mito", "Navigator",
  ],
  "Can-Am": [
    "Spyder F3", "Spyder F3-T", "Spyder F3 Limited",
    "Spyder RT", "Ryker", "Ryker Rally",
  ],
  "CFMoto": [
    "700CL-X", "800MT", "650MT", "650NK",
    "450SS", "450SR", "400NK", "400GT", "300SR",
  ],
  "Ducati": [
    "Monster", "Monster S2R", "Monster S4", "Monster S4R", "Monster SP",
    "Panigale V2", "Panigale V4", "Panigale V4S", "Panigale V4R",
    "Panigale 899", "Panigale 959",
    "748", "749", "848", "916", "996", "998", "999",
    "SS",
    "SuperSport 950", "SuperSport 950S",
    "Multistrada 620", "Multistrada 950",
    "Multistrada 1000", "Multistrada 1200", "Multistrada 1260",
    "Multistrada V2", "Multistrada V4",
    "Multistrada V4 Rally", "Multistrada V4 Pikes Peak",
    "Hypermotard", "Hypermotard SP", "Hypermotard 698",
    "Scrambler Icon", "Scrambler Full Throttle",
    "Scrambler Desert Sled", "Scrambler Nightshift",
    "Scrambler Urban Motard",
    "Streetfighter V2", "Streetfighter V4", "Streetfighter V4S",
    "Diavel", "Diavel V4", "XDiavel", "XDiavel V4",
    "Sport Classic", "Paul Smart",
    "DesertX", "DesertX Rally",
    "Desmosedici RR", "MH900E",
  ],
  "Energica": [
    "Ego", "Eva Ribelle", "Eva EsseEsse9",
  ],
  "Fantic": [
    "Caballero 500", "Caballero 700",
    "Caballero Scrambler", "Caballero Rally",
    "XEF", "XM",
  ],
  "Gas Gas": [
    "ES 700", "EC", "EX", "SM 700", "MC", "TXT Racing",
  ],
  "Gilera": [
    "GP800", "Runner", "Fuoco 500ie", "Nexus 500",
  ],
  "Harley-Davidson": [
    "Sportster S", "Nightster", "Iron 883", "Forty-Eight",
    "Street Bob", "Fat Boy", "Heritage Classic", "Fat Bob",
    "Low Rider S", "Low Rider ST",
    "Breakout", "Slim", "Deluxe", "Freewheeler",
    "Night Rod Special", "V-Rod", "V-Rod Muscle",
    "Super Glide Custom", "Wide Glide", "Switchback",
    "Street 500", "Street 750", "Street Rod",
    "Street Glide", "Street Glide Special", "Street Glide ST",
    "Road Glide", "Road Glide Special", "Road Glide ST",
    "Road King", "Road King Special", "Tri Glide Ultra",
    "Pan America", "Pan America Special",
    "CVO Street Glide", "CVO Road Glide",
    "LiveWire",
  ],
  "Honda": [
    "CB1000R", "CB650R", "CB500F", "CB300R", "CB125R",
    "CB Hornet", "CB1100", "CB1100RS",
    "Africa Twin",
    "Fireblade",
    "CBR",
    "VFR", "VFR1200F", "VFR1200X Crosstourer",
    "NC750X", "NT1100",
    "X-ADV 750", "Forza 750", "Forza 350",
    "Varadero", "Transalp",
    "Pan European ST",
    "Gold Wing",
    "CMX Rebel",
    "Shadow",
  ],
  "Horex": [
    "VR6",
  ],
  "Husqvarna": [
    "Norden 901", "Svartpilen", "Vitpilen",
  ],
  "Indian": [
    "Scout", "Chief", "Springfield",
    "Pursuit", "Challenger", "FTR", "LiveWire One",
  ],
  "Jawa": [
    "300 Classic", "350 Classic", "660",
  ],
  "Kawasaki": [
    "Z900", "Z900 RS",
    "Z1000", "Z1000SX",
    "Z800", "Z750", "Z650", "Z650 RS", "Z400", "Z300",
    "Ninja ZX-10R", "Ninja ZX-6R",
    "Ninja ZX-14R", "Ninja ZX-12R",
    "Ninja ZX-9R", "Ninja ZX-7R",
    "Ninja 650", "Ninja 400", "Ninja 300",
    "Ninja H2", "Ninja H2 R", "Ninja H2 SX", "Z H2",
    "Versys 1000", "Versys 650", "Versys-X 300",
    "ER-6N", "ER-6F",
    "Vulcan S", "W800", "Eliminator 500",
    "GPZ 900R", "ZRX 1200R",
  ],
  "KTM": [
    "1290 Super Duke R", "1290 Super Duke GT", "Super Duke 990",
    "Duke 390", "Duke 250", "Duke 200", "Duke 125",
    "Duke 690", "Duke 640",
    "1290 Super Adventure",
    "950 Adventure", "990 Adventure",
    "890 Adventure", "790 Adventure", "390 Adventure",
    "Super Moto",
    "RC 390", "RC 125", "RC8",
    "EXC-F", "Enduro",
  ],
  "Kymco": [
    "AK 550", "Xciting S 400", "Downtown 350",
    "Super Dink", "People GTi",
  ],
  "Moto Guzzi": [
    "V7", "V9 Bobber", "V9 Roamer",
    "V85 TT", "V85 TT Travel",
    "Breva", "Stelvio", "Norge", "Griso",
    "California", "Eldorado",
  ],
  "Moto Morini": [
    "X-Cape 650", "Seiemmezzo", "Corsaro", "9½",
  ],
  "MV Agusta": [
    "F4", "F3",
    "Brutale", "Dragster",
    "Superveloce", "Turismo Veloce",
    "Stradale", "Rivale", "Rush",
  ],
  "Norton": [
    "Commando", "Atlas Ranger", "Atlas Nomad",
    "Dominator", "V4 CR",
  ],
  "Piaggio": [
    "MP3", "Beverly", "X9", "X8",
  ],
  "Rieju": [
    "Marathon", "MRT", "RS3", "Century",
  ],
  "Royal Enfield": [
    "Classic", "Meteor", "Hunter", "Scram",
    "Himalayan", "Interceptor", "Continental GT",
    "Super Meteor", "Thunderbird", "Electra",
  ],
  "SYM": [
    "Wolf", "Maxsym TL",
  ],
  "Suzuki": [
    "GSF Bandit",
    "GSX-R", "GSX-S", "GSX-8S", "GSX-8R",
    "V-Strom",
    "SV650",
    "GS 500",
    "TL1000S", "TL1000R",
    "RF",
    "Hayabusa", "Katana", "B-King",
    "Inazuma", "Burgman",
  ],
  "Triumph": [
    "Bonneville T100", "Bonneville T120", "Bonneville Bobber",
    "Speedmaster", "America",
    "Scrambler 400 X", "Scrambler 900",
    "Scrambler 1200 XC", "Scrambler 1200 XE",
    "Tiger 900", "Tiger 955i", "Tiger 1050", "Tiger 1200",
    "Street Triple", "Speed Triple",
    "Sprint ST", "TT600",
    "Daytona 675", "Daytona 660",
    "Thruxton", "Thunderbird",
    "Rocket 3", "Trident 660", "Speed 400",
  ],
  "Ural": [
    "Gear Up", "CT", "Ranger",
  ],
  "Vespa": [
    "GTS", "GTV", "Primavera", "Sprint",
    "Elettrica", "Sei Giorni", "LX", "S",
  ],
  "Voge": [
    "300R", "300AC", "500R", "500DS",
    "650R", "650DS", "650AC", "DS900X",
  ],
  "Yamaha": [
    "MT-09", "MT-07", "MT-03", "MT-125", "MT-01",
    "YZF-R1", "YZF-R7", "YZF-R3", "YZF-R125", "YZF-R6",
    "FZ1 Fazer", "FZ6 Fazer", "FZS1000 Fazer",
    "XJR 1200", "XJR 1300", "XJ6", "XJ6 Diversion",
    "Tracer 9", "Ténéré 700",
    "XSR 900", "XSR 700", "XSR 125",
    "NIKEN", "V-Max", "Bolt",
    "Drag Star",
    "XMAX", "TMAX", "Majesty",
    "TDM", "TRX",
  ],
  "Zero Motorcycles": [
    "SR/F", "SR/S", "DSR/X", "FX", "S", "DS",
  ],
};

export const MOTORCYCLE_BRANDS: string[] = Object.keys(MOTORCYCLE_DATA).sort(
  (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
);

export function getModelsForBrand(brand: string): string[] {
  return MOTORCYCLE_DATA[brand] || [];
}

export default MOTORCYCLE_DATA;
