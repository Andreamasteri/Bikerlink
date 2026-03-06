import { Router, type Request, type Response } from "express";
import { storage } from "../storage";

const router = Router();

const fakeBotMessageCounts = new Map<string, number>();
const fakeBotLastReplies = new Map<string, string[]>();

interface FakeUserContext {
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

const VULGAR_WORDS = ["tette", "culo", "scopare", "sesso", "nuda", "nudo", "pompino", "cazzo", "troia", "puttana", "figa", "zoccola", "porca", "succhia", "scopami", "spoglia", "topa", "chiappe", "bocchin"];

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

function getFakeBotReply(content: string, conversationId: string, ctx: FakeUserContext): string {
  const count = fakeBotMessageCounts.get(conversationId) || 0;
  fakeBotMessageCounts.set(conversationId, count + 1);
  const lower = content.toLowerCase().trim();
  const region = ctx.region || "zona mia";
  const bike = ctx.brand && ctx.model ? `${ctx.brand} ${ctx.model}` : "";
  const hasBike = !!bike;
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

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

const PHONE_REGEX = /(?:\+?\d[\d\s\-().]{6,}\d|\b\d{3}[\s\-.]?\d{3}[\s\-.]?\d{4}\b)/g;

async function filterPhoneNumbers(content: string, conversationId: string, senderId: string): Promise<{ filtered: string; wasFiltered: boolean }> {
  const matches = content.match(PHONE_REGEX);
  if (!matches || matches.length === 0) {
    return { filtered: content, wasFiltered: false };
  }

  const currentCount = await storage.getPhoneSharedCount(conversationId, senderId);

  if (currentCount === 0) {
    await storage.incrementPhoneSharedCount(conversationId, senderId);
    return { filtered: content, wasFiltered: false };
  }

  const filtered = content.replace(PHONE_REGEX, "[numero bloccato]");
  return {
    filtered: filtered + "\n\n⚠ Per la tua sicurezza, puoi condividere il tuo numero di telefono solo una volta per conversazione.",
    wasFiltered: true,
  };
}

router.get("/conversations", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const convs = await storage.getConversations(userId);

    const result = await Promise.all(
      convs.map(async (conv) => {
        const participants = await storage.getConversationParticipants(conv.id);
        const msgs = await storage.getMessages(conv.id, 1, 0);
        const lastMessage = msgs[0] || null;

        const participantUsers = await Promise.all(
          participants.map(async (p) => {
            const user = await storage.getUser(p.userId);
            return user
              ? { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, userType: user.userType }
              : null;
          })
        );

        const myParticipant = participants.find((p) => p.userId === userId);
        const unreadCount = lastMessage && myParticipant?.lastReadAt
          ? new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt) ? 1 : 0
          : lastMessage ? 1 : 0;

        return {
          ...conv,
          participants: participantUsers.filter(Boolean),
          lastMessage,
          unreadCount,
        };
      })
    );

    return res.json(result);
  } catch (error) {
    console.error("Get conversations error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/conversations", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { conversationType, title, proposalId, participantIds } = req.body;

    if (conversationType === "contact" && participantIds?.length === 1) {
      const targetUserId = participantIds[0];
      const targetConvs = await storage.getConversations(targetUserId);
      const existingContactConv = targetConvs.find((c) => c.conversationType === "contact");

      if (existingContactConv) {
        const parts = await storage.getConversationParticipants(existingContactConv.id);
        const alreadyParticipant = parts.some((p) => p.userId === userId);
        if (!alreadyParticipant) {
          await storage.addConversationParticipant({
            conversationId: existingContactConv.id,
            userId,
          });
        }
        return res.json(existingContactConv);
      }

      const conv = await storage.createConversation({
        conversationType: "contact",
        title: title || null,
        proposalId: proposalId || null,
      });

      await storage.addConversationParticipant({
        conversationId: conv.id,
        userId: targetUserId,
      });
      await storage.addConversationParticipant({
        conversationId: conv.id,
        userId,
      });

      return res.status(201).json(conv);
    }

    if (conversationType === "private" && participantIds?.length === 1) {
      const otherUserId = participantIds[0];
      const existingConvs = await storage.getConversations(userId);
      for (const conv of existingConvs) {
        if (conv.conversationType !== "private") continue;
        const parts = await storage.getConversationParticipants(conv.id);
        if (parts.length === 2) {
          const ids = parts.map((p) => p.userId);
          if (ids.includes(userId) && ids.includes(otherUserId)) {
            return res.json(conv);
          }
        }
      }
    }

    if (conversationType === "group" && proposalId) {
      const existingConvs = await storage.getConversations(userId);
      const existingGroupConv = existingConvs.find(
        (c) => c.conversationType === "group" && c.proposalId === proposalId
      );
      if (existingGroupConv) {
        return res.json(existingGroupConv);
      }
    }

    const conv = await storage.createConversation({
      conversationType: conversationType || "private",
      title: title || null,
      proposalId: proposalId || null,
    });

    await storage.addConversationParticipant({
      conversationId: conv.id,
      userId,
    });

    if (participantIds && Array.isArray(participantIds)) {
      for (const pid of participantIds) {
        if (pid !== userId) {
          await storage.addConversationParticipant({
            conversationId: conv.id,
            userId: pid,
          });
          const targetUser = await storage.getUser(pid);
          if (targetUser?.isFake) {
            storage.recordFakeUserInteraction(pid, userId, "chat_request").catch(() => {});
          }
        }
      }
    }

    return res.status(201).json(conv);
  } catch (error) {
    console.error("Create conversation error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const participants = await storage.getConversationParticipants(id);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
    }

    const msgs = await storage.getMessages(id, limit, offset);

    const result = await Promise.all(
      msgs.map(async (msg) => {
        const sender = await storage.getUser(msg.senderId);
        return {
          ...msg,
          sender: sender
            ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType }
            : null,
        };
      })
    );

    await storage.updateConversationLastRead(id, userId);

    return res.json(result);
  } catch (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/conversations/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const { messageType, content, imageUrl, latitude, longitude } = req.body;

    const participants = await storage.getConversationParticipants(id);
    if (!participants.find((p) => p.userId === userId)) {
      return res.status(403).json({ message: "Non fai parte di questa conversazione" });
    }

    let finalContent = content;
    let isFiltered = false;

    if (messageType === "text" && content) {
      const result = await filterPhoneNumbers(content, id, userId);
      finalContent = result.filtered;
      isFiltered = result.wasFiltered;
    }

    const message = await storage.createMessage({
      conversationId: id,
      senderId: userId,
      messageType: messageType || "text",
      content: finalContent,
      imageUrl: imageUrl || null,
      latitude: latitude || null,
      longitude: longitude || null,
      isFiltered,
    });

    await storage.updateConversationTimestamp(id);

    for (const p of participants) {
      if (p.userId !== userId) {
        const targetUser = await storage.getUser(p.userId);
        if (targetUser?.isFake) {
          storage.recordFakeUserInteraction(p.userId, userId, "chat_message").catch(() => {});

          const fakeUserId = p.userId;
          const convId = id;
          const userContent = finalContent || "";
          const contentLen = userContent.length;
          const delay = contentLen > 50 ? 2000 + Math.random() * 2000 : 1000 + Math.random() * 2000;

          const fakeProfile = await storage.getUserProfile(fakeUserId);
          const fakeMotoList = await storage.getUserMotorcycles(fakeUserId);
          const firstMoto = fakeMotoList[0];
          const senderUser = await storage.getUser(userId);
          const fakeCtx: FakeUserContext = {
            nickname: targetUser.nickname,
            region: targetUser.region || undefined,
            bio: fakeProfile?.bio || undefined,
            brand: firstMoto?.brand || undefined,
            model: firstMoto?.model || undefined,
            userType: targetUser.userType || undefined,
            sex: targetUser.sex || undefined,
            senderUserType: senderUser?.userType || undefined,
            senderSex: senderUser?.sex || undefined,
            senderNickname: senderUser?.nickname || undefined,
          };

          setTimeout(async () => {
            try {
              const replyText = getFakeBotReply(userContent, convId, fakeCtx);
              await storage.createMessage({
                conversationId: convId,
                senderId: fakeUserId,
                messageType: "text",
                content: replyText,
                imageUrl: null,
                latitude: null,
                longitude: null,
                isFiltered: false,
              });
              await storage.updateConversationTimestamp(convId);
            } catch (err) {
              console.error("Fake bot reply error:", err);
            }
          }, delay);
        }
      }
    }

    const sender = await storage.getUser(userId);

    return res.status(201).json({
      ...message,
      sender: sender
        ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl, userType: sender.userType }
        : null,
    });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
