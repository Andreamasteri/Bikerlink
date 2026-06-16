import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "./db";
import { users, userProfiles, userMotorcycles, zavorrinaWishlists, zavorrinaWishlistMotos } from "@shared/db";
import { eq } from "drizzle-orm";
import { pool } from "./db";

const regionCoords: Record<string, { lat: number; lng: number }> = {
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

function randOffset() {
  return (Math.random() - 0.5) * 0.5;
}

const bikers = [
  { nickname: "RobyThunder", sex: "M", birthYear: 1985, region: "Lombardia", brand: "Ducati", model: "Monster 821", year: 2019, displacement: 821, motoType: "Naked", ridingStyle: "Sportiva", bio: "Biker della domenica, ma sulla Monster mi sento un campione! Hmu se ti va un giro sui laghi" },
  { nickname: "TonyRomano", sex: "M", birthYear: 1978, region: "Lazio", brand: "Aprilia", model: "Tuono V4", year: 2021, displacement: 1077, motoType: "Naked", ridingStyle: "Sportiva", bio: "A Roma co er traffico ce vole coraggio... ma io c'ho la Tuono e nun me ferma nessuno!" },
  { nickname: "SalvatoreVento", sex: "M", birthYear: 1982, region: "Campania", brand: "Yamaha", model: "MT-09", year: 2020, displacement: 890, motoType: "Naked", ridingStyle: "Allegra", bio: "Aggio fatto 200mila km cu a mia MT... chi sal a moto con me nun scende cchiu!" },
  { nickname: "PeppeSud", sex: "M", birthYear: 1990, region: "Calabria", brand: "Honda", model: "Africa Twin", year: 2022, displacement: 1100, motoType: "Adventure", ridingStyle: "Turistica", bio: "Sugnu calabrisi e giro cu l'Africa Twin pe tutta a costa. Veniti cu mia!" },
  { nickname: "MarcoBiella", sex: "M", birthYear: 1975, region: "Piemonte", brand: "BMW", model: "R 1250 GS", year: 2021, displacement: 1254, motoType: "Adventure", ridingStyle: "Turistica", bio: "Piemontese doc, passo i weekend sulle strade alpine con la mia GS. Cerco compagni di viaggio" },
  { nickname: "LucaTrieste", sex: "M", birthYear: 1988, region: "Friuli Venezia Giulia", brand: "KTM", model: "790 Duke", year: 2020, displacement: 790, motoType: "Naked", ridingStyle: "Allegra", bio: "Dal Carso al mare, sempre in sella. La Duke è la mia compagna di vita ormai" },
  { nickname: "FrancoSardo", sex: "M", birthYear: 1980, region: "Sardegna", brand: "Triumph", model: "Tiger 900", year: 2021, displacement: 888, motoType: "Adventure", ridingStyle: "Turistica", bio: "In Sardegna le strade sono bellissime ma vuote... cerco qualcuno pe fà compagnia!" },
  { nickname: "AndreaVeneto", sex: "M", birthYear: 1995, region: "Veneto", brand: "Kawasaki", model: "Z900", year: 2022, displacement: 948, motoType: "Naked", ridingStyle: "Sportiva", bio: "Veneto de Padova, giro co a Z900 tuti i finesettimana. Se te vol vegner, scrivi!" },
  { nickname: "GianlucaMarche", sex: "M", birthYear: 1983, region: "Marche", brand: "Moto Guzzi", model: "V85 TT", year: 2020, displacement: 853, motoType: "Adventure", ridingStyle: "Tranquilla", bio: "Marchigiano tranquillo, mi piace girare per le colline con la mia Guzzi senza fretta" },
  { nickname: "NinoEtna", sex: "M", birthYear: 1992, region: "Sicilia", brand: "Ducati", model: "Multistrada V4", year: 2023, displacement: 1158, motoType: "Adventure", ridingStyle: "Turistica", bio: "Minchia chi bellu andari n moto! Cerco qualcuno pi fari un giro fino all'Etna e ritorno" },
  { nickname: "DavideBO", sex: "M", birthYear: 1987, region: "Emilia-Romagna", brand: "Aprilia", model: "RS 660", year: 2022, displacement: 659, motoType: "Sport", ridingStyle: "Sportiva", bio: "Emiliano DOC, la domenica è sacra: tortellini e poi via in moto verso l'Appennino" },
  { nickname: "MatteoUmbro", sex: "M", birthYear: 1970, region: "Umbria", brand: "Honda", model: "CB 650R", year: 2021, displacement: 649, motoType: "Naked", ridingStyle: "Tranquilla", bio: "Giro per l'Umbria da 30 anni, conosco ogni curva. Venite che ve porto io" },
  { nickname: "GiuseppeBari", sex: "M", birthYear: 1993, region: "Puglia", brand: "Yamaha", model: "Tracer 9", year: 2022, displacement: 890, motoType: "Touring", ridingStyle: "Turistica", bio: "Barese verace, giro la Puglia in lungo e in largo. Le strade del Gargano so na meraviglia" },
  { nickname: "AldoTrentino", sex: "M", birthYear: 1976, region: "Trentino-Alto Adige", brand: "BMW", model: "F 850 GS", year: 2020, displacement: 853, motoType: "Enduro", ridingStyle: "Allegra", bio: "Tra le Dolomiti con la mia GS, estate e inverno. Il Passo Stelvio è casa mia" },
  { nickname: "EnzoCampobasso", sex: "M", birthYear: 1998, region: "Molise", brand: "KTM", model: "390 Adventure", year: 2021, displacement: 373, motoType: "Adventure", ridingStyle: "Allegra", bio: "Il Molise esiste e ha strade bellissime! Venite a scoprirlo con me e la mia KTM" },
  { nickname: "PaoloLigure", sex: "M", birthYear: 2000, region: "Liguria", brand: "Harley-Davidson", model: "Iron 883", year: 2019, displacement: 883, motoType: "Cruiser", ridingStyle: "Tranquilla", bio: "Sulla costiera ligure con la mia Harley, piano piano... tanto la vista è troppo bella per correre" },
  { nickname: "FilippoToscano", sex: "M", birthYear: 1986, region: "Toscana", brand: "Triumph", model: "Street Triple", year: 2021, displacement: 765, motoType: "Naked", ridingStyle: "Sportiva", bio: "Firenze-Siena andata e ritorno ogni weekend, la Crete Senesi in moto son qualcosa di unico" },
  { nickname: "IvanVDA", sex: "M", birthYear: 2003, region: "Valle d'Aosta", brand: "Kawasaki", model: "Versys 650", year: 2022, displacement: 649, motoType: "Touring", ridingStyle: "Turistica", bio: "Il più giovane del gruppo ma il più matto! Passo del Gran San Bernardo ogni domenica" },
  { nickname: "ChiaraBiker", sex: "F", birthYear: 1991, region: "Basilicata", brand: "Ducati", model: "Scrambler Icon", year: 2021, displacement: 803, motoType: "Naked", ridingStyle: "Allegra", bio: "Lucana e fiera! Giro con la mia Scrambler tra i Sassi di Matera e le montagne" },
  { nickname: "ValentinaRide", sex: "F", birthYear: 1996, region: "Abruzzo", brand: "Honda", model: "Rebel 500", year: 2022, displacement: 471, motoType: "Cruiser", ridingStyle: "Tranquilla", bio: "Abruzzese, amo il Gran Sasso e le strade di montagna. Cerco compagnia pe girà tranquilla" },
];

const zavorrine = [
  { nickname: "RosaNapoli", sex: "F", birthYear: 1990, region: "Campania", bio: "Sto cercann nu biker serio pe fà n giro sulla costiera... sono simpatica e mi piace l'avventura!", personality: "avventurosa", isAvailable: true, wishlistDesc: "Cerco un biker con moto comoda per girare la costiera amalfitana", motos: [{ brand: "Ducati", model: "Multistrada", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "AntonellaCaserta", sex: "F", birthYear: 1985, region: "Campania", bio: "Aggio sempre sognato e girà in moto ma nun tengo a patente... chi me porta?", personality: "sognatrice", isAvailable: true, wishlistDesc: "Sogno un giro in Ducati per le strade della Campania", motos: [{ brand: "Ducati", model: "Monster", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "MariaGrazia_NA", sex: "F", birthYear: 1978, region: "Campania", bio: "So napulitana e me piac a velocità! Voglio sentì o viento nfaccia", personality: "civetta", isAvailable: false, wishlistDesc: "Un biker che mi faccia sentire il vento sulla costiera", motos: [{ brand: "Yamaha", model: "MT-09", motoType: "Naked", ridingStyle: "Sportiva" }, { brand: "Aprilia", model: "Tuono", motoType: "Naked", ridingStyle: "Sportiva" }] },
  { nickname: "GiulianaSicilia", sex: "F", birthYear: 1993, region: "Sicilia", bio: "Minchia, vogghiu fari un giro in moto fino a Taormina! Chi mi porta?", personality: "avventurosa", isAvailable: true, wishlistDesc: "Un giro fino a Taormina su una moto potente", motos: [{ brand: "BMW", model: "R 1250 GS", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "ConcettaPA", sex: "F", birthYear: 2001, region: "Sicilia", bio: "Palermitana doc, cerco biker pi girari a costa. No perditempo pls", personality: "pratica", isAvailable: true, wishlistDesc: "Biker serio con moto sportiva per la costa siciliana", motos: [{ brand: "Kawasaki", model: "Ninja 650", motoType: "Sport", ridingStyle: "Sportiva" }] },
  { nickname: "SarettaCT", sex: "F", birthYear: 1997, region: "Sicilia", bio: "Catanisa e timida ma sulla moto divento un'altra! Scrivetemi senza paura", personality: "timida", isAvailable: false, wishlistDesc: "Cerco qualcuno tranquillo per un primo giro in moto", motos: [{ brand: "Honda", model: "CB 500F", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "FrancescaRC", sex: "F", birthYear: 1989, region: "Calabria", bio: "Reggina e ironica, cerco un biker che non abbia paura delle curve calabresi!", personality: "ironica", isAvailable: true, wishlistDesc: "Voglio un biker coraggioso per le strade della Calabria", motos: [{ brand: "KTM", model: "890 Duke", motoType: "Naked", ridingStyle: "Sportiva" }] },
  { nickname: "MariaCZ", sex: "F", birthYear: 1995, region: "Calabria", bio: "Sugnu i Catanzaro e mi piaciaria girare nda Sila cu na moto grossa", personality: "sognatrice", isAvailable: true, wishlistDesc: "Un giro nella Sila su una adventure", motos: [{ brand: "Triumph", model: "Tiger 900", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "AngelaCosenza", sex: "F", birthYear: 2004, region: "Calabria", bio: "Giovanissima ma già pazza per le moto! Cerco qualcuno pe fare esperienza", personality: "avventurosa", isAvailable: true, wishlistDesc: "Prima esperienza in moto, voglio una cruiser comoda", motos: [{ brand: "Harley-Davidson", model: "Iron 883", motoType: "Cruiser", ridingStyle: "Tranquilla" }] },
  { nickname: "LuciaBari", sex: "F", birthYear: 1988, region: "Puglia", bio: "Barese e civetta, cerco un biker che mi porti a vedere il tramonto sul Gargano", personality: "civetta", isAvailable: true, wishlistDesc: "Tramonto sul Gargano in moto, chi viene?", motos: [{ brand: "Moto Guzzi", model: "V85 TT", motoType: "Adventure", ridingStyle: "Turistica" }, { brand: "BMW", model: "F 850 GS", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "ElenaLecce", sex: "F", birthYear: 1999, region: "Puglia", bio: "Salentina verace! Mi piace il vento tra i capeli e le strade dritte verso il mare", personality: "sognatrice", isAvailable: false, wishlistDesc: "Un giro nel Salento con una naked veloce", motos: [{ brand: "Yamaha", model: "MT-07", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "GraziaFoggia", sex: "F", birthYear: 1982, region: "Puglia", bio: "Cerco compagnia seria pe girare la Puglia, no scherzi. Sò de Foggia", personality: "pratica", isAvailable: true, wishlistDesc: "Biker affidabile per giri domenicali in Puglia", motos: [{ brand: "Honda", model: "Africa Twin", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "MonicaSassari", sex: "F", birthYear: 1994, region: "Sardegna", bio: "In Sardegna c'è troppo bello pe stare fermi! Cerco qualcuno che mi porti a scoprire le coste", personality: "avventurosa", isAvailable: true, wishlistDesc: "Costa Smeralda in moto, sogno ricorrente", motos: [{ brand: "Ducati", model: "Scrambler", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "PaolaCagliari", sex: "F", birthYear: 1986, region: "Sardegna", bio: "Cagliaritana ironica, cerco un biker che sappia guidare e anche far ridere!", personality: "ironica", isAvailable: false, wishlistDesc: "Un biker simpatico con una touring comoda", motos: [{ brand: "Yamaha", model: "Tracer 9", motoType: "Touring", ridingStyle: "Tranquilla" }] },
  { nickname: "TeresaPZ", sex: "F", birthYear: 1991, region: "Basilicata", bio: "Da Potenza cerco un biker pe girà verso Maratea... il mare lucano è sottovalutato!", personality: "pratica", isAvailable: true, wishlistDesc: "Un giro verso Maratea su una moto adventure", motos: [{ brand: "KTM", model: "790 Adventure", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "AnnaCB", sex: "F", birthYear: 2000, region: "Molise", bio: "Il Molise esiste e io pure! Cerco biker avventurosi che vogliono scoprirlo", personality: "ironica", isAvailable: true, wishlistDesc: "Scoprite il Molise con me! Serve una moto comoda", motos: [{ brand: "BMW", model: "F 750 GS", motoType: "Adventure", ridingStyle: "Tranquilla" }] },
  { nickname: "SimonaAQ", sex: "F", birthYear: 1987, region: "Abruzzo", bio: "Aquilana, amo la montagna e le strade con le curve. Cercasi biker paiente", personality: "timida", isAvailable: false, wishlistDesc: "Giro tranquillo sulle montagne abruzzesi", motos: [{ brand: "Honda", model: "CB 650R", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "FedericaPE", sex: "F", birthYear: 2003, region: "Abruzzo", bio: "Pescarese e un po pazza, voglio provare la moto per la prima volta! Chi si offre?", personality: "avventurosa", isAvailable: true, wishlistDesc: "Prima volta in moto! Qualcosa di tranquillo", motos: [{ brand: "Kawasaki", model: "Vulcan S", motoType: "Cruiser", ridingStyle: "Tranquilla" }, { brand: "Honda", model: "Rebel 500", motoType: "Cruiser", ridingStyle: "Tranquilla" }] },
  { nickname: "AlessiaRM", sex: "F", birthYear: 1992, region: "Lazio", bio: "Romana de Roma, cerco un biker che me porti fori dal raccordo annulare finalmente!", personality: "ironica", isAvailable: true, wishlistDesc: "Fuggire dal GRA su una naked potente", motos: [{ brand: "Aprilia", model: "Tuono 660", motoType: "Naked", ridingStyle: "Sportiva" }] },
  { nickname: "GiorgiaLT", sex: "F", birthYear: 1984, region: "Lazio", bio: "Da Latina, cerco compagnia per giri verso il Circeo e le isole pontine. Sò tranquilla", personality: "tranquilla", isAvailable: true, wishlistDesc: "Giro costiero verso il Circeo su moto comoda", motos: [{ brand: "Triumph", model: "Bonneville", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "ElisaToscana", sex: "F", birthYear: 1996, region: "Toscana", bio: "Fiorentina doc, le Crete Senesi in moto sono il paradiso. Cercasi compagno di strada", personality: "sognatrice", isAvailable: true, wishlistDesc: "Le colline toscane su una moto vintage", motos: [{ brand: "Moto Guzzi", model: "V7", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "SaraSiena", sex: "F", birthYear: 2007, region: "Toscana", bio: "Appena 18 e già sogno di girare la Toscana in moto! Per ora cerco passaggio", personality: "sognatrice", isAvailable: false, wishlistDesc: "Primo giro in moto tra le colline senesi", motos: [{ brand: "Ducati", model: "Scrambler Icon", motoType: "Naked", ridingStyle: "Allegra" }] },
  { nickname: "ChiaraPG", sex: "F", birthYear: 1990, region: "Umbria", bio: "Perugina e un po hippie, cerco un biker pe girare l'Umbria verde senza freta", personality: "tranquilla", isAvailable: true, wishlistDesc: "Giro lento per borghi umbri su moto adventure", motos: [{ brand: "BMW", model: "R 1250 GS", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "LauraAN", sex: "F", birthYear: 1983, region: "Marche", bio: "Anconetana, il Conero in moto è spettacolare. Cerco qualcuno che conosce le strade giuste", personality: "pratica", isAvailable: true, wishlistDesc: "Il Conero e le colline marchigiane in moto", motos: [{ brand: "Yamaha", model: "Tracer 7", motoType: "Touring", ridingStyle: "Turistica" }] },
  { nickname: "MartinaMI", sex: "F", birthYear: 1998, region: "Lombardia", bio: "Milanese ma non troppo, il weekend scappo dalla città. Cercasi biker con moto comoda!", personality: "civetta", isAvailable: true, wishlistDesc: "Fuga dal traffico milanese su una touring", motos: [{ brand: "BMW", model: "R 1250 RT", motoType: "Touring", ridingStyle: "Tranquilla" }] },
  { nickname: "GiuliaBG", sex: "F", birthYear: 2002, region: "Lombardia", bio: "Bergamasca e avventurosa, le Orobie in moto devono essere pazzesche! Chi mi ci porta?", personality: "avventurosa", isAvailable: true, wishlistDesc: "Le valli bergamasche su una enduro", motos: [{ brand: "KTM", model: "690 Enduro", motoType: "Enduro", ridingStyle: "Sportiva" }] },
  { nickname: "SilviaVR", sex: "F", birthYear: 1971, region: "Veneto", bio: "Veronese e romantica, cerco biker per giri sul Lago di Garda e le colline venete", personality: "sognatrice", isAvailable: false, wishlistDesc: "Giro romantico sul Garda con moto cruiser", motos: [{ brand: "Harley-Davidson", model: "Sportster", motoType: "Cruiser", ridingStyle: "Tranquilla" }, { brand: "Triumph", model: "Bonneville", motoType: "Naked", ridingStyle: "Tranquilla" }] },
  { nickname: "AuroraTorino", sex: "F", birthYear: 1994, region: "Piemonte", bio: "Torinese e pratica, cerco un biker per esplorare il Canavese e le Langhe nel weekend", personality: "pratica", isAvailable: true, wishlistDesc: "Le Langhe in moto con un biker esperto", motos: [{ brand: "Ducati", model: "Multistrada V2", motoType: "Adventure", ridingStyle: "Turistica" }] },
  { nickname: "RobertaBO", sex: "F", birthYear: 1989, region: "Emilia-Romagna", bio: "Bolognese e ironica, dopo i tortellini della nonna cerco un biker pe smaltirli in moto!", personality: "ironica", isAvailable: true, wishlistDesc: "Post-pranzo in moto sulle colline bolognesi", motos: [{ brand: "Aprilia", model: "RS 660", motoType: "Sport", ridingStyle: "Sportiva" }] },
  { nickname: "AndreaZav", sex: "M", birthYear: 1995, region: "Liguria", bio: "Si sono un ragazzo zavorrina! Mi piace stare in moto dietro, la guida la lascio a chi è più bravo", personality: "ironica", isAvailable: true, wishlistDesc: "Cerco bikers per giri sulla riviera ligure", motos: [{ brand: "Honda", model: "Gold Wing", motoType: "Touring", ridingStyle: "Turistica" }] },
];

const coppie = [
  { nickname: "Marco&Elena", region: "Lombardia", bio: "Coppia milanese, viaggiamo insieme da 10 anni! La moto è la nostra seconda casa", brand: "BMW", model: "R 1250 GS Adventure", year: 2022, displacement: 1254, motoType: "Adventure", ridingStyle: "Turistica" },
  { nickname: "Fabio&Laura", region: "Campania", bio: "Coppia napoletana, amma fatto tutt'Italia in moto! Cerchiamo amici pe viaggiare insieme", brand: "Ducati", model: "Multistrada V4 S", year: 2023, displacement: 1158, motoType: "Adventure", ridingStyle: "Turistica" },
];

async function seedFakeUsers() {
  console.log("Checking for existing fake users...");

  const existingFakes = await db
    .select()
    .from(users)
    .where(eq(users.isFake, true))
    .limit(11);

  if (existingFakes.length > 10) {
    console.log(`Found ${existingFakes.length} fake users already, skipping seed.`);
    await pool.end();
    return;
  }

  console.log("Generating per-account random passwords...");
  // Task #1078: ogni account fake riceve una password random (256-bit) UNICA,
  // non condivisa fra account, non persistita altrove. Gli account fake sono
  // comunque bloccati al login da auth.ts (isFake check) — questo è
  // defense-in-depth nel caso quel guard venga rimosso accidentalmente.
  const makeFakeHash = () =>
    bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 12);

  console.log("Seeding 20 bikers...");
  for (const biker of bikers) {
    try {
      const email = `fake_${biker.nickname.toLowerCase()}@fakeuser.bikerlink.it`;
      const coords = regionCoords[biker.region];

      const bikerLat = coords.lat + randOffset();
      const bikerLng = coords.lng + randOffset();
      const [user] = await db
        .insert(users)
        .values({
          nickname: biker.nickname,
          email,
          password: await makeFakeHash(),
          userType: "biker",
          sex: biker.sex,
          role: "user",
          status: "active",
          birthYear: biker.birthYear,
          region: biker.region,
          emailVerified: true,
          eulaAccepted: true,
          isFake: true,
          lastLoginAt: new Date(),
          firstLoginLat: bikerLat,
          firstLoginLng: bikerLng,
        })
        .returning();

      await db.insert(userProfiles).values({
        userId: user.id,
        isAvailable: true,
        latitude: bikerLat,
        longitude: bikerLng,
        bio: biker.bio,
      });

      await db.insert(userMotorcycles).values({
        userId: user.id,
        brand: biker.brand,
        model: biker.model,
        year: biker.year,
        displacement: biker.displacement,
        motorcycleType: biker.motoType,
        ridingStyle: biker.ridingStyle,
      });

      console.log(`Created biker "${biker.nickname}" (${biker.region})`);
    } catch (err: unknown) {
      console.error(`Failed to create biker "${biker.nickname}":`, (err as Error)?.message ?? err);
    }
  }

  console.log("Seeding 30 zavorrine...");
  for (const zav of zavorrine) {
    try {
      const email = `fake_${zav.nickname.toLowerCase()}@fakeuser.bikerlink.it`;
      const coords = regionCoords[zav.region];

      const zavLat = coords.lat + randOffset();
      const zavLng = coords.lng + randOffset();
      const [user] = await db
        .insert(users)
        .values({
          nickname: zav.nickname,
          email,
          password: await makeFakeHash(),
          userType: "zavorrina",
          sex: zav.sex,
          role: "user",
          status: "active",
          birthYear: zav.birthYear,
          region: zav.region,
          emailVerified: true,
          eulaAccepted: true,
          isFake: true,
          lastLoginAt: new Date(),
          firstLoginLat: zavLat,
          firstLoginLng: zavLng,
        })
        .returning();

      await db.insert(userProfiles).values({
        userId: user.id,
        isAvailable: zav.isAvailable,
        latitude: zavLat,
        longitude: zavLng,
        bio: zav.bio,
      });

      const [wishlist] = await db
        .insert(zavorrinaWishlists)
        .values({
          userId: user.id,
          description: zav.wishlistDesc,
        })
        .returning();

      for (const moto of zav.motos) {
        await db.insert(zavorrinaWishlistMotos).values({
          wishlistId: wishlist.id,
          brand: moto.brand,
          model: moto.model,
          motorcycleType: moto.motoType,
          ridingStyle: moto.ridingStyle,
        });
      }

      console.log(`Created zavorrina "${zav.nickname}" (${zav.region})`);
    } catch (err: unknown) {
      console.error(`Failed to create zavorrina "${zav.nickname}":`, (err as Error)?.message ?? err);
    }
  }

  console.log("Seeding 2 coppie...");
  for (const coppia of coppie) {
    try {
      const email = `fake_${coppia.nickname.toLowerCase().replace("&", "_")}@fakeuser.bikerlink.it`;
      const coords = regionCoords[coppia.region];

      const coppiaLat = coords.lat + randOffset();
      const coppiaLng = coords.lng + randOffset();
      const [user] = await db
        .insert(users)
        .values({
          nickname: coppia.nickname,
          email,
          password: await makeFakeHash(),
          userType: "coppia",
          sex: null,
          coupleSexConfig: "MF",
          role: "user",
          status: "active",
          region: coppia.region,
          emailVerified: true,
          eulaAccepted: true,
          isFake: true,
          lastLoginAt: new Date(),
          firstLoginLat: coppiaLat,
          firstLoginLng: coppiaLng,
        })
        .returning();

      await db.insert(userProfiles).values({
        userId: user.id,
        isAvailable: true,
        latitude: coppiaLat,
        longitude: coppiaLng,
        bio: coppia.bio,
      });

      await db.insert(userMotorcycles).values({
        userId: user.id,
        brand: coppia.brand,
        model: coppia.model,
        year: coppia.year,
        displacement: coppia.displacement,
        motorcycleType: coppia.motoType,
        ridingStyle: coppia.ridingStyle,
      });

      console.log(`Created coppia "${coppia.nickname}" (${coppia.region})`);
    } catch (err: unknown) {
      console.error(`Failed to create coppia "${coppia.nickname}":`, (err as Error)?.message ?? err);
    }
  }

  console.log("Fake users seed completed.");
  await pool.end();
}

seedFakeUsers().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
