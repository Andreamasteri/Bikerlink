interface TrackedUser {
  role: string;
  status: string;
  userType: string;
  isAvailable: boolean;
  ghostMode: boolean;
  country: string | null;
  lastSeen: Date;
}

export class OnlineTracker {
  private users = new Map<string, TrackedUser>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.cleanupInterval.unref();
  }

  private cleanup(): void {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    for (const [userId, entry] of this.users) {
      if (entry.lastSeen < cutoff) {
        this.users.delete(userId);
      }
    }
  }

  setOnline(userId: string, data: Omit<TrackedUser, "lastSeen">): void {
    // Task #1212: admins are never tracked — they must not appear in map
    // counters or the heartbeat list returned to non-admin callers.
    if (data.role === "admin" || data.status !== "active") {
      this.users.delete(userId);
      return;
    }
    this.users.set(userId, { ...data, lastSeen: new Date() });
  }

  setOffline(userId: string): void {
    this.users.delete(userId);
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

  countOnlineUsers(countries?: string[]): number {
    let count = 0;
    for (const entry of this.users.values()) {
      if (entry.role === "admin" || entry.status !== "active") continue;
      if (entry.ghostMode) continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      count++;
    }
    return count;
  }

  countAvailableBikers(countries?: string[]): number {
    let count = 0;
    for (const entry of this.users.values()) {
      if (entry.role === "admin" || entry.status !== "active") continue;
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
      if (entry.role === "admin" || entry.status !== "active") continue;
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
      if (entry.role === "admin" || entry.status !== "active") continue;
      if (entry.ghostMode) continue;
      if (countries && countries.length > 0 && (!entry.country || !countries.includes(entry.country))) continue;
      ids.push(userId);
    }
    return ids;
  }

  getAvailableBikerIds(countries?: string[]): string[] {
    const ids: string[] = [];
    for (const [userId, entry] of this.users) {
      if (entry.role === "admin" || entry.status !== "active") continue;
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
      if (entry.role === "admin" || entry.status !== "active") continue;
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
