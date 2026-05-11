import type { PipelineContext } from "../pipelines/contracts.js";
import type { Usage } from "../types.js";
import type { Agent } from "./Agent.js";
import type {
  AgentRunInput,
  AgentRunOutput,
  AgentTeamConfig,
  AgentTeamRunInput,
  AgentTeamRunOutput,
} from "./contracts.js";
import { TeamRuntime } from "./team/TeamRuntime.js";

export class AgentTeam {
  readonly name: string;

  constructor(readonly config: AgentTeamConfig) {
    this.name = config.name;
    if (config.mode === "manager" || config.mode === "parallel") {
      for (const agent of this.specialists()) {
        config.tools?.register(agent.asTool());
      }
    }
  }

  async run(input: AgentTeamRunInput | string, context?: PipelineContext): Promise<AgentTeamRunOutput> {
    const runInput = normalizeRunInput(input);
    await emit(context, "agent_team.started", {
      teamName: this.name,
      mode: this.config.mode,
      input: runInput.input,
    });

    const output = await this.runByMode(runInput, context);
    await emit(context, "agent_team.completed", output);
    return output;
  }

  private async runByMode(input: AgentRunInput, context?: PipelineContext): Promise<AgentTeamRunOutput> {
    if (this.config.mode === "manager") return this.runManager(input, context);
    if (this.config.mode === "sequential") return this.runSequential(input, context);
    if (this.config.mode === "parallel") return this.runParallel(input, context);
    if (this.config.mode === "router") return this.runRouter(input, context);

    // Future strategy runtimes for handoff and planner-executor can plug in here.
    throw new Error(
      `[AgentTeam] mode "${this.config.mode}" is an advanced strategy and is not implemented in the stable team loop yet`,
    );
  }

  private async runManager(input: AgentRunInput, context?: PipelineContext): Promise<AgentTeamRunOutput> {
    const manager = this.requireManager();
    const result = await manager.run(input, context);
    return {
      teamName: this.name,
      mode: this.config.mode,
      text: result.text,
      usage: result.usage,
      results: [result],
      raw: result.raw,
    };
  }

  private async runSequential(input: AgentRunInput, context?: PipelineContext): Promise<AgentTeamRunOutput> {
    const results: AgentRunOutput[] = [];
    let current = input.input;

    for (const agent of this.config.agents) {
      const result = await agent.run({ ...input, input: current }, context);
      results.push(result);
      current = result.text;
    }

    return this.toTeamOutput(results.at(-1)?.text ?? "", results);
  }

  private async runParallel(input: AgentRunInput, context?: PipelineContext): Promise<AgentTeamRunOutput> {
    const agents = this.specialists();
    const results = await Promise.all(agents.map((agent) => agent.run(input, context)));

    if (!this.config.manager) {
      return this.toTeamOutput(formatAgentResults(results), results);
    }

    const synthesis = await this.config.manager.run(
      {
        ...input,
        input: [
          "Synthesize these agent results into a single response.",
          `Original input: ${input.input}`,
          formatAgentResults(results),
        ].join("\n\n"),
      },
      context,
    );

    return this.toTeamOutput(synthesis.text, [...results, synthesis], synthesis.raw);
  }

  private runRouter(input: AgentRunInput, context?: PipelineContext): Promise<AgentTeamRunOutput> {
    const manager = this.requireManager();
    return new TeamRuntime({
      name: this.name,
      manager,
      agents: this.specialists(),
      brain: this.config.brain,
      tools: this.config.tools,
      memory: this.config.memory,
      maxSteps: this.config.maxSteps,
      maxCallsPerAgent: this.config.maxCallsPerAgent,
      metadata: this.config.metadata,
    }).run(input, context);
  }

  private specialists(): Agent[] {
    return this.config.agents.filter((agent) => agent !== this.config.manager);
  }

  private requireManager(): Agent {
    if (!this.config.manager) throw new Error(`[AgentTeam] team "${this.name}" requires a manager agent`);
    return this.config.manager;
  }

  private toTeamOutput(text: string, results: AgentRunOutput[], raw?: unknown): AgentTeamRunOutput {
    return {
      teamName: this.name,
      mode: this.config.mode,
      text,
      usage: sumUsage(results.map((result) => result.usage)),
      results,
      raw,
    };
  }
}

function normalizeRunInput(input: AgentTeamRunInput | string): AgentRunInput {
  return typeof input === "string" ? { input } : input;
}

function emit(context: PipelineContext | undefined, type: string, payload?: unknown): Promise<void> | void {
  return context?.emit?.({ type, payload, runId: context.runId });
}

function formatAgentResults(results: AgentRunOutput[]): string {
  return results.map((result) => `${result.agentName}: ${result.text}`).join("\n");
}

function sumUsage(usages: Usage[]): Usage {
  return usages.reduce<Usage>(
    (total, usage) => ({
      promptTokens: total.promptTokens + usage.promptTokens,
      completionTokens: total.completionTokens + usage.completionTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  );
}
