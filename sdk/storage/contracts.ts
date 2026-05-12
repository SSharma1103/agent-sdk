import type { RunStatus, Usage } from "../types.js";
import type { LLMKeyRecord, LLMKeyStore, LLMProviderName } from "../core/contracts.js";

export type RunRecord = {
  id: string;
  pipelineName: string;
  status: RunStatus;
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
};

export type UsageRecord = {
  userId?: string;
  keyId?: string;
  provider: string;
  model: string;
  usage: Usage;
  metadata?: Record<string, unknown>;
};

export type EmailPipelineRecord = {
  id: string;
  userId: string;
  name: string;
  context: string;
  model: string;
  provider: string;
  keyId: string | null;
  agentmailInboxId?: string | null;
  rules: WorkflowRule[];
  webhookToken: string;
  webhookSecretLastFour?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkflowRuleMatch = {
  field: "subject" | "from" | "body";
  op: "contains" | "equals" | "startsWith";
  value: string;
};

export type WorkflowRuleAction = { kind: "reply"; text: string } | { kind: "skip" } | { kind: "forward"; to: string };

export type WorkflowRule = {
  id: string;
  match: WorkflowRuleMatch;
  action: WorkflowRuleAction;
};

export interface Storage extends Partial<LLMKeyStore> {
  saveRun(data: Omit<RunRecord, "id" | "startedAt"> & Partial<Pick<RunRecord, "id" | "startedAt">>): Promise<void>;
  updateRun?(id: string, data: Partial<RunRecord>): Promise<void>;
  getRuns(filter?: { pipelineName?: string; limit?: number }): Promise<RunRecord[]>;
  saveUsage?(record: UsageRecord): Promise<void>;
  getUsage?(filter?: { userId?: string; keyId?: string; provider?: LLMProviderName }): Promise<UsageRecord[]>;
  getLLMKey?(input: { userId: string; provider: LLMProviderName; keyId?: string }): Promise<LLMKeyRecord | null>;
  saveLLMKey?(record: LLMKeyRecord): Promise<LLMKeyRecord>;

  getEmailPipelineByUser?(userId: string): Promise<EmailPipelineRecord | null>;
  getEmailPipelineByWebhookToken?(token: string): Promise<EmailPipelineRecord | null>;
  saveEmailPipeline?(record: EmailPipelineRecord): Promise<EmailPipelineRecord>;
}
