import type { Pipeline } from "../pipelines/contracts.js";
import type { PipelineHookContext, PipelineHooks, PipelineRunOptions } from "../pipelines/contracts.js";
import type { Storage } from "../storage/contracts.js";
import type { ExecutionMode, Logger } from "../types.js";
import { consoleLogger } from "../types.js";
import { createId } from "../utils/id.js";
import { PipelineNotFoundError } from "../errors.js";
import { validateWithSchema } from "../validation.js";

export type Strategy = "sequential" | "parallel" | "agentic" | "planner-executor";

export type OrchestratorConfig = {
  storage?: Storage;
  logger?: Logger;
  defaultMode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  hooks?: PipelineHooks;
  errorPolicy?: "throw" | "returnFallback";
  fallbackOutput?: unknown;
};

export class Orchestrator {
  private readonly pipelines = new Map<string, Pipeline>();
  private readonly logger: Logger;

  constructor(private readonly config: OrchestratorConfig = {}) {
    this.logger = config.logger ?? consoleLogger;
  }

  registerPipeline(pipeline: Pipeline): void {
    this.pipelines.set(pipeline.name, pipeline);
  }

  getPipeline(name: string): Pipeline | undefined {
    return this.pipelines.get(name);
  }

  async run<T = unknown>(name: string, input: unknown, options: PipelineRunOptions = {}): Promise<T> {
    const pipeline = this.pipelines.get(name);
    if (!pipeline) throw new PipelineNotFoundError(name);

    if (pipeline.inputSchema) validateWithSchema(pipeline.inputSchema, input, `${name} input`);
    pipeline.validate?.(input);
    const runId = createId("run");
    const metadata = { ...(this.config.metadata ?? {}), ...(options.metadata ?? {}) };
    const emit = async (event: Parameters<NonNullable<PipelineRunOptions["emit"]>>[0]) => {
      await options.emit?.({ ...event, runId, pipelineName: event.pipelineName ?? name });
    };
    const hookContextBase = {
      runId,
      mode: options.mode ?? this.config.defaultMode ?? "sync",
      metadata,
      emit,
      pipelineName: name,
      input,
    };
    await this.config.storage?.saveRun({
      id: runId,
      pipelineName: name,
      status: "running",
      input,
      metadata,
    });

    try {
      await this.runHook("beforeRun", hookContextBase, this.config.hooks, pipeline.hooks, options.hooks);
      const output = await pipeline.run(input, {
        runId,
        mode: hookContextBase.mode,
        metadata,
        emit,
      });
      await this.runHook("afterRun", { ...hookContextBase, output }, this.config.hooks, pipeline.hooks, options.hooks);
      await this.config.storage?.updateRun?.(runId, {
        status: "success",
        output,
        completedAt: new Date(),
      });
      return output as T;
    } catch (error) {
      const fallback = await this.runErrorHooks<T>(
        { ...hookContextBase, error },
        this.config.hooks,
        pipeline.hooks,
        options.hooks,
      );
      const shouldReturnFallback =
        fallback.hasValue ||
        options.errorPolicy === "returnFallback" ||
        (options.errorPolicy === undefined && this.config.errorPolicy === "returnFallback");
      if (shouldReturnFallback) {
        const output = fallback.hasValue ? fallback.value : (options.fallbackOutput ?? this.config.fallbackOutput);
        await this.config.storage?.updateRun?.(runId, {
          status: "success",
          output,
          completedAt: new Date(),
        });
        return output as T;
      }

      await this.config.storage?.updateRun?.(runId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Pipeline failed",
        completedAt: new Date(),
      });
      this.logger.error?.("[Orchestrator] pipeline failed", { name, error });
      throw error;
    }
  }

  async runStrategy(strategy: Strategy, steps: Array<{ name: string; input: unknown }>): Promise<unknown[]> {
    if (strategy === "parallel") {
      return Promise.all(steps.map((step) => this.run(step.name, step.input)));
    }

    if (strategy === "agentic" || strategy === "planner-executor") {
      this.logger.info?.(`[Orchestrator] ${strategy} strategy uses registered planner pipelines when available`);
    }

    const outputs: unknown[] = [];
    for (const step of steps) {
      outputs.push(await this.run(step.name, step.input));
    }
    return outputs;
  }

  private async runHook(
    name: "beforeRun" | "afterRun",
    context: PipelineHookContext,
    ...hookSets: Array<PipelineHooks | undefined>
  ): Promise<void> {
    for (const hooks of hookSets) {
      await hooks?.[name]?.(context);
    }
  }

  private async runErrorHooks<T>(
    context: PipelineHookContext,
    ...hookSets: Array<PipelineHooks | undefined>
  ): Promise<{ hasValue: true; value: T } | { hasValue: false }> {
    for (const hooks of hookSets) {
      const value = await hooks?.onError?.(context);
      if (value !== undefined) return { hasValue: true, value: value as T };
    }
    return { hasValue: false };
  }
}
