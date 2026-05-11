import type { Brain } from "../core/Brain.js";
import type { SessionMemory } from "../memory/contracts.js";
import type { Pipeline } from "./contracts.js";

export type OnboardingApiInput =
  | {
      operation: "createSession";
      pipelineId: string;
      fields: Array<{ id: string; question: string }>;
      context?: string;
    }
  | { operation: "answer"; sessionId: string; fieldId: string; value: unknown };

export class OnboardingApiPipeline implements Pipeline<OnboardingApiInput, unknown> {
  readonly name = "onboarding-api";

  constructor(private readonly deps: { brain: Brain; memory: SessionMemory }) {}

  async run(input: OnboardingApiInput): Promise<unknown> {
    if (input.operation === "createSession") {
      const sessionId = `onb_${globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? Date.now().toString(36)}`;
      await this.deps.memory.setSession(sessionId, {
        pipelineId: input.pipelineId,
        fields: input.fields,
        answers: {},
        currentFieldId: input.fields[0]?.id ?? null,
        status: input.fields.length ? "active" : "completed",
        context: input.context,
      });
      return this.state(sessionId);
    }
    if (input.operation === "answer") {
      const session = await this.deps.memory.getSession<Record<string, unknown>>(input.sessionId);
      if (!session) throw new Error("[OnboardingApiPipeline] session not found");
      const answers = { ...(session.answers as Record<string, unknown>), [input.fieldId]: input.value };
      const fields = session.fields as Array<{ id: string; question: string }>;
      const next = fields.find((field) => answers[field.id] === undefined);
      await this.deps.memory.setSession(input.sessionId, {
        ...session,
        answers,
        currentFieldId: next?.id ?? null,
        status: next ? "active" : "completed",
      });
      return this.state(input.sessionId);
    }
    throw new Error("[OnboardingApiPipeline] unsupported operation");
  }

  private async state(sessionId: string) {
    const session = await this.deps.memory.getSession<Record<string, unknown>>(sessionId);
    if (!session) throw new Error("[OnboardingApiPipeline] session not found");
    const fields = session.fields as Array<{ id: string; question: string }>;
    const field = fields.find((item) => item.id === session.currentFieldId) ?? null;
    return {
      session_id: sessionId,
      status: session.status,
      field,
      answers: session.answers,
      ...(session.status === "completed" ? { data: session.answers } : {}),
    };
  }
}
