import type { PipelineContext } from "../../pipelines/contracts.js";
import { createId } from "../../utils/id.js";
import type { TeamMessage } from "./contracts.js";
import type { TeamState } from "./TeamState.js";

export type TeamMessageInput = Omit<TeamMessage, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export class TeamMessageBus {
  constructor(
    private readonly state: TeamState,
    private readonly context?: PipelineContext,
  ) {}

  async publish(input: TeamMessageInput): Promise<TeamMessage> {
    const message: TeamMessage = {
      ...input,
      id: input.id ?? createId("team_msg"),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };

    this.state.addMessage(message);
    await emit(this.context, "agent_team.message_published", message);
    return message;
  }
}

function emit(context: PipelineContext | undefined, type: string, payload?: unknown): Promise<void> | void {
  return context?.emit?.({ type, payload, runId: context.runId });
}
