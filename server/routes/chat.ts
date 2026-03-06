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
}

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function maybeInformal(text: string): string {
  if (Math.random() < 0.3) {
    text = text.replace(/\bche\b/gi, "ke").replace(/\bperché\b/gi, "xke").replace(/\bcomunque\b/gi, "cmq");
  }
  if (Math.random() < 0.2) {
    text = text.replace(/\bnon\b/gi, "nn");
  }
  return text;
}

function maybeEmoji(text: string): string {
  if (Math.random() > 0.45) return text;
  const emojis = ["😄", "🏍️", "👍", "😊", "💪", "🔥", "😁", "✌️", "😎", "🤙"];
  return text + " " + pick(emojis);
}

function avoidRepeat(reply: string, conversationId: string): string {
  const history = fakeBotLastReplies.get(conversationId) || [];
  if (history.includes(reply)) {
    return reply + (Math.random() > 0.5 ? " ahah" : " eh");
  }
  history.push(reply);
  if (history.length > 8) history.shift();
  fakeBotLastReplies.set(conversationId, history);
  return reply;
}

function getFakeBotReply(content: string, conversationId: string, ctx: FakeUserContext): string {
  const count = fakeBotMessageCounts.get(conversationId) || 0;
  fakeBotMessageCounts.set(conversationId, count + 1);
  const lower = content.toLowerCase();
  const region = ctx.region || "la mia zona";
  const bike = ctx.brand && ctx.model ? `${ctx.brand} ${ctx.model}` : "";

  const isGreeting = ["ciao", "hey", "salve", "buongiorno", "buonasera", "ehi", "yo", "hola", "bella"].some(k => lower.includes(k));
  const isPushing = ["usciamo", "vediamo", "giro", "andiamo", "quando", "domani", "weekend", "sabato", "domenica", "stasera", "oggi", "uscire", "incontriamo", "vieni", "raggiungi", "dove ci", "ci troviamo", "partiamo", "pronti", "sei libero", "sei libera"].some(k => lower.includes(k));
  const isMotoTalk = ["moto", "mota", "cilindrata", "cavalli", "modello", "marca", "guido", "patente", "naked", "sport", "adventure", "touring", "enduro", "scooter", "casco"].some(k => lower.includes(k));
  const isQuestion = lower.includes("?") || ["come", "dove", "cosa", "quanto", "quale", "chi"].some(k => lower.startsWith(k));
  const isWeather = ["tempo", "pioggia", "piove", "sole", "freddo", "caldo", "meteo", "vento"].some(k => lower.includes(k));
  const isLocation = ["zona", "dove stai", "dove sei", "di dove", "città", "paese", "abiti"].some(k => lower.includes(k));

  let reply: string;

  if (count === 0 && isGreeting) {
    const greetings = [
      `Ehi ciao! Io sto in ${region}, te di dove sei?`,
      "Come va? da quanto sei sull'app?",
      `Bella! Io sono di ${region}`,
      "Ciao! Tutto bene? Tu che moto hai?",
      "Ehi piacere! Da quanto tempo guidi?",
      `Uè ciao! Qui in ${region} oggi c'è un tempo assurdo`,
    ];
    reply = pick(greetings);
  } else if (count === 0) {
    const firstContact = [
      "Ehi ciao, piacere!",
      `Ciao! Io sono di ${region}, te?`,
      "Oh bella, ciao! Come va?",
    ];
    reply = pick(firstContact);
  } else if (isPushing && count >= 5) {
    const veryEvasive = [
      "Guarda ti scrivo io appena mi libero, promesso",
      "Ahah ma nn è ke sei un po troppo precipitoso? calma dai",
      "Eh lasciami respirare un attimo, sto periodo è pesante",
      "Senti appena posso ti faccio sapere io ok?",
      "Ma si dai, prima o poi si fa! nn ti preoccupare",
      `Qua in ${region} è un periodaccio, vediamo più avanti`,
      "Onestamente adesso nn riesco proprio, ma rimaniamo in contatto",
      "Dai nn insistere troppo, ti scrivo io quando riesco",
    ];
    reply = pick(veryEvasive);
  } else if (isPushing) {
    const evasive = [
      `Qua in ${region} piove da tipo una settimana di fila`,
      bike ? `La ${bike} è dal meccanico, mi han detto minimo 2 settimane` : "Ho la moto dal meccanico, nn so quando me la ridanno",
      "Sto periodo col lavoro nn ho un attimo libero",
      "Bella idea ma devo prima capire i turni della prossima settimana",
      "Eh magari, ma devo vedere come si mette il tempo",
      "Si ne parliamo, fammi controllare gli impegni",
      "In teoria si ma dipende dal lavoro, ti faccio sapere",
      "Col freddo che fa adesso nn mi va tanto di tirare fuori la moto",
      bike ? `Devo prima far fare il tagliando alla ${bike}, è un po ke rimando` : "Devo prima fare il tagliando, è un po ke rimando",
      "Adesso è complicato, forse tra un paio di settimane",
    ];
    reply = pick(evasive);
  } else if (isMotoTalk) {
    const motoReplies = bike
      ? [
          `Io giro con la ${bike}, mi ci trovo benissimo`,
          `La ${bike} è una gran moto, ce l'ho da un po e nn la cambierei`,
          `Con la ${bike} ho fatto un sacco di km quest'anno`,
          `Si la ${bike} va forte, l'unica cosa è ke consuma un po`,
          "Tu che moto hai? Fai tanti km?",
          `Io alla ${bike} ci sono affezionato, ormai è come una di famiglia`,
        ]
      : [
          "Io ho sempre avuto un debole per le naked",
          "Tu che moto hai? Sono curioso",
          "A me piacciono le moto comode per i viaggi lunghi",
          "Da quanto guidi? Io da un bel po ormai",
        ];
    reply = pick(motoReplies);
  } else if (isWeather) {
    const weatherReplies = [
      `Qua in ${region} il tempo fa schifo ultimamente`,
      "Eh si con sto tempo nn si va da nessuna parte",
      "Speriamo ke si rimetta presto, ho voglia di uscire",
      `In ${region} quando c'è il sole è spettacolare però`,
      "Il meteo dice ke migliora la prossima settimana",
    ];
    reply = pick(weatherReplies);
  } else if (isLocation) {
    const locationReplies = [
      `Io sto in ${region}, è una bella zona per guidare`,
      `Sono di ${region}, te di dove?`,
      `${region}, conosci? Ci sono delle strade bellissime`,
      `Sto in ${region}. Non è male x i giri in moto`,
    ];
    reply = pick(locationReplies);
  } else if (isQuestion && count < 4) {
    const questionReplies = [
      "Eh bella domanda, ci devo pensare",
      "Mah guarda, dipende un po dai giorni",
      "Si più o meno, te?",
      "Eh ni, nel senso dipende",
      "Diciamo di si, anche se nn sempre",
      "Tu ke ne pensi?",
    ];
    reply = pick(questionReplies);
  } else {
    const conversational = [
      "Si hai ragione",
      "Eh vero, ci sta",
      "Ma si dai, capisco",
      "Ah ok, interessante",
      "Eh si succede",
      "Beh dai nn male",
      "Si esatto, la penso uguale",
      "Tu ke dici? io nn saprei",
      "Da quanto tempo sei sull'app?",
      "Vero, anche a me è capitato",
      "Mah si, più o meno",
      "Capisco si, ti do ragione",
      bike ? `Io cmq appena posso prendo la ${bike} e mi faccio un giro` : "Io cmq appena posso mi faccio un giro",
      `Qui in ${region} la situazione è così così`,
    ];
    reply = pick(conversational);
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
          const fakeCtx: FakeUserContext = {
            nickname: targetUser.nickname,
            region: fakeProfile?.region || undefined,
            bio: fakeProfile?.bio || undefined,
            brand: firstMoto?.brand || undefined,
            model: firstMoto?.model || undefined,
            userType: targetUser.userType || undefined,
            sex: targetUser.sex || undefined,
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
