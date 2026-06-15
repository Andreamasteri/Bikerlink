import { storage } from "../../storage";
import { db } from "../../db";
import { motoClubs, motoClubMembers, users, messages as messagesTable } from "@shared/db";
import { eq, and, ne, count } from "drizzle-orm";
import { invalidateConvCache, escapeHtml } from "./utils";
import { notifyChatEvent } from "../../chat-sse";
import { sendChatPushNotifications, sendMotoclubPushNotifications } from "../../push-notifications";
import { sendEmail } from "../../email";
import { onlineTracker } from "../../online-tracker";

export const fakeBotMessageCounts = new Map<string, number>();
export const fakeBotLastReplies = new Map<string, string[]>();

export interface FakeUserContext {
  nickname: string;
  region?: string;
  bio?: string;
  brand?: string;
  model?: string;
  userType?: string;
  sex?: string;
  senderUserType?: string;
  senderSex?: string;
  senderNickname?: string;
}

const VULGAR_WORDS = ["tette", "culo", "scopare", "sesso", "nuda", "nudo", "pompino", "cazzo", "troia", "puttana", "figa", "zoccola", "porca", "succhia", "scopami", "spoglia", "topa", "chiappe", "bocchin"];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function maybeInformal(text: string): string {
  if (Math.random() < 0.25) {
    text = text.replace(/\bche\b/g, "ke").replace(/\bperché\b/gi, "xke").replace(/\bcomunque\b/gi, "cmq");
  }
  if (Math.random() < 0.15) {
    text = text.replace(/\bnon\b/g, "nn");
  }
  return text;
}

function maybeEmoji(text: string): string {
  if (Math.random() > 0.35) return text;
  const emojis = ["😄", "👍", "😊", "😁", "😎", "🤙", "😉", "🙈"];
  return text + " " + pick(emojis);
}

function avoidRepeat(reply: string, conversationId: string): string {
  const history = fakeBotLastReplies.get(conversationId) || [];
  if (history.includes(reply)) {
    const alts = ["ahah", "eh", "boh", "vabbè", "dai", "mah"];
    return reply + " " + pick(alts);
  }
  history.push(reply);
  if (history.length > 10) history.shift();
  fakeBotLastReplies.set(conversationId, history);
  return reply;
}

function isFakeZavorrina(ctx: FakeUserContext): boolean {
  return ctx.userType === "zavorrina_f" || ctx.userType === "zavorrina_m";
}

function isFakeBiker(ctx: FakeUserContext): boolean {
  return ctx.userType === "biker_m" || ctx.userType === "biker_f";
}

function isSenderBiker(ctx: FakeUserContext): boolean {
  return ctx.senderUserType === "biker_m" || ctx.senderUserType === "biker_f";
}

function isSenderZavorrina(ctx: FakeUserContext): boolean {
  return ctx.senderUserType === "zavorrina_f" || ctx.senderUserType === "zavorrina_m";
}

