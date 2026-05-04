import type { Brain } from "../../core/Brain.js";
import type { ModelMessage } from "../../core/contracts.js";
import type { Pipeline } from "../contracts.js";
import type { Storage, WorkflowRule } from "../../storage/contracts.js";
import type { EmailPipelineRecord } from "../../storage/contracts.js";
import type { ToolRegistry } from "../../tools/contracts.js";
import type { ToolDefinition } from "../../tools/contracts.js";
import type { EmailPipelineConfigPatch, EmailPipelineInput, EmailPipelineOutput, IncomingEmail } from "./types.js";
import { createId } from "../../utils/id.js";

export type EmailPipelineHooks = {
  matchRule?(
    rule: WorkflowRule,
    email: IncomingEmail,
    pipeline: EmailPipelineRecord,
  ): boolean | Promise<boolean>;
  onRuleMatched?(
    rule: WorkflowRule,
    email: IncomingEmail,
    pipeline: EmailPipelineRecord,
  ): EmailPipelineOutput | void | Promise<EmailPipelineOutput | void>;
  onNoMatchingRule?(
    email: IncomingEmail,
    pipeline: EmailPipelineRecord,
  ): EmailPipelineOutput | void | Promise<EmailPipelineOutput | void>;
  buildMessages?(email: IncomingEmail, pipeline: EmailPipelineRecord): ModelMessage[] | Promise<ModelMessage[]>;
  selectTools?(
    email: IncomingEmail,
    pipeline: EmailPipelineRecord,
    tools?: ToolRegistry,
  ): ToolDefinition[] | string[] | undefined | Promise<ToolDefinition[] | string[] | undefined>;
};

export type EmailPipelineDeps = {
  storage: Storage;
  brain: Brain;
  tools?: ToolRegistry;
  shareBaseUrl?: string;
  defaultModel?: string;
  defaultProvider?: string;
  hooks?: EmailPipelineHooks;
};

export class EmailPipeline implements Pipeline<EmailPipelineInput, EmailPipelineOutput> {
  readonly name = "email";

  constructor(private readonly deps: EmailPipelineDeps) {}

  validate(input: EmailPipelineInput): void {
    if (!input || typeof input !== "object" || !("operation" in input)) {
      throw new Error("[EmailPipeline] operation is required");
    }
  }

  async run(input: EmailPipelineInput): Promise<EmailPipelineOutput> {
    if (input.operation === "ensure") return this.ensure(input.userId);
    if (input.operation === "updateConfig") return this.updateConfig(input.userId, input.patch);
    if (input.operation === "addWorkflowRule") return this.addWorkflowRule(input.userId, input.rule);
    if (input.operation === "processIncomingEmail") return this.processIncomingEmail(input.token, input.email);
    if (input.operation === "stats") return this.getDashboardStats(input.userId);
    throw new Error("[EmailPipeline] unsupported operation");
  }

  async ensure(userId: string) {
    const existing = await this.deps.storage.getEmailPipelineByUser?.(userId);
    if (existing) return existing;

    const now = new Date();
    const created = {
      id: createId("email"),
      userId,
      name: "Email Pipeline",
      context: "You are a helpful email automation assistant. Write concise, useful replies.",
      model: this.deps.defaultModel ?? "gpt-4o-mini",
      provider: this.deps.defaultProvider ?? "openai",
      keyId: null,
      agentmailInboxId: null,
      rules: [],
      webhookToken: createId("webhook"),
      webhookSecretLastFour: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    return this.save(created);
  }

  async updateConfig(userId: string, patch: EmailPipelineConfigPatch) {
    const pipeline = await this.ensure(userId);
    return this.save({
      ...pipeline,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.context !== undefined ? { context: patch.context } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.keyId !== undefined ? { keyId: patch.keyId } : {}),
      ...(patch.agentmailInboxId !== undefined ? { agentmailInboxId: patch.agentmailInboxId } : {}),
    });
  }

