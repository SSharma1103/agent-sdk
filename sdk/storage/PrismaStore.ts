import type { EmailPipelineRecord, RunRecord, Storage, UsageRecord, WorkflowRule } from "./contracts.js";

type PrismaLike = {
  llmUsage?: {
    create(input: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(input?: Record<string, unknown>): Promise<Array<{ totalTokens?: number } & Record<string, unknown>>>;
  };
  emailPipeline?: {
    findUnique(input: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    create(input: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    update(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  };
  orchestrationRun?: {
    create(input: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(input?: Record<string, unknown>): Promise<RunRecord[]>;
    update(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  };
};

export class PrismaStore implements Storage {
  constructor(private readonly prisma: PrismaLike) {}

  async saveRun(data: Omit<RunRecord, "id" | "startedAt"> & Partial<Pick<RunRecord, "id" | "startedAt">>): Promise<void> {
    if (!this.prisma.orchestrationRun) return;
    await this.prisma.orchestrationRun.create({ data: data as Record<string, unknown> });
  }

  async updateRun(id: string, data: Partial<RunRecord>): Promise<void> {
    await this.prisma.orchestrationRun?.update({ where: { id }, data: data as Record<string, unknown> });
  }

  async getRuns(filter: { pipelineName?: string; limit?: number } = {}): Promise<RunRecord[]> {
    return this.prisma.orchestrationRun?.findMany({
      where: filter.pipelineName ? { pipelineName: filter.pipelineName } : undefined,
      take: filter.limit,
      orderBy: { startedAt: "desc" },
    }) ?? [];
  }

  async saveUsage(record: UsageRecord): Promise<void> {
    await this.prisma.llmUsage?.create({
      data: {
        userId: record.userId,
        keyId: record.keyId,
        provider: record.provider,
        model: record.model,
        promptTokens: record.usage.promptTokens,
        completionTokens: record.usage.completionTokens,
        totalTokens: record.usage.totalTokens,
        metadata: record.metadata,
      },
    });
  }

  async getUsage(filter: { userId?: string; keyId?: string } = {}): Promise<UsageRecord[]> {
    const rows = await this.prisma.llmUsage?.findMany({ where: filter }) ?? [];
    return rows.map((row) => ({
      userId: row.userId as string | undefined,
      keyId: row.keyId as string | undefined,
      provider: String(row.provider ?? ""),
      model: String(row.model ?? ""),
      usage: {
        promptTokens: Number(row.promptTokens ?? 0),
        completionTokens: Number(row.completionTokens ?? 0),
        totalTokens: Number(row.totalTokens ?? 0),
      },
    }));
  }

  async getEmailPipelineByUser(userId: string): Promise<EmailPipelineRecord | null> {
    const row = await this.prisma.emailPipeline?.findUnique({ where: { userId } });
    return row ? rowToEmailRecord(row) : null;
  }

  async getEmailPipelineByWebhookToken(token: string): Promise<EmailPipelineRecord | null> {
    const row = await this.prisma.emailPipeline?.findUnique({ where: { webhookToken: token } });
    return row ? rowToEmailRecord(row) : null;
  }

  async saveEmailPipeline(record: EmailPipelineRecord): Promise<EmailPipelineRecord> {
    if (!this.prisma.emailPipeline) return record;
    const data = { ...record, rules: record.rules };
    const existing = await this.getEmailPipelineByUser(record.userId);
    const row = existing
      ? await this.prisma.emailPipeline.update({ where: { userId: record.userId }, data })
      : await this.prisma.emailPipeline.create({ data });
    return rowToEmailRecord(row);
  }
}

function rowToEmailRecord(row: Record<string, unknown>): EmailPipelineRecord {
  return {
    id: String(row.id),
    userId: String(row.userId),
    name: String(row.name ?? "Email Pipeline"),
    context: String(row.context ?? ""),
    model: String(row.model ?? "gpt-4o-mini"),
    provider: String(row.provider ?? "openai"),
    keyId: row.keyId ? String(row.keyId) : null,
    agentmailInboxId: row.agentmailInboxId ? String(row.agentmailInboxId) : null,
    rules: (Array.isArray(row.rules) ? row.rules : []) as WorkflowRule[],
    webhookToken: String(row.webhookToken ?? ""),
    webhookSecretLastFour: row.webhookSecretLastFour ? String(row.webhookSecretLastFour) : null,
    isActive: Boolean(row.isActive ?? true),
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(),
  };
}
