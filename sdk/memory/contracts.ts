export interface SessionMemory {
  getSession<T = unknown>(sessionId: string): Promise<T | null>;
  setSession<T = unknown>(sessionId: string, value: T, ttlMs?: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  appendPersistent?(key: string, value: unknown): Promise<void>;
  readPersistent?<T = unknown>(key: string): Promise<T[]>;
}

export class InMemorySessionStore implements SessionMemory {
  private readonly sessions = new Map<string, { value: unknown; expiresAt?: number }>();
  private readonly persistent = new Map<string, unknown[]>();

  async getSession<T = unknown>(sessionId: string): Promise<T | null> {
    const item = this.sessions.get(sessionId);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return item.value as T;
  }

  async setSession<T = unknown>(sessionId: string, value: T, ttlMs?: number): Promise<void> {
    this.sessions.set(sessionId, { value, expiresAt: ttlMs ? Date.now() + ttlMs : undefined });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async appendPersistent(key: string, value: unknown): Promise<void> {
    this.persistent.set(key, [...(this.persistent.get(key) ?? []), value]);
  }

  async readPersistent<T = unknown>(key: string): Promise<T[]> {
    return (this.persistent.get(key) ?? []) as T[];
  }
}
