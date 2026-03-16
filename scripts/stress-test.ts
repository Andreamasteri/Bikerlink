import * as http from "http";
import * as https from "https";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000";
const DURATION_H = parseFloat(process.env.TEST_DURATION_H || "4");
const CYCLE_INTERVAL_S = parseInt(process.env.TEST_CYCLE_S || "30", 10);
const DURATION_MS = DURATION_H * 3600 * 1000;

const USER1_ID = process.env.TEST_USER1_EMAIL || "";
const USER1_PW = process.env.TEST_USER1_PASSWORD || "";
const USER2_ID = process.env.TEST_USER2_EMAIL || "";
const USER2_PW = process.env.TEST_USER2_PASSWORD || "";

interface Stats {
  calls: number;
  ok: number;
  fail: number;
  latencies: number[];
}

const categories: Record<string, Stats> = {};
let chatbotSent = 0;
let chatbotReplied = 0;
const errorLog: Array<{ time: string; cat: string; msg: string }> = [];

function getStat(cat: string): Stats {
  if (!categories[cat]) categories[cat] = { calls: 0, ok: 0, fail: 0, latencies: [] };
  return categories[cat];
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function log(icon: string, cat: string, msg: string, ms?: number) {
  const t = ms !== undefined ? ` [${ms}ms]` : "";
  console.log(`[${ts()}] ${icon} [${cat}] ${msg}${t}`);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randLat(): number {
  return 41.85 + (Math.random() - 0.5) * 0.2;
}
function randLng(): number {
  return 12.5 + (Math.random() - 0.5) * 0.3;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class Session {
  cookie: string = "";
  label: string;
  userId: string = "";

  constructor(label: string) {
    this.label = label;
  }

  private request(method: string, path: string, body?: unknown): Promise<{ status: number; data: any; ok: boolean }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE_URL);
      const isHttps = url.protocol === "https:";
      const lib = isHttps ? https : http;
      const payload = body ? JSON.stringify(body) : undefined;

      const opts: http.RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      };

      const req = lib.request(opts, (res) => {
        const setCookies = res.headers["set-cookie"];
        if (setCookies) {
          for (const sc of setCookies) {
            const match = sc.match(/^([^=]+=[^;]+)/);
            if (match) {
              const existing = this.cookie ? this.cookie.split("; ").filter((c) => !c.startsWith(match[1].split("=")[0] + "=")) : [];
              existing.push(match[1]);
              this.cookie = existing.join("; ");
            }
          }
        }
        let raw = "";
        res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
        res.on("end", () => {
          let data: any;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode || 0, data, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300 });
        });
      });
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async get(path: string): Promise<{ status: number; data: any; ok: boolean }> {
    return this.request("GET", path);
  }
  async post(path: string, body?: unknown): Promise<{ status: number; data: any; ok: boolean }> {
    return this.request("POST", path, body);
  }
  async put(path: string, body?: unknown): Promise<{ status: number; data: any; ok: boolean }> {
    return this.request("PUT", path, body);
  }
  async del(path: string): Promise<{ status: number; data: any; ok: boolean }> {
    return this.request("DELETE", path);
  }
}

async function tracked(cat: string, label: string, fn: () => Promise<any>): Promise<any> {
  const stat = getStat(cat);
  stat.calls++;
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    stat.ok++;
    stat.latencies.push(ms);
    log("✓", cat, label, ms);
    return result;
  } catch (e: any) {
    const ms = Date.now() - t0;
    stat.fail++;
    stat.latencies.push(ms);
    const errMsg = `${label} — ${e.message || e}`;
    log("✗", cat, errMsg, ms);
    if (errorLog.length < 200) errorLog.push({ time: ts(), cat, msg: errMsg });
    return null;
  }
}