export function getFakeBotReply(content: string, conversationId: string, ctx: FakeUserContext): string {
  const count = fakeBotMessageCounts.get(conversationId) || 0;
  fakeBotMessageCounts.set(conversationId, count + 1);
  const lower = content.toLowerCase().trim();
  const region = ctx.region || "zona mia";
  const bike = ctx.brand && ctx.model ? `${ctx.brand} ${ctx.model}` : "";
  const isZav = isFakeZavorrina(ctx);
  const isBik = isFakeBiker(ctx);
  const senderIsBiker = isSenderBiker(ctx);
  const senderIsZav = isSenderZavorrina(ctx);
  const words = lower.split(/\s+/);
  const isShort = words.length <= 3;

  const isVulgar = VULGAR_WORDS.some(w => lower.includes(w));
  const isGreeting = ["ciao", "hey", "salve", "buongiorno", "buonasera", "ehi", "yo", "hola"].some(k => lower.includes(k));
  const isPushing = ["usciamo", "vediamo", "giro", "andiamo", "quando", "domani", "weekend", "sabato", "domenica", "stasera", "oggi", "uscire", "incontriamo", "vieni", "raggiungi", "dove ci", "ci troviamo", "partiamo", "pronti", "sei libero", "sei libera"].some(k => lower.includes(k));
  const isMotoTalk = ["moto", "mota", "cilindrata", "cavalli", "modello", "marca", "guido", "patente", "naked", "sport", "adventure", "touring", "enduro", "casco", "ducati", "yamaha", "honda", "kawasaki", "bmw", "ktm", "aprilia", "triumph", "guzzi"].some(k => lower.includes(k));
  const isWeather = ["tempo", "pioggia", "piove", "sole", "freddo", "caldo", "meteo", "vento"].some(k => lower.includes(k));
  const isLocation = ["zona", "dove stai", "dove sei", "di dove", "città", "paese", "abiti", "vivi"].some(k => lower.includes(k));
  const isConfused = lower.includes("scusa") || lower.includes("??") || lower === "?" || lower === "eh" || lower === "cosa";
  const isAppQuestion = ["app", "soldi", "pagare", "costo", "gratis", "abbonamento", "premium", "pagamento"].some(k => lower.includes(k));
  const isCompliment = ["bella", "bello", "carino", "carina", "figo", "figa", "simpatico", "simpatica", "attraente"].some(k => lower.includes(k));
  const isAge = ["anni", "età", "vecchio", "giovane", "grande"].some(k => lower.includes(k));

  let reply: string;

  if (isVulgar) {
    const vulgarReplies = [
      "Ma che stai a dì? Ciao proprio",
      "Guarda che ti segnalo eh",
      "Ma sei serio? Con me non funziona così",
      "Ok, bloccato. Ciao",
      "Ma vattene va, che roba",
      "Io con questi discorsi chiudo, ciao",
      "No grazie, cerca qualcun altro",
      "Ma che modo è? Vergognati",
    ];
    return pick(vulgarReplies);
  }

  if (count === 0 && isGreeting) {
    if (isZav && senderIsBiker) {
      reply = pick([
        `Ciao! Di dove sei? Io ${region}`,
        "Ehi ciao, che moto hai?",
        `Ciao! Tutto bene? Io sono di ${region}`,
        "Bella ciao! Da quanto guidi?",
      ]);
    } else if (isBik && senderIsZav) {
      reply = pick([
        `Ciao! Io sono di ${region}, te?`,
        "Ehi ciao, piacere! Come stai?",
        `Ciao! Qui in ${region} bella giornata`,
        "Ciao! Tu di dove sei?",
      ]);
    } else if (isBik && senderIsBiker) {
      reply = pick([
        `Uè ciao! Tu che moto hai?`,
        `Ciao! Io giro in ${region}, te?`,
        bike ? `Ciao! Io ho la ${bike}, te?` : "Ciao! Che moto hai?",
        "Ehi bella, come va? Da quanto guidi?",
      ]);
    } else {
      reply = pick([
        `Ciao! Io sono di ${region}, te di dove sei?`,
        "Ehi ciao, piacere!",
        "Ciao! Come stai?",
      ]);
    }
  } else if (count === 0) {
    reply = pick([
      "Ehi ciao, piacere",
      `Ciao! Io sono di ${region}`,
      "Oh ciao, come va?",
    ]);

  } else if (isConfused) {
    reply = pick([
      "Ahah scusa non avevo capito",
      "Eh? In che senso?",
      "Scusa mi sono spiegato male",
      "No niente, lascia stare",
      "Haha scusa, dicevo altro",
    ]);

  } else if (isShort && !isGreeting && !isPushing && !isMotoTalk && count > 0) {
    reply = pick([
      "In che senso?",
      "Dimmi",
      "Eh?",
      "Cioè?",
      "E poi?",
      "Vai avanti",
      "Tipo?",
    ]);

  } else if (isAppQuestion) {
    reply = pick([
      "No tranquillo è tutto gratis",
      "L'app è gratuita, non ti preoccupare",
      "No no non si paga niente",
      "Gratis gratis, stai tranquillo",
    ]);

  } else if (isPushing && count >= 5) {
    if (isZav) {
      reply = pick([
        "Guarda appena mi organizzo ti scrivo io",
        "Ahah dai calma, non è che posso uscire così su due piedi",
        "Senti ti faccio sapere io, promesso",
        "Eh lo so ma davvero non è periodo, poi vediamo",
        `Qua in ${region} è un po complicato adesso`,
        "Ma ci conosciamo appena, fammi prendere un po di fiducia dai",
      ]);
    } else {
      reply = pick([
        "Guarda ti faccio sapere io, adesso ho un sacco di roba",
        "Appena mi libero ti scrivo, tranquillo",
        `In ${region} sto periodo è complicato`,
        "Dai non ti preoccupare, quando si fa si fa",
        "Eh lo so che insisto anch'io a rimandare, ma davvero non riesco",
        "Prima devo sistemare un po di cose, poi ne parliamo",
      ]);
    }

  } else if (isPushing) {
    if (isZav) {
      reply = pick([
        "Mi piacerebbe ma devo vedere col lavoro",
        `Qua in ${region} piove da giorni`,
        "Forse la prossima settimana, ti faccio sapere",
        "Eh bello, però devo controllare gli impegni",
        "Adesso è un po complicato, magari più avanti",
        "Si dai vediamo, fammi capire come si mette il tempo",
        "Non è che non voglio eh, è che davvero non posso adesso",
      ]);
    } else {
      reply = pick([
        bike ? `Devo portare la ${bike} a fare il tagliando prima` : "Ho la moto ferma in questo periodo",
        `In ${region} col freddo che fa non mi muovo`,
        "Sto periodo il lavoro mi ammazza, vediamo tra un po",
        "Si dai ne parliamo, fammi controllare la settimana prossima",
        "Bella idea ma adesso non riesco, ti faccio sapere",
        bike ? `La ${bike} ha un problemino, devo prima sistemarla` : "Devo prima sistemare la moto",
      ]);
    }

  } else if (isMotoTalk) {
    if (isZav) {
      reply = pick([
        "Io non ho la moto ma mi piace tanto andare come passeggera",
        "A me piacciono tanto le moto grosse, tipo adventure",
        "Non ho la patente della moto ma prima o poi la faccio",
        "Mi piacciono le moto comode, quelle da viaggio",
        "Che moto hai te? Io le adoro ma non ne ho una mia",
        "Un mio amico ha una Ducati ed è bellissima",
      ]);
    } else if (isBik && senderIsBiker) {
      reply = pick([
        bike ? `Io ho la ${bike}, tu?` : "Tu che moto hai?",
        bike ? `Con la ${bike} mi trovo da dio` : "La mia moto va alla grande",
        "Quanti km fai all'anno? Io un bel po",
        bike ? `La ${bike} consuma un po ma ne vale la pena` : "La mia consuma un po ma ne vale la pena",
        "Tu che tipo di giri fai? Stradali o off road?",
        bike ? `Ho fatto la ${bike} revisionare da poco, va che è una meraviglia` : "L'ho fatta revisionare da poco",
      ]);
    } else {
      reply = pick([
        bike ? `Ho la ${bike}, se vuoi un giorno ti porto a fare un giro` : "Appena posso ti porto a fare un giro",
        bike ? `La ${bike} è comoda anche per il passeggero` : "La mia è comoda anche per il passeggero",
        "Ti piacciono le moto? Che tipo preferisci?",
        bike ? `Con la ${bike} ho girato mezza Italia` : "Ho girato mezza Italia in moto",
      ]);
    }

  } else if (isCompliment && count > 0) {
    if (isZav) {
      reply = pick([
        "Ahah grazie, sei gentile",
        "Dai non esagerare",
        "Haha troppo gentile",
        "Grazie! Anche tu sembri simpatico",
      ]);
    } else {
      reply = pick([
        "Grazie! Sei gentile",
        "Ahah dai, troppo buono",
        "Ma dai, grazie",
      ]);
    }

  } else if (isAge) {
    reply = pick([
      "Non si chiede l'età ahah",
      "Eh abbastanza per guidare, diciamo così",
      "L'età giusta per godersi la moto",
    ]);

  } else if (isWeather) {
    reply = pick([
      `Qua in ${region} fa schifo ultimamente`,
      "Con sto tempo non si va da nessuna parte",
      "Speriamo si rimetta presto",
      `In ${region} quando c'è il sole però è uno spettacolo`,
    ]);

  } else if (isLocation) {
    reply = pick([
      `Io sto in ${region}, bella zona per guidare`,
      `Sono di ${region}, conosci?`,
      `${region}. Ci sono delle strade bellissime da queste parti`,
    ]);

  } else {
    if (isZav && senderIsBiker && count < 4) {
      reply = pick([
        "Tu che moto hai? Sono curiosa",
        "Da quanto tempo guidi?",
        "Ti piace andare in giro?",
        `Io abito in ${region}, te di dove sei?`,
        "Ma tu giri da solo o con un gruppo?",
        "Che tipo di strade ti piacciono di più?",
      ]);
    } else if (isBik && senderIsZav && count < 4) {
      reply = pick([
        "Sei mai salita in moto?",
        `Di dove sei? Io sono di ${region}`,
        "Ti piacciono le moto o è la prima volta?",
        bike ? `Se vuoi un giorno ti faccio fare un giro sulla ${bike}` : "Se vuoi un giorno ti faccio fare un giro",
        "Cosa ti ha fatto scaricare l'app?",
      ]);
    } else if (isBik && senderIsBiker && count < 4) {
      reply = pick([
        "Tu che giri fai di solito?",
        `Io di solito giro in ${region}`,
        "Hai mai fatto viaggi lunghi in moto?",
        "Preferisci le strade di montagna o di mare?",
        bike ? `Io con la ${bike} faccio soprattutto stradali` : "Io faccio soprattutto giri stradali",
      ]);
    } else {
      reply = pick([
        "Si vero",
        "Eh capisco",
        "Ah ok",
        "Mah si",
        "Boh vediamo",
        "Si dai",
        `Qui in ${region} è così`,
        "Anche a me capita",
        "Già",
        "Ma si",
      ]);
    }
  }

  reply = maybeInformal(reply);
  reply = maybeEmoji(reply);
  reply = avoidRepeat(reply, conversationId);
  return reply;
}

