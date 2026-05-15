import type { Brain } from "./core/Brain.js";
import { AgentPipeline } from "./agents/AgentPipeline.js";
import type { Agent } from "./agents/Agent.js";
import type { AgentTeam } from "./agents/AgentTeam.js";
import type { AgentRunInput, AgentRunOutput, AgentTeamRunInput, AgentTeamRunOutput } from "./agents/contracts.js";
import { Orchestrator, type OrchestratorConfig, type Strategy } from "./orchestrator/Orchestrator.js";
import type { Pipeline } from "./pipelines/contracts.js";
import type { PipelineRunOptions } from "./pipelines/contracts.js";
import type { Storage } from "./storage/contracts.js";
import type { Transport } from "./transport/contracts.js";

export type AgentSDKConfig = OrchestratorConfig & {
  brain?: Brain;
  provider?: Brain;
  transport?: Transport;
  storage?: Storage;
};

export class AgentSDK {
  readonly orchestrator: Orchestrator;
  readonly brain?: Brain;
  private readonly agents = new Map<string, Agent>();
  private readonly teams = new Map<string, AgentTeam>();

  constructor(readonly config: AgentSDKConfig = {}) {
    this.brain = config.brain ?? config.provider;
    this.orchestrator = new Orchestrator({
      storage: config.storage,
      logger: config.logger,
      defaultMode: config.defaultMode,
      metadata: config.metadata,
      hooks: config.hooks,
      errorPolicy: config.errorPolicy,
      fallbackOutput: config.fallbackOutput,
    });
  }

  registerPipeline(pipeline: Pipeline): void;
  registerPipeline(name: string, pipeline: Pipeline): void;
  registerPipeline(nameOrPipeline: string | Pipeline, maybePipeline?: Pipeline): void {
    if (typeof nameOrPipeline !== "string") {
      this.orchestrator.registerPipeline(nameOrPipeline);
      return;
    }

    if (!maybePipeline) throw new Error("[AgentSDK] pipeline is required");
    this.orchestrator.registerPipeline(nameOrPipeline, maybePipeline);
  }

  runPipeline<T = unknown>(name: string, input: unknown, options?: PipelineRunOptions): Promise<T> {
    return this.orchestrator.run<T>(name, input, options);
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.name, agent);
    this.registerPipeline(new AgentPipeline(agent));
  }

  getAgent(name: string): Agent | undefined {
    return this.agents.get(name);
  }

  runAgent(name: string, input: AgentRunInput | string, options?: PipelineRunOptions): Promise<AgentRunOutput> {
    return this.runPipeline<AgentRunOutput>(name, input, options);
  }

  registerTeam(team: AgentTeam): void {
    this.teams.set(team.name, team);
    this.registerPipeline({
      name: team.name,
      run: team.run.bind(team),
    });
  }

  getTeam(name: string): AgentTeam | undefined {
    return this.teams.get(name);
  }

  runTeam(name: string, input: AgentTeamRunInput | string, options?: PipelineRunOptions): Promise<AgentTeamRunOutput> {
    return this.runPipeline<AgentTeamRunOutput>(name, input, options);
  }

  runStrategy(strategy: Strategy, steps: Array<{ name: string; input: unknown }>): Promise<unknown[]> {
    return this.orchestrator.runStrategy(strategy, steps);
  }
}