const GREETINGS = ["Ciao!", "Ehi come va?", "Buongiorno!", "Ciao, tutto bene?", "Hey!"];
const MOTO_MSGS = [
  "Che moto hai?", "Ti piace la Ducati?", "Io giro con una Yamaha MT-07",
  "Hai mai fatto un viaggio lungo in moto?", "Preferisci strade di montagna o di mare?",
];
const CHAT_MSGS = [
  "Come stai?", "Da dove sei?", "Bella giornata per guidare",
  "Conosci qualche bella strada nella tua zona?", "Da quanto tempo guidi?",
  "Io abito in Lazio", "Mi piacerebbe fare un giro in Toscana",
];
const FOLLOWUP_MSGS = [
  "E tu?", "Dimmi di più", "Ah capisco, e poi?", "Interessante!",
  "Ma davvero?", "Bello! Racconta", "Si vero, anche io",
  "Ah ok, e che altro mi dici?", "Dai continua",
];
const SOS_REASONS = [
  "Gomma a terra sulla provinciale", "Problema alla catena, serve aiuto",
  "Batteria scarica, qualcuno ha i cavi?", "Incidente lieve, serve assistenza",
  "Moto in panne in autostrada", "Perso il gruppo, qualcuno mi viene a prendere?",
];
const ROUTE_NAMES = [
  "Giro dei Colli Albani", "Costiera Amalfitana in moto", "Appennino Tosco-Emiliano",
  "Lago di Bracciano loop", "Sardegna coast-to-coast", "Stelvio classico",
  "Circuito del Chianti", "Grande Raccordo Motard", "Roma-Napoli scenic",
];
const WAYPOINT_NAMES = [
  "Partenza Roma", "Bar del bivio", "Panorama mozzafiato", "Rifugio montano",
  "Benzinaia", "Ristoro tipico", "Punto foto", "Arrivo", "Sosta lago",
  "Piazza del paese", "Curva panoramica", "Belvedere",
];

let s1: Session;
let s2: Session;
let cachedFakeUserIds: string[] = [];

async function login(): Promise<boolean> {
  s1 = new Session("User1");
  s2 = new Session("User2");

  const r1 = await s1.post("/api/auth/login", { identifier: USER1_ID, password: USER1_PW });
  if (!r1.ok) { console.error(`Login User1 fallito: ${r1.status} ${JSON.stringify(r1.data)}`); return false; }
  s1.userId = r1.data.id;
  log("✓", "AUTH", `User1 loggato come ${r1.data.nickname} (id=${s1.userId})`);

  const r2 = await s2.post("/api/auth/login", { identifier: USER2_ID, password: USER2_PW });
  if (!r2.ok) { console.error(`Login User2 fallito: ${r2.status} ${JSON.stringify(r2.data)}`); return false; }
  s2.userId = r2.data.id;
  log("✓", "AUTH", `User2 loggato come ${r2.data.nickname} (id=${s2.userId})`);

  return true;
}

async function refreshFakeUserCache(): Promise<void> {
  const r = await s1.get("/api/users/online-list?includeOffline=true");
  if (r.ok && Array.isArray(r.data)) {
    cachedFakeUserIds = r.data
      .filter((u: any) => u.id !== s1.userId && u.id !== s2.userId)
      .map((u: any) => u.id)
      .slice(0, 200);
    log("ℹ", "CACHE", `${cachedFakeUserIds.length} fake user IDs cached`);
  }
}

function randomFakeId(): string {
  if (cachedFakeUserIds.length === 0) return "";
  return pick(cachedFakeUserIds);
}

