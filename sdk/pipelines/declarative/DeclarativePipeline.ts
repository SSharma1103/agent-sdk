import type { Brain } from "../../core/Brain.js";
import type { ToolRegistry } from "../../tools/contracts.js";
import type {
  DeclarativePipelineConfig,
  Pipeline,
  PipelineContext,
  PipelineStep,
  PipelineStepState,
} from "../contracts.js";
import type { PipelineRegistry } from "../PipelineRegistry.js";
import type { PipelineRuntime } from "../PipelineRuntime.js";

export type DeclarativePipelineDeps = {
  brain: Brain;
  tools: ToolRegistry;
  registry?: PipelineRegistry;
  runtime?: PipelineRuntime;
};

export class DeclarativePipeline implements Pipeline {
  readonly name: string;
  readonly hooks;

  constructor(
    private readonly config: DeclarativePipelineConfig,
    private readonly deps: DeclarativePipelineDeps,
  ) {
    this.name = config.name;
    this.hooks = config.hooks;
  }

  async run(input: unknown, context?: PipelineContext): Promise<unknown> {
    const state: PipelineStepState = {
      input,
      current: input,
      steps: {},
      metadata: { ...(this.config.metadata ?? {}), ...(context?.metadata ?? {}) },
    };

    for (const [index, step] of this.config.steps.entries()) {
      const stepId = step.id ?? `${step.type}:${"name" in step ? step.name : index}`;
      if (step.when && !(await step.when(state))) {
        await context?.emit?.({ type: "pipeline.step.skipped", stepId, pipelineName: this.name, runId: context.runId });
        continue;
      }

      await context?.emit?.({ type: "pipeline.step.started", stepId, pipelineName: this.name, runId: context.runId });
      const output = await this.runStepWithPolicy(step, state, context, stepId);
      const mapped = step.mapOutput ? await step.mapOutput(output, state) : output;
      state.current = mapped;
      state.steps[stepId] = mapped;
      await context?.emit?.({
        type: "pipeline.step.completed",
        payload: mapped,
        stepId,
        pipelineName: this.name,
        runId: context?.runId,
      });
    }

    return state.current;
  }

  private async runStepWithPolicy(
    step: PipelineStep,
    state: PipelineStepState,
    context: PipelineContext | undefined,
    stepId: string,
  ): Promise<unknown> {
    const attempts = typeof step.retry === "number" ? step.retry + 1 : (step.retry?.attempts ?? 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await withTimeout(this.runStep(step, state, context), step.timeoutMs, stepId);
      } catch (error) {
        lastError = error;
        await context?.emit?.({
          type: "pipeline.step.failed",
          payload: { error, attempt, attempts },
          stepId,
          pipelineName: this.name,
          runId: context.runId,
        });
        if (attempt < attempts) continue;
      }
    }

    if (step.fallback !== undefined) {
      return typeof step.fallback === "function" ? step.fallback(lastError, state) : step.fallback;
    }

    throw lastError;
  }

  private async runStep(step: PipelineStep, state: PipelineStepState, context?: PipelineContext): Promise<unknown> {
    const input = step.mapInput ? await step.mapInput(state) : (step.input ?? state.current);

    if (step.type === "tool") {
      return this.deps.tools.call(step.name, input);
    }

    if (step.type === "llm") {
      if (step.buildInput) return this.deps.brain.run(await step.buildInput(state));
      const prompt = typeof step.prompt === "function" ? await step.prompt(state) : step.prompt;
      const system = typeof step.system === "function" ? await step.system(state) : step.system;
      return this.deps.brain.run({
        provider: step.provider,
        model: step.model,
        messages: [
          ...(system ? [{ role: "system" as const, content: system }] : []),
          { role: "user", content: prompt ?? JSON.stringify(input) },
        ],
        metadata: context?.metadata,
      });
    }

    if (step.type === "pipeline") {
      if (!this.deps.runtime) throw new Error("[DeclarativePipeline] pipeline runtime dependency is required");
      return this.deps.runtime.runNested(step.name, input, context, { registry: this.deps.registry });
    }

    return state.current;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined, stepId: string): Promise<T> {
  if (!timeoutMs) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`[DeclarativePipeline] step "${stepId}" timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
