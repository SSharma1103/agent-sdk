import type { PipelineContext } from "../../pipelines/contracts.js";
import type { Usage } from "../../types.js";
import type { Agent } from "../Agent.js";
import type { AgentRunInput, AgentTeamRunInput, AgentTeamRunOutput } from "../contracts.js";
import type { RouterDecision, TeamRuntimeConfig } from "./contracts.js";
import { TeamMessageBus } from "./TeamMessageBus.js";
import { TeamRouter } from "./TeamRouter.js";
import { TeamState } from "./TeamState.js";

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_MAX_CALLS_PER_AGENT = 3;

export class TeamRuntime {
  private readonly agentsByName: Map<string, Agent>;
  private readonly maxSteps: number;
  private readonly maxCallsPerAgent: number;

  constructor(private readonly config: TeamRuntimeConfig) {
    this.agentsByName = new Map(config.agents.map((agent) => [agent.name, agent]));
    this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
    this.maxCallsPerAgent = config.maxCallsPerAgent ?? DEFAULT_MAX_CALLS_PER_AGENT;
  }

  async run(input: AgentTeamRunInput | string, context?: PipelineContext): Promise<AgentTeamRunOutput> {
    const runInput = normalizeRunInput(input);
    const state = new TeamState(runInput.input);
    const bus = new TeamMessageBus(state, context);
    const router = new TeamRouter(this.config.manager, this.config.agents, this.config.brain);

    await emit(context, "agent_team.router.started", {
      teamName: this.config.name,
      input: runInput.input,
      maxSteps: this.maxSteps,
      maxCallsPerAgent: this.maxCallsPerAgent,
      metadata: this.config.metadata,
    });

    try {
      for (let stepIndex = 0; stepIndex < this.maxSteps; stepIndex += 1) {
        const decision = await this.getValidDecision(router, state, bus, context);
        const step = state.addStep(decision);

        await emit(context, "agent_team.router.decision", {
          teamName: this.config.name,
          step: step.step,
          decision,
        });

        if (decision.action === "finish") {
          state.setFinalAnswer(decision.answer);
          await bus.publish({
            from: this.config.manager.name,
            to: "broadcast",
            channel: "final",
            content: decision.answer,
            metadata: decision.reason ? { reason: decision.reason } : undefined,
          });
          return this.finish(state, decision.answer, context);
        }

        const agent = this.agentsByName.get(decision.agent);
        if (!agent) {
          throw new Error(`[AgentTeam] router selected unknown agent "${decision.agent}" after validation`);
        }

        state.incrementCallCount(agent.name);
        await emit(context, "agent_team.agent_call.started", {
          teamName: this.config.name,
          step: step.step,
          agentName: agent.name,
          input: decision.input,
          reason: decision.reason,
        });

        try {
          const result = await agent.run(
            {
              ...runInput,
              input: decision.input,
              context: {
                ...(runInput.context ?? {}),
                teamName: this.config.name,
                originalInput: runInput.input,
                teamStep: step.step,
              },
            },
            context,
          );
          state.attachResult(step, result);
          await bus.publish({
            from: agent.name,
            to: this.config.manager.name,
            channel: "findings",
            content: result.text,
            metadata: { step: step.step },
          });
          await emit(context, "agent_team.agent_call.completed", {
            teamName: this.config.name,
            step: step.step,
            agentName: agent.name,
            result,
          });
        } catch (error) {
          await emit(context, "agent_team.router.failed", {
            teamName: this.config.name,
            step: step.step,
            recoverable: true,
            error,
          });
          await bus.publish({
            from: "runtime",
            to: this.config.manager.name,
            channel: "system",
            content: `Agent "${agent.name}" failed: ${formatError(error)}`,
            metadata: { step: step.step },
          });
        }
      }

      await emit(context, "agent_team.router.max_steps_reached", {
        teamName: this.config.name,
        maxSteps: this.maxSteps,
      });
      const fallback = this.buildMaxStepsFallback(state);
      state.setFinalAnswer(fallback);
      return this.finish(state, fallback, context, { stoppedReason: "maxStepsReached" });
    } catch (error) {
      await emit(context, "agent_team.router.failed", {
        teamName: this.config.name,
        recoverable: false,
        error,
      });
      const fallback = this.buildFailureFallback(state, error);
      state.setFinalAnswer(fallback);
      return this.finish(state, fallback, context, { stoppedReason: "routerFailed", error: formatError(error) });
    }
  }

  private async getValidDecision(
    router: TeamRouter,
    state: TeamState,
    bus: TeamMessageBus,
    context?: PipelineContext,
  ): Promise<RouterDecision> {
    let decision = await router.decide(state, context);
    const firstError = this.validateDecision(decision, state);
    if (!firstError) return decision;

    await emit(context, "agent_team.router.failed", {
      teamName: this.config.name,
      recoverable: true,
      error: firstError,
      decision,
    });
    await bus.publish({
      from: "runtime",
      to: this.config.manager.name,
      channel: "system",
      content: `${firstError} Choose a different valid action.`,
    });

    decision = await router.decide(state, context);
    const secondError = this.validateDecision(decision, state);
    if (!secondError) return decision;

    await emit(context, "agent_team.router.failed", {
      teamName: this.config.name,
      recoverable: true,
      error: secondError,
      decision,
    });
    return {
      action: "finish",
      answer: this.buildFailureFallback(state, secondError),
      reason: "The manager returned invalid router decisions twice.",
    };
  }

  private validateDecision(decision: RouterDecision, state: TeamState): string | undefined {
    if (decision.action === "finish") return undefined;

    if (!this.agentsByName.has(decision.agent)) {
      return `Router selected unknown agent "${decision.agent}".`;
    }

    if (state.getCallCount(decision.agent) >= this.maxCallsPerAgent) {
      return `Router exceeded the call limit for agent "${decision.agent}".`;
    }

    return undefined;
  }

  private async finish(
    state: TeamState,
    answer: string,
    context?: PipelineContext,
    raw?: Record<string, unknown>,
  ): Promise<AgentTeamRunOutput> {
    const output: AgentTeamRunOutput = {
      teamName: this.config.name,
      mode: "router",
      text: answer,
      usage: sumUsage(state.results.map((result) => result.usage)),
      results: state.results,
      raw: {
        ...(raw ?? {}),
        state: {
          originalInput: state.originalInput,
          messages: state.messages,
          steps: state.steps,
          callCountsByAgent: state.callCountsByAgent,
          finalAnswer: state.finalAnswer,
        },
      },
    };

    await emit(context, "agent_team.router.finished", output);
    return output;
  }

  private buildMaxStepsFallback(state: TeamState): string {
    if (!state.results.length) {
      return "The router reached its maximum step limit before any agent produced a result.";
    }

    return [
      "The router reached its maximum step limit. Here is the best answer from the results gathered so far:",
      state.summarizeResults(),
    ].join("\n\n");
  }

  private buildFailureFallback(state: TeamState, error: unknown): string {
    if (!state.results.length) {
      return `The router could not complete the team run: ${formatError(error)}`;
    }

    return [
      `The router could not complete the team run: ${formatError(error)}`,
      "Available results:",
      state.summarizeResults(),
    ].join("\n\n");
  }
}

function normalizeRunInput(input: AgentTeamRunInput | string): AgentRunInput {
  return typeof input === "string" ? { input } : input;
}

function emit(context: PipelineContext | undefined, type: string, payload?: unknown): Promise<void> | void {
  return context?.emit?.({ type, payload, runId: context.runId });
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