  async addWorkflowRule(userId: string, rule: Omit<WorkflowRule, "id">): Promise<WorkflowRule> {
    const pipeline = await this.ensure(userId);
    const newRule = { id: createId("rule"), ...rule };
    await this.save({ ...pipeline, rules: [...pipeline.rules, newRule] });
    return newRule;
  }

  async generateWebhookUrl(userId: string): Promise<{ url: string; token: string }> {
    const pipeline = await this.ensure(userId);
    const token = createId("webhook");
    await this.save({ ...pipeline, webhookToken: token });
    return { token, url: `${this.deps.shareBaseUrl ?? ""}/api/agentmail/webhooks/${token}` };
  }

  async processIncomingEmail(token: string, email: IncomingEmail) {
    const pipeline = await this.deps.storage.getEmailPipelineByWebhookToken?.(token);
    if (!pipeline) throw new Error("[EmailPipeline] no pipeline found for token");

    for (const rule of pipeline.rules) {
      const matched = this.deps.hooks?.matchRule
        ? await this.deps.hooks.matchRule(rule, email, pipeline)
        : matchesRule(rule, email);
      if (!matched) continue;
      const custom = await this.deps.hooks?.onRuleMatched?.(rule, email, pipeline);
      if (custom) return custom;
      if (rule.action.kind === "reply") return { handled: "rule" as const, rule, reply: rule.action.text };
      if (rule.action.kind === "skip") return { handled: "skipped" as const, rule };
      if (rule.action.kind === "forward") return { handled: "rule" as const, rule };
    }

    const noRuleOutput = await this.deps.hooks?.onNoMatchingRule?.(email, pipeline);
    if (noRuleOutput) return noRuleOutput;

    if (!pipeline.keyId) {
      throw new Error("[EmailPipeline] Brain requires keyId to be set");
    }

    const messages = await this.buildMessages(email, pipeline);
    const selectedTools = await this.deps.hooks?.selectTools?.(email, pipeline, this.deps.tools);
    const result = await this.deps.brain.run({
      userId: pipeline.userId,
      keyId: pipeline.keyId,
      provider: pipeline.provider,
      model: pipeline.model,
      messages,
      tools: selectedTools ?? this.deps.tools?.list(),
      metadata: { pipeline: this.name, threadId: email.threadId },
    });

    return {
      handled: "brain" as const,
      reply: result.text,
      usage: result.usage,
    };
  }

  async getDashboardStats(userId: string): Promise<{ rulesHandled: number; brainReplies: number; tokensUsed: number }> {
    const pipeline = await this.deps.storage.getEmailPipelineByUser?.(userId);
    if (!pipeline?.keyId) return { rulesHandled: 0, brainReplies: 0, tokensUsed: 0 };
    const usageRows = await this.deps.storage.getUsage?.({ userId, keyId: pipeline.keyId }) ?? [];
    return {
      rulesHandled: 0,
      brainReplies: usageRows.length,
      tokensUsed: usageRows.reduce((sum, row) => sum + row.usage.totalTokens, 0),
    };
  }

  private async save(record: Parameters<NonNullable<Storage["saveEmailPipeline"]>>[0]) {
    if (!this.deps.storage.saveEmailPipeline) {
      throw new Error("[EmailPipeline] storage adapter must implement saveEmailPipeline");
    }
    return this.deps.storage.saveEmailPipeline(record);
  }

  private async buildMessages(email: IncomingEmail, pipeline: EmailPipelineRecord): Promise<ModelMessage[]> {
    const custom = await this.deps.hooks?.buildMessages?.(email, pipeline);
    if (custom) return custom;
    return [
      { role: "system", content: pipeline.context },
      {
        role: "user",
        content: `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`,
      },
    ];
  }
}

function matchesRule(rule: WorkflowRule, email: IncomingEmail): boolean {
  const { field, op, value } = rule.match;
  const haystack = field === "subject" ? email.subject : field === "from" ? email.from : email.body;
  const lower = haystack.toLowerCase();
  const needle = value.toLowerCase();

  if (op === "contains") return lower.includes(needle);
  if (op === "equals") return lower === needle;
  if (op === "startsWith") return lower.startsWith(needle);
  return false;
}