export async function handleNotifications(conversationId: string, senderId: string, message: { messageType: string; content?: string }, participants: Array<{ userId: string }>) {
  const { messageType, content: finalContent } = message;

  const nonSenderIds = participants.filter((p) => p.userId !== senderId).map((p) => p.userId);
  if (nonSenderIds.length === 0) return;

  const [conversation, senderUser, targetUsers] = await Promise.all([
    storage.getConversation(conversationId),
    storage.getUser(senderId),
    storage.getUsersByIds(nonSenderIds),
  ]);

  const userMap = new Map(targetUsers.filter(Boolean).map((u) => [u!.id, u!]));

  let motoclubMeta: { id: string; name: string } | null = null;
  if (conversation?.conversationType === "motoclub") {
    const clubRow = await db
      .select({ id: motoClubs.id, name: motoClubs.name })
      .from(motoClubs)
      .where(eq(motoClubs.conversationId, conversationId))
      .limit(1);
    motoclubMeta = clubRow[0] || null;
  }

  const profileResults = await Promise.all(
    nonSenderIds.map((uid) => storage.getUserProfile(uid))
  );
  const profileMap = new Map(nonSenderIds.map((uid, i) => [uid, profileResults[i]]));

  for (const p of participants) {
    if (p.userId === senderId) continue;

    const targetUser = userMap.get(p.userId);
    if (!targetUser) continue;

    if (targetUser.expoPushToken) {
      let pushPreview: string;
      if (messageType === "image") pushPreview = "📸 Foto";
      else if (messageType === "location") pushPreview = "📍 Posizione";
      else {
        const rawText = finalContent ?? "";
        pushPreview = rawText.length > 120 ? rawText.substring(0, 120) + "…" : rawText;
      }
      if (conversation?.conversationType === "motoclub") {
        sendMotoclubPushNotifications([p.userId], {
          title: motoclubMeta ? motoclubMeta.name : "Club chat",
          body: `${senderUser?.nickname ?? "Un membro"}: ${pushPreview}`,
          clubId: motoclubMeta?.id,
        });
      } else {
        sendChatPushNotifications([p.userId], {
          senderNickname: senderUser?.nickname ?? "Un utente",
          preview: pushPreview,
          conversationId: conversationId,
        });
      }
    }

    const targetProfile = profileMap.get(p.userId);
    const emailPref = !!targetProfile?.emailChatNotifications;
    const hasEmail = !!targetUser.email;
    const isOnline = onlineTracker.isOnline(p.userId);

    if (!emailPref) {
      console.log(`[EMAIL-NOTIFY] userId=${p.userId} result=skipped_pref emailPref=false`);
    } else if (!hasEmail) {
      console.log(`[EMAIL-NOTIFY] userId=${p.userId} result=skipped_no_email`);
    } else if (isOnline) {
      console.log(`[EMAIL-NOTIFY] userId=${p.userId} result=skipped_online`);
    } else {
      console.log(`[EMAIL-NOTIFY] userId=${p.userId} result=sent emailPref=true isOnline=false`);
      const senderNick = escapeHtml(senderUser?.nickname ?? "Un utente");
      let preview: string;
      if (messageType === "image") {
        preview = "📸 ha inviato una foto";
      } else if (messageType === "location") {
        preview = "📍 ha condiviso una posizione";
      } else {
        const rawText = finalContent ?? "";
        const truncated = rawText.length > 120 ? rawText.substring(0, 120) + "…" : rawText;
        preview = escapeHtml(truncated);
      }
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
          <div style="text-align:center;margin-bottom:24px;">
            <h1 style="color:#FF6B35;margin:0;font-size:26px;">🏍️ BikerLink</h1>
            <p style="color:#888;font-size:13px;margin-top:4px;">U'll never ride alone</p>
          </div>
          <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
            <h2 style="margin-top:0;font-size:18px;">Nuovo messaggio da ${senderNick}</h2>
            ${preview ? `<div style="background:#22222e;border-radius:8px;padding:14px;margin:16px 0;color:#ddd;font-size:15px;line-height:1.5;">${preview}</div>` : ""}
            <p style="color:#999;font-size:13px;line-height:1.5;margin-bottom:0;">
              Apri BikerLink per rispondere.
            </p>
          </div>
          <p style="text-align:center;color:#666;font-size:12px;margin-top:20px;">
            &copy; ${new Date().getFullYear()} BikerLink &mdash; Puoi disattivare questa notifica dal tab Chat dell'app.
          </p>
        </div>
      `;
      sendEmail(targetUser.email, "Nuovo messaggio su BikerLink", html).catch((err) => console.error("[EMAIL] Invio notifica chat fallito:", err));
    }
  }
}

export async function handleFakeReplies(conversationId: string, senderId: string, finalContent: string, participants: Array<{ userId: string }>) {
  const [conversation, chatbotSetting] = await Promise.all([
    storage.getConversation(conversationId),
    storage.getAppSetting("chatbot_enabled"),
  ]);

  if (conversation?.conversationType !== "motoclub") return;
  if (chatbotSetting?.value === "false") return;

  const clubRow = await db
    .select({ id: motoClubs.id })
    .from(motoClubs)
    .where(eq(motoClubs.conversationId, conversationId))
    .limit(1);

  if (!clubRow[0]) return;

  const fakeMembers = await db
    .select({ userId: motoClubMembers.userId })
    .from(motoClubMembers)
    .innerJoin(users, eq(motoClubMembers.userId, users.id))
    .where(and(
      eq(motoClubMembers.clubId, clubRow[0].id),
      eq(motoClubMembers.status, "active"),
      eq(users.isFake, true),
      ne(motoClubMembers.userId, senderId),
    ));

  if (fakeMembers.length === 0) return;

  const randomFake = fakeMembers[Math.floor(Math.random() * fakeMembers.length)];
  const fakeUserId = randomFake.userId;

  if (!fakeBotMessageCounts.has(conversationId)) {
    const [countRow] = await db
      .select({ cnt: count() })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId));
    fakeBotMessageCounts.set(conversationId, countRow?.cnt ?? 0);
  }

  storage.recordFakeUserInteraction(fakeUserId, senderId, "chat_message").catch(() => {});

  const [fakeUser, fakeProfile, fakeMotoList, senderUserForCtx] = await Promise.all([
    storage.getUser(fakeUserId),
    storage.getUserProfile(fakeUserId),
    storage.getUserMotorcycles(fakeUserId),
    storage.getUser(senderId),
  ]);

  const firstMoto = fakeMotoList[0];
  const fakeCtx: FakeUserContext = {
    nickname: fakeUser?.nickname || "Rider",
    region: fakeUser?.region || undefined,
    bio: fakeProfile?.bio || undefined,
    brand: firstMoto?.brand || undefined,
    model: firstMoto?.model || undefined,
    userType: fakeUser?.userType || undefined,
    sex: fakeUser?.sex || undefined,
    senderUserType: senderUserForCtx?.userType || undefined,
    senderSex: senderUserForCtx?.sex || undefined,
    senderNickname: senderUserForCtx?.nickname || undefined,
  };
  const contentLen = finalContent?.length || 0;
  const delay = contentLen > 50 ? 2500 + Math.random() * 2000 : 1500 + Math.random() * 2000;
  setTimeout(async () => {
    try {
      const replyText = getFakeBotReply(finalContent || "", conversationId, fakeCtx);
      const fakeMsg = await storage.createMessage({
        conversationId: conversationId,
        senderId: fakeUserId,
        messageType: "text",
        content: replyText,
        imageUrl: null,
        latitude: null,
        longitude: null,
        isFiltered: false,
      });
      await storage.updateConversationTimestamp(conversationId);
      participants.forEach(p => invalidateConvCache(p.userId));
      notifyChatEvent(
        participants.map(p => p.userId),
        { type: "new_message", conversationId: conversationId, message: { ...fakeMsg, sender: { id: fakeUserId, nickname: fakeUser?.nickname, avatarUrl: fakeUser?.avatarUrl, userType: fakeUser?.userType } } }
      );
    } catch (err) {
      console.error("Motoclub fake reply error:", err);
    }
  }, delay);
}