async function actionDiscovery(): Promise<void> {
  const session = Math.random() < 0.5 ? s1 : s2;
  const lat = randLat();
  const lng = randLng();

  await tracked("DISCOVERY", "online-list", async () => {
    const r = await session.get(`/api/users/online-list?lat=${lat}&lng=${lng}&includeOffline=true`);
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} utenti`;
  });

  await tracked("DISCOVERY", "available-list", async () => {
    const r = await session.get(`/api/users/available-list?lat=${lat}&lng=${lng}`);
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} disponibili`;
  });

  await tracked("DISCOVERY", "biker-available-list", async () => {
    const r = await session.get(`/api/users/biker-available-list?lat=${lat}&lng=${lng}&includeOffline=true`);
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} biker`;
  });

  await tracked("DISCOVERY", "zavorrine-available-list", async () => {
    const r = await session.get(`/api/users/zavorrine-available-list?lat=${lat}&lng=${lng}&includeOffline=true`);
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} zavorrine`;
  });

  await tracked("DISCOVERY", "biker-available-count", async () => {
    const r = await session.get("/api/users/biker-available-count");
    if (!r.ok) throw new Error(`${r.status}`);
    return `count=${r.data.count}`;
  });

  await tracked("DISCOVERY", "zavorrine-available-count", async () => {
    const r = await session.get("/api/users/zavorrine-available-count");
    if (!r.ok) throw new Error(`${r.status}`);
    return `count=${r.data.count}`;
  });

  await tracked("DISCOVERY", "online-count", async () => {
    const r = await session.get("/api/users/online-count");
    if (!r.ok) throw new Error(`${r.status}`);
    return `count=${r.data.count}`;
  });

  await tracked("DISCOVERY", "available-count", async () => {
    const r = await session.get("/api/users/available-count");
    if (!r.ok) throw new Error(`${r.status}`);
    return `count=${r.data.count}`;
  });

  await tracked("DISCOVERY", "nearby", async () => {
    const r = await session.get(`/api/users/nearby?lat=${lat}&lng=${lng}&radius=50`);
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} nearby`;
  });

  const searchTerms = ["Rider", "Moto", "Roma", "Milano", "Ducati", "Biker"];
  await tracked("DISCOVERY", `search q="${pick(searchTerms)}"`, async () => {
    const q = pick(searchTerms);
    const r = await session.get(`/api/users/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} risultati per "${q}"`;
  });
}

async function actionProfile(): Promise<void> {
  const session = Math.random() < 0.5 ? s1 : s2;

  await tracked("PROFILE", "get-me", async () => {
    const r = await session.get("/api/users/me");
    if (!r.ok) throw new Error(`${r.status}`);
    return r.data.nickname;
  });

  const fakeId = randomFakeId();
  if (fakeId) {
    await tracked("PROFILE", `view-public ${fakeId.slice(0, 8)}`, async () => {
      const r = await session.get(`/api/users/${fakeId}/public`);
      if (!r.ok) throw new Error(`${r.status}`);
      return r.data.nickname;
    });
  }

  await tracked("PROFILE", "update-location", async () => {
    const r = await session.put("/api/users/location", { latitude: randLat(), longitude: randLng() });
    if (!r.ok) throw new Error(`${r.status}`);
  });

  await tracked("PROFILE", "toggle-availability", async () => {
    const isAvailable = Math.random() > 0.3;
    const r = await session.put("/api/users/me/availability", { isAvailable, latitude: randLat(), longitude: randLng() });
    if (!r.ok) throw new Error(`${r.status}`);
  });

  await tracked("PROFILE", "update-dynamic-profile", async () => {
    const r = await session.put("/api/users/profile/dynamic", {
      isAvailable: Math.random() > 0.5,
      latitude: randLat(),
      longitude: randLng(),
      searchPreference: pick(["biker", "zavorrina", "both"]),
    });
    if (!r.ok) throw new Error(`${r.status}`);
  });

  await tracked("PROFILE", "get-all-users", async () => {
    const r = await session.get("/api/users");
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} utenti totali`;
  });
}

