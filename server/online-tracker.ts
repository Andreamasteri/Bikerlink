import { PROTECTED_NICKNAMES } from "./constants";

interface TrackedUser {
  role: string;
  nickname: string;
  status: string;
  userType: string;
  isAvailable: boolean;
  ghostMode: boolean;
  country: string | null;
  isFake: boolean;
  isSystem: boolean;
  lastSeen: Date;
}

// Task #2794: prefer the dedicated `isSystem` flag, with admin role and
// PROTECTED_NICKNAMES kept as legacy fallbacks.
function isSystemEntry(entry: Pick<TrackedUser, "role" | "nickname" | "isSystem">): boolean {
  return entry.isSystem === true || entry.role === "admin" || PROTECTED_NICKNAMES.includes(entry.nickname);
}

export class OnlineTracker {
  private users = new Map<string, TrackedUser>();
  private cleanupInterval: NodeJS.Timeout;
  private offlineCallback?: (userId: string) => void;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.cleanupInterval.unref();
  }

  setOfflineCallback(cb: (userId: string) => void): void {
    this.offlineCallback = cb;
  }

  private triggerOffline(userId: string): void {
    if (this.offlineCallback) {
      try { this.offlineCallback(userId); } catch { /* no-op: offline callback failure */ }
    }
  }

  private cleanup(): void {
    // TTL 30 min: Android sospende JS in background, il heartbeat (ogni 2 min) si ferma.
    // Con 15 min l'utente veniva rimosso già dopo poco tempo in background.
    // 30 min riduce i falsi "offline" per app iconizzate senza Firebase.
    // Quando torna in foreground, il heartbeat immediato (AppStateHandler) la reidrata.
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    for (const [userId, entry] of this.users) {
      if (entry.lastSeen < cutoff) {
        this.users.delete(userId);
        this.triggerOffline(userId);
      }
    }
  }

  setOnline(userId: string, data: Omit<TrackedUser, "lastSeen">): void {
    // Task #1236: system accounts (admin role OR protected nickname) are never
    // tracked — they must not appear in map counters or heartbeat lists.
    // Task #1533: fake/seed accounts (isFake=true) are also excluded from the
    // tracker so that map counters and lists only reflect real users.
    if (isSystemEntry(data) || data.status !== "active" || data.isFake) {
      this.users.delete(userId);
      return;
    }
    this.users.set(userId, { ...data, lastSeen: new Date() });
  }

  setOffline(userId: string): void {
    if (this.users.has(userId)) {
      this.users.delete(userId);
      this.triggerOffline(userId);
    }
  }

  setAvailability(userId: string, isAvailable: boolean): void {
    const entry = this.users.get(userId);
    if (entry) {
      entry.isAvailable = isAvailable;
      entry.lastSeen = new Date();
    }
  }

  setGhostMode(userId: string, ghostMode: boolean): void {
    const entry = this.users.get(userId);
    if (entry) {
      entry.ghostMode = ghostMode;
      if (ghostMode) entry.isAvailable = false;
      entry.lastSeen = new Date();
    }
  }

  touch(userId: string): boolean {
    const entry = this.users.get(userId);
    if (entry) {
      entry.lastSeen = new Date();
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return this.users.has(userId);
  }

  getLastSeen(userId: string): Date | null {
    return this.users.get(userId)?.lastSeen ?? null;
  }

  countOnlineUsers(countries?: string[]): number {
    let count = 0;
    for (const entry of this.users.values()) {
      if (isSystemEntry(entry) || entry.status !== "active" || entry.isFake) continue;
      if (entry.ghostMode) continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      count++;
    }
    return count;
  }

  countAvailableBikers(countries?: string[]): number {
    let count = 0;
    for (const entry of this.users.values()) {
      if (isSystemEntry(entry) || entry.status !== "active" || entry.isFake) continue;
      if (!entry.isAvailable || entry.ghostMode) continue;
      if (entry.userType !== "biker" && entry.userType !== "coppia") continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      count++;
    }
    return count;
  }

  countAvailableZavorrine(countries?: string[]): number {
    let count = 0;
    for (const entry of this.users.values()) {
      if (isSystemEntry(entry) || entry.status !== "active" || entry.isFake) continue;
      if (!entry.isAvailable || entry.ghostMode) continue;
      if (entry.userType !== "zavorrina") continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      count++;
    }
    return count;
  }

  getOnlineUserIds(countries?: string[]): string[] {
    const ids: string[] = [];
    for (const [userId, entry] of this.users) {
      if (isSystemEntry(entry) || entry.status !== "active" || entry.isFake) continue;
      if (entry.ghostMode) continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      ids.push(userId);
    }
    return ids;
  }

  getAvailableBikerIds(countries?: string[]): string[] {
    const ids: string[] = [];
    for (const [userId, entry] of this.users) {
      if (isSystemEntry(entry) || entry.status !== "active" || entry.isFake) continue;
      if (!entry.isAvailable || entry.ghostMode) continue;
      if (entry.userType !== "biker" && entry.userType !== "coppia") continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      ids.push(userId);
    }
    return ids;
  }

  getAvailableZavorrinaIds(countries?: string[]): string[] {
    const ids: string[] = [];
    for (const [userId, entry] of this.users) {
      if (isSystemEntry(entry) || entry.status !== "active" || entry.isFake) continue;
      if (!entry.isAvailable || entry.ghostMode) continue;
      if (entry.userType !== "zavorrina") continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      ids.push(userId);
    }
    return ids;
  }

  size(): number {
    return this.users.size;
  }
}

export const onlineTracker = new OnlineTracker();
