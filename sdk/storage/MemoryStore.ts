import type { LLMKeyRecord, LLMProviderName } from "../core/contracts.js";
import type { EmailPipelineRecord, RunRecord, Storage, UsageRecord } from "./contracts.js";
import { createId } from "../utils/id.js";

export class MemoryStore implements Storage {
  private readonly runs: RunRecord[] = [];
  private readonly usage: UsageRecord[] = [];
  private readonly llmKeys = new Map<string, LLMKeyRecord>();
  private readonly emailPipelinesByUser = new Map<string, EmailPipelineRecord>();

  async saveRun(
    data: Omit<RunRecord, "id" | "startedAt"> & Partial<Pick<RunRecord, "id" | "startedAt">>,
  ): Promise<void> {
    this.runs.push({
      ...data,
      id: data.id ?? createId("run"),
      startedAt: data.startedAt ?? new Date(),
    });
  }

  async updateRun(id: string, data: Partial<RunRecord>): Promise<void> {
    const idx = this.runs.findIndex((run) => run.id === id);
    if (idx >= 0) this.runs[idx] = { ...this.runs[idx], ...data };
  }

  async getRuns(filter: { pipelineName?: string; limit?: number } = {}): Promise<RunRecord[]> {
    const rows = filter.pipelineName ? this.runs.filter((run) => run.pipelineName === filter.pipelineName) : this.runs;
    return rows.slice(-(filter.limit ?? rows.length)).reverse();
  }

  async saveUsage(record: UsageRecord): Promise<void> {
    this.usage.push(record);
  }

  async getUsage(filter: { userId?: string; keyId?: string; provider?: LLMProviderName } = {}): Promise<UsageRecord[]> {
    return this.usage.filter((row) => {
      if (filter.userId && row.userId !== filter.userId) return false;
      if (filter.keyId && row.keyId !== filter.keyId) return false;
      if (filter.provider && row.provider !== filter.provider) return false;
      return true;
    });
  }

  async getLLMKey(input: { userId: string; provider: LLMProviderName; keyId?: string }): Promise<LLMKeyRecord | null> {
    if (input.keyId) {
      const key = this.llmKeys.get(input.keyId);
      if (!key || key.userId !== input.userId || key.provider !== input.provider) return null;
      return key;
    }

    return (
      [...this.llmKeys.values()].find((key) => key.userId === input.userId && key.provider === input.provider) ?? null
    );
  }

  async saveLLMKey(record: LLMKeyRecord): Promise<LLMKeyRecord> {
    const now = new Date();
    const saved = {
      ...record,
      id: record.id ?? createId("llm_key"),
      createdAt: record.createdAt ?? now,
      updatedAt: now,
    };
    this.llmKeys.set(saved.id, saved);
    return saved;
  }

  async getEmailPipelineByUser(userId: string): Promise<EmailPipelineRecord | null> {
    return this.emailPipelinesByUser.get(userId) ?? null;
  }

  async getEmailPipelineByWebhookToken(token: string): Promise<EmailPipelineRecord | null> {
    return [...this.emailPipelinesByUser.values()].find((pipeline) => pipeline.webhookToken === token) ?? null;
  }

  async saveEmailPipeline(record: EmailPipelineRecord): Promise<EmailPipelineRecord> {
    const saved = { ...record, updatedAt: new Date() };
    this.emailPipelinesByUser.set(saved.userId, saved);
    return saved;
  }
}
