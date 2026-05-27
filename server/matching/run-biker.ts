import { storage } from "../storage";
import { loadMatchPreferencesMap, bothPrefsEnabled } from "./filters";
import { classifyMatch } from "./notifications/classify";
import { dispatchMatchNotification } from "./notifications/dispatcher";

export async function runBikerBikerMatching(): Promise<number> {
  try {
    const countriesSetting = await storage.getAppSetting("matching_countries");
    let matchingCountries: string[] | undefined;
    if (countriesSetting?.value) {
      try { matchingCountries = JSON.parse(countriesSetting.value); } catch { /* no-op: fallback to default if JSON is invalid */ }
      if (!Array.isArray(matchingCountries) || matchingCountries.length === 0) matchingCountries = undefined;
    }

    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers(matchingCountries);
    console.log(`[BikerBikerMatching] moto biker trovate: ${bikerMotorcycles.length} (admin esclusi dal pool)`);
    if (bikerMotorcycles.length < 2) {
      console.warn("[BikerBikerMatching] WARN: meno di 2 moto biker trovate, matching impossibile");
      return 0;
    }

    const buckets = new Map<string, Array<{ userId: string; brand: string; model: string; motorcycleType: string; ridingStyle: string }>>();
    for (const bm of bikerMotorcycles) {
      if (!bm.motorcycle.brand) continue;
      const key = bm.motorcycle.brand.toLowerCase();
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({
        userId: bm.userId,
        brand: bm.motorcycle.brand,
        model: bm.motorcycle.model || "",
        motorcycleType: bm.motorcycle.motorcycleType || "",
        ridingStyle: bm.motorcycle.ridingStyle || "",
      });
    }

    const bucketsWithMultiple = [...buckets.values()].filter(m => m.length > 1);
    console.log(`[BikerBikerMatching] bucket creati: ${buckets.size}, con più di 1 membro: ${bucketsWithMultiple.length}`);
    
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );
    const isPairBlocked = (id1: string, id2: string) => blockedSet.has(`${id1}:${id2}`);
    const prefsMap = await loadMatchPreferencesMap();

    let matchCount = 0;
    let skipCount = 0;
    const MAX_MATCHES_PER_BUCKET = 100;

    const shuffledBuckets = [...buckets.values()].sort(() => Math.random() - 0.5);

    for (const members of shuffledBuckets) {
      if (members.length < 2) continue;
      const uniqueMembers = members
        .filter((m, idx) => members.findIndex(x => x.userId === m.userId) === idx)
        .sort(() => Math.random() - 0.5);
      if (uniqueMembers.length < 2) continue;

      let bucketCount = 0;
      const maxPairs = (uniqueMembers.length * (uniqueMembers.length - 1)) / 2;
      const bucketCap = Math.min(MAX_MATCHES_PER_BUCKET, maxPairs);

      outer:
      for (let i = 0; i < uniqueMembers.length; i++) {
        for (let j = i + 1; j < uniqueMembers.length; j++) {
          if (bucketCount >= bucketCap) break outer;
          const m1 = uniqueMembers[i];
          const m2 = uniqueMembers[j];
          const idA = m1.userId < m2.userId ? m1.userId : m2.userId;
          const idB = m1.userId < m2.userId ? m2.userId : m1.userId;

          if (isPairBlocked(m1.userId, m2.userId)) { skipCount++; continue; }
          if (!bothPrefsEnabled(prefsMap, m1.userId, m2.userId, "bikerBikerBrand")) { skipCount++; continue; }

          const isSupermatch = !!(
            m1.model && m2.model &&
            m1.model.toLowerCase() === m2.model.toLowerCase() &&
            m1.motorcycleType && m2.motorcycleType &&
            m1.motorcycleType.toLowerCase() === m2.motorcycleType.toLowerCase() &&
            m1.ridingStyle && m2.ridingStyle &&
            m1.ridingStyle.toLowerCase() === m2.ridingStyle.toLowerCase()
          );

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: m1.brand,
            status: "new",
            isSupermatch,
          });
          if (inserted) {
            matchCount++; bucketCount++;
            await dispatchMatchNotification({
              table: "biker_biker_matches",
              matchId: inserted.id,
              userIds: [idA, idB],
              priority: classifyMatch({ isSupermatch }),
              isSupermatch,
            });
          } else skipCount++;
        }
      }
    }

    console.log(`[BikerBikerMatching] nuovi match: ${matchCount}, saltati (già esistenti): ${skipCount}`);

    return matchCount;
  } catch (error) {
    console.error("Biker-biker matching error:", error);
    return 0;
  }
}

export async function runBikerBikerTypeStyleMatching(): Promise<number> {
  try {
    const bikerMotorcycles = await storage.getAllBikerMotorcyclesWithUsers();
    if (bikerMotorcycles.length < 2) return 0;

    const prefsMap = await loadMatchPreferencesMap();
    const allBlockedPairs = await storage.getAllBlockedPairs();
    const blockedSet = new Set(
      allBlockedPairs.flatMap(b => [`${b.blockerId}:${b.blockedId}`, `${b.blockedId}:${b.blockerId}`])
    );

    const typeStyleBuckets = new Map<string, Array<{ userId: string; motorcycleType: string; ridingStyle: string }>>();
    for (const bm of bikerMotorcycles) {
      const mtype = bm.motorcycle.motorcycleType?.toLowerCase();
      const rstyle = bm.motorcycle.ridingStyle?.toLowerCase();
      if (!mtype || !rstyle) continue;
      const key = `${mtype}|${rstyle}`;
      if (!typeStyleBuckets.has(key)) typeStyleBuckets.set(key, []);
      typeStyleBuckets.get(key)!.push({ userId: bm.userId, motorcycleType: mtype, ridingStyle: rstyle });
    }

    let matchCount = 0;
    let skipCount = 0;
    const MAX_PER_BUCKET = 50;

    for (const members of typeStyleBuckets.values()) {
      if (members.length < 2) continue;
      const unique = members
        .filter((m, i) => members.findIndex(x => x.userId === m.userId) === i)
        .sort(() => Math.random() - 0.5);
      if (unique.length < 2) continue;

      let bucketCount = 0;
      outer:
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          if (bucketCount >= MAX_PER_BUCKET) break outer;
          const m1 = unique[i];
          const m2 = unique[j];
          if (m1.userId === m2.userId) continue;
          if (blockedSet.has(`${m1.userId}:${m2.userId}`)) { skipCount++; continue; }
          if (!bothPrefsEnabled(prefsMap, m1.userId, m2.userId, "bikerBikerTypeStyle")) { skipCount++; continue; }

          const idA = m1.userId < m2.userId ? m1.userId : m2.userId;
          const idB = m1.userId < m2.userId ? m2.userId : m1.userId;

          const inserted = await storage.createBikerBikerMatch({
            biker1Id: idA,
            biker2Id: idB,
            motorcycleBrand: "tipo:" + m1.motorcycleType,
            status: "new",
            isSupermatch: false,
          });
          if (inserted) {
            matchCount++; bucketCount++;
            await dispatchMatchNotification({
              table: "biker_biker_matches",
              matchId: inserted.id,
              userIds: [idA, idB],
              priority: classifyMatch({}),
            });
          } else skipCount++;
        }
      }
    }

    console.log(`[TypeStyleMatching] nuovi match: ${matchCount}, saltati: ${skipCount}`);
    return matchCount;
  } catch (error) {
    console.error("[TypeStyleMatching] error:", error);
    return 0;
  }
}
