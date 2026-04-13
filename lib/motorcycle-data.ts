const MOTORCYCLE_DATA: Record<string, string[]> = {
  "AJS": [
    "7R", "16", "18", "20", "Match V",
  ],
  "Aprilia": [
    "RSV4",
    "RSV Mille",
    "Tuono",
    "RS", "RS 660",
    "Tuareg 660",
    "Dorsoduro",
    "Shiver",
    "Caponord",
    "Futura",
    "SL Falco",
    "Mana 850",
    "ETV Cape Horn",
    "Pegaso",
    "RX 125", "SX 125",
  ],
  "Arch Motorcycle": [
    "KRGT-1", "1S",
  ],
  "Ariel": [
    "Square Four", "Red Hunter", "Leader", "Arrow", "VH500",
  ],
  "Benelli": [
    "TRK",
    "Leoncino",
    "502C", "302R",
    "752S", "BN 302", "BN 600 GT",
    "TNT", "TNT 125",
    "Imperiale 400",
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
    "R GS", "R GS Adventure",
    "F GS",
    "R 18", "R 18 Classic",
    "S 1000 RR", "M 1000 RR", "S 1000 XR", "S 1000 R", "M 1000 R",
    "F 900 R", "F 900 XR",
    "K 1600 GT", "K 1600 GTL",
    "K 1300 R", "K 1300 S", "K 1300 GT",
    "C 400 X", "C 400 GT",
    "HP2", "HP4",
    "G 310 R", "G 310 GS",
    "CE 04",
  ],
  "Brixton": [
    "Cromwell", "Felsberg", "Rayburn",
  ],
  "Brough Superior": [
    "SS100", "Lawrence Special", "AMB001",
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
    "Spyder RS", "Spyder ST",
    "Spyder F3", "Spyder F3-T", "Spyder F3 Limited",
    "Spyder RT",
    "Ryker", "Ryker Rally",
    "Maverick R",
  ],
  "CFMoto": [
    "700CL-X", "CL-X Heritage",
    "800MT", "650MT", "650NK",
    "1250TR-G",
    "450SS", "450SR", "400NK", "400GT", "300SR",
  ],
  "Cleveland CycleWerks": [
    "Ace", "Tha Heist", "Misfit", "Clyde",
  ],
  "Daelim": [
    "VS 125", "Daystar", "Otello", "Roadwin",
  ],
  "Derbi": [
    "Senda", "GPR", "Mulhacén", "Terra",
  ],
  "Douglas": [
    "Dragonfly", "T35", "Mark V", "Endeavour",
  ],
  "Ducati": [
    "Monster",
    "Panigale V2", "Panigale V4", "Panigale V4S", "Panigale V4R",
    "Panigale 899", "Panigale 959",
    "748", "749", "848", "916", "996", "998", "999",
    "1098", "1198",
    "SS",
    "SuperSport 950", "SuperSport 950S",
    "Multistrada 620", "Multistrada 950",
    "Multistrada 1000", "Multistrada 1200", "Multistrada 1260",
    "Multistrada V2", "Multistrada V4",
    "Multistrada V4 Rally", "Multistrada V4 Pikes Peak",
    "Hypermotard", "Hypermotard 939", "Hypermotard 796", "Hypermotard 698",
    "Hyperstrada",
    "Scrambler Icon", "Scrambler Full Throttle",
    "Scrambler Desert Sled", "Scrambler Nightshift",
    "Scrambler Urban Motard",
    "Streetfighter V2", "Streetfighter V4", "Streetfighter V4S",
    "Streetfighter 848",
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
  "FB Mondial": [
    "HPS 125", "SMX 125", "Pagani",
  ],
  "FN": [
    "Quattro Cilindri", "M50", "M67", "M86",
  ],
  "Francis-Barnett": [
    "Falcon", "Plover", "Cruiser", "Seagull",
  ],
  "Gas Gas": [
    "ES 700", "EC", "EC 450",
    "EX", "TX 300",
    "SM 700", "MC", "MC 450F",
    "TXT Racing", "Pampera",
  ],
  "Gilera": [
    "GP800", "Runner", "Fuoco 500ie", "Nexus 500",
  ],
  "Harley-Davidson": [
    "Sportster",
    "Street Bob", "Fat Boy", "Heritage Classic",
    "Fat Bob", "Dyna Super Glide",
    "Low Rider S", "Low Rider ST",
    "Breakout", "Slim", "Deluxe", "Freewheeler",
    "Wide Glide",
    "Night Rod Special", "V-Rod", "V-Rod Muscle",
    "Super Glide Custom", "Switchback",
    "Street 500", "Street 750", "Street Rod",
    "Street Glide", "Street Glide Special", "Street Glide ST",
    "Road Glide", "Road Glide Special", "Road Glide ST",
    "Road King", "Road King Special",
    "Electra Glide", "Tri Glide Ultra",
    "Hydra-Glide", "Duo-Glide",
    "Pan America", "Pan America Special",
    "CVO Street Glide", "CVO Road Glide",
    "LiveWire",
  ],
  "Henderson": [
    "Model K", "Model KJ Streamline", "Super X",
  ],
  "Honda": [
    "CB",
    "CB400", "CB750",
    "CB Hornet", "CB750 Hornet", "CB1100", "CB1100RS",
    "Africa Twin", "XRV 750 Africa Twin",
    "Fireblade",
    "CBR",
    "NSR", "CBX",
    "VFR800", "VFR1200X Crossrunner",
    "NC750X", "NT1100",
    "X-ADV 750", "Forza 750", "Forza 350",
    "Integra",
    "Varadero", "Transalp",
    "CRF300L",
    "Pan European ST",
    "Gold Wing", "Valkyrie",
    "CMX Rebel",
    "Shadow",
    "VTR Firestorm",
    "Super Cub", "CT125", "Monkey 125", "Dax ST125",
  ],
  "Horex": [
    "VR6",
  ],
  "Husaberg": [
    "FE", "FS", "FX", "FC", "TE",
  ],
  "Husqvarna": [
    "Norden 901", "Svartpilen", "Vitpilen",
  ],
  "Hyosung": [
    "GT125", "GT250R", "GT650",
    "GV650 Aquila", "GV700",
  ],
  "Indian": [
    "Scout", "Chief", "Springfield",
    "Pursuit", "Challenger", "FTR", "LiveWire One",
  ],
  "Italjet": [
    "Dragster", "Grifon", "Formula", "Velocifero",
  ],
  "Jawa": [
    "300 Classic", "350 Classic", "660",
  ],
  "Kawasaki": [
    "Z", "Z900 RS",
    "Ninja ZX", "ZX-4R",
    "Ninja 650", "Ninja 400", "Ninja 300",
    "Ninja H2", "Ninja H2 R", "Ninja H2 SX", "Z H2",
    "Ninja 1000",
    "Versys 1000", "Versys 650", "Versys-X 300", "KLZ1000 Versys-X",
    "ER-6N", "ER-6F",
    "Vulcan S", "W800", "W650", "Estrella",
    "Eliminator 500",
    "GPZ 900R", "ZRX",
  ],
  "Keeway": [
    "Superlight", "K-Light", "Vieste", "Texas", "Cafe Racer",
  ],
  "KTM": [
    "1290 Super Duke R", "1290 Super Duke GT",
    "Super Duke 990",
    "Duke",
    "1290 Super Adventure",
    "950 Adventure", "990 Adventure",
    "1090 Adventure", "1190 Adventure",
    "890 Adventure", "790 Adventure", "390 Adventure",
    "1290 Super GT",
    "890 SMC R", "690 SMC",
    "690 Enduro",
    "Super Moto",
    "RC 390", "RC 125", "RC8",
    "EXC-F",
  ],
  "Kymco": [
    "AK 550", "Xciting S 400", "Downtown 350",
    "Super Dink", "People GTi",
  ],
  "Laverda": [
    "Jota", "750 SFC", "1000", "3C", "Montjuic", "Alpino", "Mirage",
  ],
  "Matchless": [
    "G50", "G80", "Silver Hawk", "G15", "Model X",
  ],
  "Montesa": [
    "Cota Trial", "Enduro", "Cappra",
  ],
  "Moto Guzzi": [
    "V7", "V9 Bobber", "V9 Roamer",
    "V85 TT", "V100 Mandello",
    "Breva", "Stelvio", "Norge", "Griso",
    "California", "Eldorado",
    "Quota", "Centauro", "Daytona RS",
    "850 Le Mans", "MGX-21",
  ],
  "Moto Morini": [
    "X-Cape 650", "Seiemmezzo", "Corsaro", "9½",
  ],
  "MV Agusta": [
    "F4", "F3",
    "Brutale", "Dragster",
    "Superveloce", "Turismo Veloce",
    "Stradale", "Rivale", "Rush",
    "Lucky Explorer", "Enduro Veloce",
    "Reparto Corse", "Corse",
    "Tre",
  ],
  "MZ / MuZ": [
    "ETZ", "TS", "Trophy",
    "Skorpion", "Baghira", "Mastiff",
  ],
  "Nimbus": [
    "Model B", "Model C",
  ],
  "Norton": [
    "Commando", "Atlas Ranger", "Atlas Nomad",
    "Dominator", "V4 CR",
  ],
  "Ossa": [
    "Pioneer", "TR80", "Mar", "Phantom",
  ],
  "Panther": [
    "Model 100", "Sloper", "Model 120",
  ],
  "Peugeot Motocycles": [
    "Django", "Metropolis", "Speedfight", "Jet Force", "Kisbee",
  ],
  "Piaggio": [
    "MP3", "Beverly", "X9", "X8",
  ],
  "Puch": [
    "Maxi", "Cobra", "VS50", "MC50",
  ],
  "QJMotor": [
    "SRK 600", "SRV 300", "SRS 600", "SRT 800",
  ],
  "Rieju": [
    "Marathon", "MRT", "RS3", "Century",
  ],
  "Royal Enfield": [
    "Classic", "Meteor", "Hunter", "Scram",
    "Himalayan", "Interceptor", "Continental GT",
    "Super Meteor", "Thunderbird", "Electra",
    "Guerrilla 450", "Bear 650", "Shotgun 650",
  ],
  "Scott": [
    "Squirrel", "Flying Squirrel", "3S",
  ],
  "Sunbeam": [
    "S7", "S8", "Model 9", "Longstroke",
  ],
  "Suzuki": [
    "GSF Bandit",
    "GSX-R", "GSX-S", "GSX-8S", "GSX-8R",
    "GSX 750", "GSX 1100",
    "GS 500", "GS 1000",
    "V-Strom",
    "SV650", "Gladius",
    "TL1000S", "TL1000R",
    "RF",
    "RGV Gamma",
    "DR", "RM",
    "Intruder", "Marauder",
    "Hayabusa", "Katana", "B-King",
    "Inazuma", "Burgman",
  ],
  "SYM": [
    "Wolf", "Maxsym TL",
  ],
  "TM Racing": [
    "EN", "MX", "SMX", "SMR", "SMM",
  ],
  "Triumph": [
    "Bonneville T100", "Bonneville T120", "Bonneville Bobber",
    "Speedmaster", "America",
    "Scrambler 400 X", "Scrambler 900",
    "Scrambler 1200 XC", "Scrambler 1200 XE",
    "Tiger", "Tiger Explorer",
    "Street Triple", "Speed Triple",
    "Sprint ST", "TT600",
    "Daytona 675", "Daytona 660",
    "Thruxton",
    "Thunderbird", "Thunderbird Sport",
    "Trophy",
    "Legend TT",
    "Rocket 3", "Trident 660", "Speed 400",
  ],
  "Ural": [
    "Gear Up", "CT", "Ranger",
  ],
  "Velocette": [
    "Thruxton", "Venom", "Viper", "KTT", "MAC", "LE",
  ],
  "Vespa": [
    "GTS", "GTV", "Primavera", "Sprint",
    "Elettrica", "Sei Giorni", "LX", "S",
  ],
  "Vincent": [
    "Black Shadow", "Black Lightning", "Rapide", "Comet", "Black Prince",
  ],
  "Voge": [
    "300R", "300AC", "500R", "500DS",
    "650R", "650DS", "650AC", "DS900X",
  ],
  "Yamaha": [
    "MT-09", "MT-07", "MT-03", "MT-10", "MT-125", "MT-01",
    "YZF-R1", "YZF-R7", "YZF-R3", "YZF-R125", "YZF-R6",
    "FZR",
    "FZ1 Fazer", "FZ6 Fazer", "FZS1000 Fazer",
    "FJR 1300",
    "XJR 1200", "XJR 1300", "XJ6", "XJ6 Diversion", "XJ900",
    "Tracer 9", "Ténéré 700", "Super Ténéré",
    "XSR 900", "XSR 700", "XSR 125",
    "SR",
    "XV Virago",
    "XVS V-Star",
    "WR",
    "NIKEN", "V-Max", "Bolt",
    "Drag Star",
    "XMAX", "TMAX", "Majesty",
    "TDM", "TRX",
  ],
  "Zero Motorcycles": [
    "SR/F", "SR/S", "SR/S SE", "DSR/X", "DSR Black Forest",
    "FX", "FXE",
    "S", "DS",
  ],
  "Zündapp": [
    "KS601", "GS125", "CS25", "KS50",
  ],
};

export const MOTORCYCLE_BRANDS: string[] = Object.keys(MOTORCYCLE_DATA).sort(
  (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
);

export const BRAND_NOTES: Record<string, string> = {
  "Piaggio": "⚠ Se hai una Vespa, cercala nel menu principale sotto 'Vespa'",
};

export function getModelsForBrand(brand: string): string[] {
  return MOTORCYCLE_DATA[brand] || [];
}

export default MOTORCYCLE_DATA;
