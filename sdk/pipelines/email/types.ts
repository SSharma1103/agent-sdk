import type { EmailPipelineRecord, WorkflowRule } from "../../storage/contracts.js";

export type IncomingEmail = {
  threadId: string;
  from: string;
  subject: string;
  body: string;
};

export type EmailPipelineConfigPatch = Partial<{
  name: string;
  context: string;
  model: string;
  provider: string;
  keyId: string | null;
  agentmailInboxId: string | null;
}>;

export type EmailPipelineInput =
  | { operation: "ensure"; userId: string }
  | { operation: "updateConfig"; userId: string; patch: EmailPipelineConfigPatch }
  | { operation: "addWorkflowRule"; userId: string; rule: Omit<WorkflowRule, "id"> }
  | { operation: "processIncomingEmail"; token: string; email: IncomingEmail }
  | { operation: "stats"; userId: string };

export type EmailPipelineOutput =
  | EmailPipelineRecord
  | WorkflowRule
  | {
      handled: "rule" | "brain" | "skipped";
      rule?: WorkflowRule;
      reply?: string;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    }
  | { rulesHandled: number; brainReplies: number; tokensUsed: number };