async function actionChatFakeUser(): Promise<void> {
  const session = Math.random() < 0.5 ? s1 : s2;
  const fakeId = randomFakeId();
  if (!fakeId) return;

  const convRes = await tracked("CHAT", `create-conv with ${fakeId.slice(0, 8)}`, async () => {
    const r = await session.post("/api/chat/conversations", {
      conversationType: "private",
      participantIds: [fakeId],
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.data;
  });
  if (!convRes) return;

  const convId = convRes.id;
  const numMessages = 2 + Math.floor(Math.random() * 2);
  let messagesSentThisConv = 0;

  const msg1 = pick(GREETINGS);
  await tracked("CHAT", `send-msg-1 "${msg1.slice(0, 30)}"`, async () => {
    const r = await session.post(`/api/chat/conversations/${convId}/messages`, { content: msg1, messageType: "text" });
    if (!r.ok) throw new Error(`${r.status}`);
    messagesSentThisConv++;
    chatbotSent++;
  });

  await sleep(5000);

  const msg2 = pick(MOTO_MSGS);
  await tracked("CHAT", `send-msg-2 "${msg2.slice(0, 30)}"`, async () => {
    const r = await session.post(`/api/chat/conversations/${convId}/messages`, { content: msg2, messageType: "text" });
    if (!r.ok) throw new Error(`${r.status}`);
    messagesSentThisConv++;
    chatbotSent++;
  });

  await sleep(5000);

  if (numMessages >= 3) {
    const msg3 = pick([...CHAT_MSGS, ...FOLLOWUP_MSGS]);
    await tracked("CHAT", `send-msg-3 "${msg3.slice(0, 30)}"`, async () => {
      const r = await session.post(`/api/chat/conversations/${convId}/messages`, { content: msg3, messageType: "text" });
      if (!r.ok) throw new Error(`${r.status}`);
      messagesSentThisConv++;
      chatbotSent++;
    });

    await sleep(5000);
  }

  await tracked("CHAT", `check-bot-replies conv=${convId.slice(0, 8)}`, async () => {
    const r = await session.get(`/api/chat/conversations/${convId}/messages`);
    if (!r.ok) throw new Error(`${r.status}`);
    const msgs = r.data;
    const botReplies = Array.isArray(msgs)
      ? msgs.filter((m: any) => m.senderId === fakeId)
      : [];
    const replyCount = Math.min(botReplies.length, messagesSentThisConv);
    if (replyCount > 0) {
      chatbotReplied += replyCount;
      return `Bot replied ${replyCount}/${messagesSentThisConv}: "${(botReplies[botReplies.length - 1] as any).content?.slice(0, 40)}"`;
    }
    return "No bot reply yet";
  });
}

async function actionChatUserToUser(): Promise<void> {
  const convRes = await tracked("CHAT_U2U", "create-conv user1↔user2", async () => {
    const r = await s1.post("/api/chat/conversations", {
      conversationType: "private",
      participantIds: [s2.userId],
    });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.data;
  });
  if (!convRes) return;

  const convId = convRes.id;
  const msg1 = pick(CHAT_MSGS);
  await tracked("CHAT_U2U", `user1 sends "${msg1.slice(0, 30)}"`, async () => {
    const r = await s1.post(`/api/chat/conversations/${convId}/messages`, { content: msg1, messageType: "text" });
    if (!r.ok) throw new Error(`${r.status}`);
  });

  await sleep(1000);

  const msg2 = pick(CHAT_MSGS);
  await tracked("CHAT_U2U", `user2 replies "${msg2.slice(0, 30)}"`, async () => {
    const r = await s2.post(`/api/chat/conversations/${convId}/messages`, { content: msg2, messageType: "text" });
    if (!r.ok) throw new Error(`${r.status}`);
  });

  await tracked("CHAT_U2U", "user1 reads messages", async () => {
    const r = await s1.get(`/api/chat/conversations/${convId}/messages`);
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} msgs`;
  });
}

async function actionSOS(): Promise<void> {
  const existing = await s1.get("/api/sos/my");
  if (existing.ok && existing.data) {
    await tracked("SOS", "cancel-existing SOS", async () => {
      const r = await s1.put(`/api/sos/${existing.data.id}/cancel`);
      if (!r.ok && r.status !== 400) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
      return r.status === 400 ? "already closed" : "cancelled";
    });
    await sleep(2000);
  }

  const reason = pick(SOS_REASONS);
  const sosRes = await tracked("SOS", `create "${reason.slice(0, 30)}"`, async () => {
    const r = await s1.post("/api/sos", {
      reason,
      latitude: randLat(),
      longitude: randLng(),
      radiusKm: 15,
    });
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });
  if (!sosRes) return;

  await sleep(3000);

  await tracked("SOS", "user2 reads active SOS", async () => {
    const r = await s2.get("/api/sos/active");
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} active`;
  });

  const acceptRes = await tracked("SOS", `user2 accepts SOS ${sosRes.id.slice(0, 8)}`, async () => {
    const r = await s2.put(`/api/sos/${sosRes.id}/accept`);
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  if (acceptRes?.conversationId) {
    await tracked("SOS", "verify SOS chat created", async () => {
      const r = await s1.get(`/api/chat/conversations/${acceptRes.conversationId}/messages`);
      if (!r.ok) throw new Error(`${r.status}`);
      return `${r.data.length} msgs in SOS chat`;
    });
  }

  await sleep(10000);

  await tracked("SOS", "user1 checks my SOS after accept", async () => {
    const r = await s1.get("/api/sos/my");
    if (!r.ok) throw new Error(`${r.status}`);
    return r.data ? `status=${r.data.status}` : "no active SOS";
  });

  await tracked("SOS", `cancel/close SOS ${sosRes.id.slice(0, 8)}`, async () => {
    const r = await s1.put(`/api/sos/${sosRes.id}/cancel`);
    if (r.ok) return "cancelled successfully";
    if (r.status === 400) return "already closed (accepted status)";
    throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
  });
}

async function actionProposals(): Promise<void> {
  const now = new Date();
  const from = new Date(now.getTime() + 3600000);
  const to = new Date(now.getTime() + 7200000);

  const proposalRes = await tracked("PROPOSALS", "user1 creates proposal", async () => {
    const r = await s1.post("/api/proposals", {
      proposalType: "ride",
      searchType: "find_a_friend",
      title: pick(["Giro domenicale", "Uscita serale", "Weekend in moto", "Giro esplorativo", "Aperitivo su due ruote"]),
      description: "Test stress - proposta automatica",
      departureLatitude: randLat(),
      departureLongitude: randLng(),
      departureAddress: "Roma Centro",
      destinationAddress: "Frascati",
      destinationLatitude: randLat(),
      destinationLongitude: randLng(),
      departureTimeFrom: from.toISOString(),
      departureTimeTo: to.toISOString(),
      maxParticipants: 5,
    });
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  await tracked("PROPOSALS", "user2 reads proposals", async () => {
    const r = await s2.get("/api/proposals");
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} proposte`;
  });

  await tracked("PROPOSALS", "user2 reads proposals filtered=giro", async () => {
    const r = await s2.get("/api/proposals?filter=giro");
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} proposte giro`;
  });

  if (proposalRes) {
    await tracked("PROPOSALS", `user2 joins proposal ${proposalRes.id?.slice(0, 8)}`, async () => {
      const r = await s2.post(`/api/proposals/${proposalRes.id}/join`);
      if (!r.ok && r.status !== 409) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
      return r.status === 409 ? "già iscritto" : "joined";
    });

    await tracked("PROPOSALS", `get proposal detail ${proposalRes.id?.slice(0, 8)}`, async () => {
      const r = await s2.get(`/api/proposals/${proposalRes.id}`);
      if (!r.ok) throw new Error(`${r.status}`);
      return `participants=${r.data.participants?.length || 0}`;
    });
  }

  const matchesRes = await tracked("PROPOSALS", "user1 reads matches", async () => {
    const r = await s1.get("/api/proposals/matches");
    if (!r.ok) throw new Error(`${r.status}`);
    return r.data;
  });

  if (Array.isArray(matchesRes) && matchesRes.length > 0) {
    const pendingMatches = matchesRes.filter((m: any) => m.status === "pending");
    if (pendingMatches.length > 0) {
      const matchToHandle = pendingMatches[0];
      const shouldAccept = Math.random() > 0.3;
      if (shouldAccept) {
        await tracked("PROPOSALS", `accept match ${matchToHandle.id?.slice(0, 8)}`, async () => {
          const r = await s1.post(`/api/proposals/matches/${matchToHandle.id}/accept`);
          if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
          return `accepted, status=${r.data.status}`;
        });
      } else {
        await tracked("PROPOSALS", `reject match ${matchToHandle.id?.slice(0, 8)}`, async () => {
          const r = await s1.post(`/api/proposals/matches/${matchToHandle.id}/reject`);
          if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
          return "rejected";
        });
      }
    }
  }

  const garageRes = await tracked("PROPOSALS", "user2 reads garage-matches", async () => {
    const r = await s2.get("/api/proposals/garage-matches");
    if (!r.ok) throw new Error(`${r.status}`);
    return r.data;
  });

  if (Array.isArray(garageRes) && garageRes.length > 0) {
    const newGarageMatches = garageRes.filter((m: any) => m.status === "new");
    if (newGarageMatches.length > 0) {
      const gMatch = newGarageMatches[0];
      const shouldAccept = Math.random() > 0.3;
      if (shouldAccept) {
        await tracked("PROPOSALS", `accept garage-match ${gMatch.id?.slice(0, 8)}`, async () => {
          const r = await s2.post(`/api/proposals/garage-matches/${gMatch.id}/accept`);
          if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
          return "accepted";
        });
      } else {
        await tracked("PROPOSALS", `reject garage-match ${gMatch.id?.slice(0, 8)}`, async () => {
          const r = await s2.post(`/api/proposals/garage-matches/${gMatch.id}/reject`);
          if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
          return "rejected";
        });
      }
    }
  }

  if (proposalRes && Math.random() < 0.3) {
    await tracked("PROPOSALS", `cleanup: delete proposal ${proposalRes.id?.slice(0, 8)}`, async () => {
      const r = await s1.del(`/api/proposals/${proposalRes.id}`);
      if (!r.ok) throw new Error(`${r.status}`);
      return "deleted";
    });
  }
}

async function actionCustomRoutes(): Promise<void> {
  const routeRes = await tracked("ROUTES", "user1 creates route", async () => {
    const r = await s1.post("/api/custom-routes", {
      title: pick(ROUTE_NAMES),
      description: "Percorso generato dallo stress test",
      isPublic: true,
    });
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  });

  if (routeRes) {
    const waypointIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const wp = await tracked("ROUTES", `add waypoint ${i + 1}`, async () => {
        const r = await s1.post(`/api/custom-routes/${routeRes.id}/waypoints`, {
          name: pick(WAYPOINT_NAMES),
          latitude: randLat(),
          longitude: randLng(),
          waypointType: i === 0 ? "start" : i === 2 ? "end" : "stop",
          orderIndex: i,
        });
        if (!r.ok) throw new Error(`${r.status}`);
        return r.data;
      });
      if (wp) waypointIds.push(wp.id);
    }

    await tracked("ROUTES", `get route detail ${routeRes.id.slice(0, 8)}`, async () => {
      const r = await s1.get(`/api/custom-routes/${routeRes.id}`);
      if (!r.ok) throw new Error(`${r.status}`);
      return `waypoints=${r.data.waypoints?.length || 0}`;
    });

    if (waypointIds.length > 0) {
      await tracked("ROUTES", "update waypoint", async () => {
        const r = await s1.put(`/api/custom-routes/${routeRes.id}/waypoints/${waypointIds[0]}`, {
          name: "Punto aggiornato",
          description: "Waypoint modificato dallo stress test",
        });
        if (!r.ok) throw new Error(`${r.status}`);
      });
    }

    await tracked("ROUTES", "update route distance", async () => {
      const r = await s1.put(`/api/custom-routes/${routeRes.id}`, {
        totalDistanceKm: Math.round(Math.random() * 200 + 20),
      });
      if (!r.ok) throw new Error(`${r.status}`);
    });
  }

  await tracked("ROUTES", "user2 reads routes", async () => {
    const r = await s2.get("/api/custom-routes");
    if (!r.ok) throw new Error(`${r.status}`);
    return `myRoutes=${r.data.myRoutes?.length || 0}, public=${r.data.publicRoutes?.length || 0}`;
  });
}

async function actionNotifications(): Promise<void> {
  await tracked("NOTIF", "user1 reads notifications", async () => {
    const r = await s1.get("/api/notifications");
    if (!r.ok) throw new Error(`${r.status}`);
    const notifs = r.data;
    if (Array.isArray(notifs) && notifs.length > 0) {
      const unread = notifs.filter((n: any) => !n.readAt);
      if (unread.length > 0) {
        await s1.put(`/api/notifications/${unread[0].id}/read`);
        log("✓", "NOTIF", `marked notification ${unread[0].id.slice(0, 8)} as read`);
      }
    }
    return `${notifs.length} notifiche`;
  });

  await tracked("NOTIF", "user1 unread chat total", async () => {
    const r = await s1.get("/api/chat/unread-total");
    if (!r.ok) throw new Error(`${r.status}`);
    return `unread=${r.data.count}`;
  });

  await tracked("NOTIF", "user1 conversations list", async () => {
    const r = await s1.get("/api/chat/conversations");
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} conversazioni`;
  });

  await tracked("NOTIF", "user2 reads notifications", async () => {
    const r = await s2.get("/api/notifications");
    if (!r.ok) throw new Error(`${r.status}`);
    return `${r.data.length} notifiche`;
  });

  await tracked("NOTIF", "user2 unread chat total", async () => {
    const r = await s2.get("/api/chat/unread-total");
    if (!r.ok) throw new Error(`${r.status}`);
    return `unread=${r.data.count}`;
  });
}

type ActionEntry = { name: string; weight: number; fn: () => Promise<void> };

const ACTIONS: ActionEntry[] = [
  { name: "DISCOVERY",    weight: 3, fn: actionDiscovery },
  { name: "PROFILE",      weight: 2, fn: actionProfile },
  { name: "CHAT_FAKE",    weight: 5, fn: actionChatFakeUser },
  { name: "CHAT_U2U",     weight: 3, fn: actionChatUserToUser },
  { name: "SOS",           weight: 1, fn: actionSOS },
  { name: "PROPOSALS",    weight: 2, fn: actionProposals },
  { name: "ROUTES",       weight: 1, fn: actionCustomRoutes },
  { name: "NOTIF",        weight: 2, fn: actionNotifications },
];

function pickWeighted(): ActionEntry {
  const totalW = ACTIONS.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * totalW;
  for (const a of ACTIONS) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return ACTIONS[ACTIONS.length - 1];
}

const lastRun: Record<string, number> = {};
const MAX_GAP_MS = 10 * 60 * 1000;

function getAllOverdueActions(): ActionEntry[] {
  const now = Date.now();
  return ACTIONS.filter((a) => {
    const last = lastRun[a.name] || 0;
    return now - last > MAX_GAP_MS;
  });
}

function printReport() {
  console.log("\n" + "=".repeat(80));
  console.log("  REPORT FINALE STRESS TEST");
  console.log("=".repeat(80));

  const header = "Categoria".padEnd(15) +
    "Calls".padStart(8) +
    "OK".padStart(8) +
    "Fail".padStart(8) +
    "OK%".padStart(8) +
    "Avg ms".padStart(10) +
    "Max ms".padStart(10);
  console.log(header);
  console.log("-".repeat(67));

  let totalCalls = 0, totalOk = 0, totalFail = 0;

  for (const [cat, stat] of Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]))) {
    const avg = stat.latencies.length > 0 ? Math.round(stat.latencies.reduce((s, v) => s + v, 0) / stat.latencies.length) : 0;
    const max = stat.latencies.length > 0 ? Math.max(...stat.latencies) : 0;
    const pct = stat.calls > 0 ? ((stat.ok / stat.calls) * 100).toFixed(1) : "0.0";
    console.log(
      cat.padEnd(15) +
      String(stat.calls).padStart(8) +
      String(stat.ok).padStart(8) +
      String(stat.fail).padStart(8) +
      (pct + "%").padStart(8) +
      String(avg).padStart(10) +
      String(max).padStart(10)
    );
    totalCalls += stat.calls;
    totalOk += stat.ok;
    totalFail += stat.fail;
  }

  console.log("-".repeat(67));
  const totalPct = totalCalls > 0 ? ((totalOk / totalCalls) * 100).toFixed(1) : "0.0";
  console.log(
    "TOTALE".padEnd(15) +
    String(totalCalls).padStart(8) +
    String(totalOk).padStart(8) +
    String(totalFail).padStart(8) +
    (totalPct + "%").padStart(8)
  );

  console.log("\n  Chatbot:");
  console.log(`    Messaggi inviati a fake users: ${chatbotSent}`);
  console.log(`    Risposte ricevute dal bot:     ${chatbotReplied}`);
  console.log(`    Tasso di risposta:             ${chatbotSent > 0 ? ((chatbotReplied / chatbotSent) * 100).toFixed(1) + "%" : "N/A"}`);

  if (errorLog.length > 0) {
    console.log(`\n  Errori (${errorLog.length} totali, ultimi 50):`);
    const showErrors = errorLog.slice(-50);
    for (const err of showErrors) {
      console.log(`    [${err.time}] [${err.cat}] ${err.msg}`);
    }
  } else {
    console.log("\n  Errori: nessuno");
  }

  console.log("=".repeat(80) + "\n");
}

async function main() {
  console.log("=".repeat(80));
  console.log("  BikerLink Stress Test");
  console.log(`  Durata: ${DURATION_H}h | Ciclo: ${CYCLE_INTERVAL_S}s | Target: ${BASE_URL}`);
  console.log("=".repeat(80) + "\n");

  if (!USER1_ID || !USER1_PW || !USER2_ID || !USER2_PW) {
    console.error("ERRORE: Variabili d'ambiente mancanti.\n");
    console.error("Imposta:");
    console.error("  TEST_USER1_EMAIL=...");
    console.error("  TEST_USER1_PASSWORD=...");
    console.error("  TEST_USER2_EMAIL=...");
    console.error("  TEST_USER2_PASSWORD=...");
    console.error("  TEST_BASE_URL=http://localhost:5000  (opzionale)");
    console.error("  TEST_DURATION_H=4  (opzionale, default 4)");
    console.error("  TEST_CYCLE_S=30  (opzionale, default 30)");
    process.exit(1);
  }

  const loggedIn = await login();
  if (!loggedIn) {
    console.error("Login fallito, impossibile continuare.");
    process.exit(1);
  }

  await refreshFakeUserCache();

  const startTime = Date.now();
  let cycleCount = 0;

  process.on("SIGINT", () => {
    console.log("\n\nInterrotto dall'utente (Ctrl+C)\n");
    printReport();
    process.exit(0);
  });

  while (Date.now() - startTime < DURATION_MS) {
    cycleCount++;
    const elapsed = ((Date.now() - startTime) / 3600000).toFixed(2);
    const remaining = (((startTime + DURATION_MS) - Date.now()) / 3600000).toFixed(2);
    console.log(`\n--- Ciclo ${cycleCount} | Elapsed: ${elapsed}h | Remaining: ${remaining}h ---`);

    if (cycleCount % 20 === 0) {
      await refreshFakeUserCache();
    }

    if (cycleCount % 30 === 0) {
      log("ℹ", "AUTH", "Re-login per mantenere sessione...");
      await login();
    }

    const selectedActions: ActionEntry[] = [];
    const overdueActions = getAllOverdueActions();
    for (const a of overdueActions) {
      if (selectedActions.length < 5) selectedActions.push(a);
    }

    const targetCount = Math.min(5, Math.max(selectedActions.length, 3 + Math.floor(Math.random() * 3)));
    while (selectedActions.length < targetCount) {
      let added = false;
      for (let tries = 0; tries < 30 && !added; tries++) {
        const a = pickWeighted();
        if (!selectedActions.some((s) => s.name === a.name)) {
          selectedActions.push(a);
          added = true;
        }
      }
      if (!added) break;
    }

    log("ℹ", "CYCLE", `Running ${selectedActions.length} actions: ${selectedActions.map((a) => a.name).join(", ")}`);

    for (const action of selectedActions) {
      try {
        await action.fn();
        lastRun[action.name] = Date.now();
      } catch (e: any) {
        log("✗", action.name, `UNCAUGHT: ${e.message || e}`);
      }
    }

    const nextCycle = CYCLE_INTERVAL_S * 1000;
    await sleep(nextCycle);
  }

  console.log("\n\nTempo scaduto! Test completato.\n");
  printReport();
}

main().catch((e) => {
  console.error("FATAL:", e);
  printReport();
  process.exit(1);
});
