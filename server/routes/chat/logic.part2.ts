import { storage } from "../../storage";
import { db } from "../../db";
import { motoClubs, motoClubMembers, users, messages as messagesTable } from "@shared/db";
import { eq, and, ne, count } from "drizzle-orm";
import { invalidateConvCache } from "./utils";
import { notifyChatEvent } from "../../chat-sse";
import { getFakeBotReply, type FakeUserContext, fakeBotMessageCounts } from "./logic";

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
