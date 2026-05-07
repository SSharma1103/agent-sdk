import type { Pipeline, PipelineContext } from "../pipelines/contracts.js";
import type { Agent } from "./Agent.js";
import type { AgentRunInput, AgentRunOutput } from "./contracts.js";

export class AgentPipeline implements Pipeline<AgentRunInput | string, AgentRunOutput> {
  readonly name: string;

  constructor(readonly agent: Agent) {
    this.name = agent.name;
  }

  run(input: AgentRunInput | string, context?: PipelineContext): Promise<AgentRunOutput> {
    return this.agent.run(input, context);
  }
}
