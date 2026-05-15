import { consoleLogger } from "../types.js";
import type { ExecutionMode, Logger } from "../types.js";
import { createId } from "../utils/id.js";
import { validateWithSchema } from "../validation.js";
import type { Storage } from "../storage/contracts.js";
import type { Pipeline, PipelineContext, PipelineHookContext, PipelineHooks, PipelineRunOptions } from "./contracts.js";
import type { PipelineRegistry } from "./PipelineRegistry.js";

export type PipelineRuntimeConfig = {
  registry?: PipelineRegistry;
  storage?: Storage;
  logger?: Logger;
  defaultMode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  hooks?: PipelineHooks;
  errorPolicy?: "throw" | "returnFallback";
  fallbackOutput?: unknown;
};

export type NestedPipelineRunOptions = {
  registry?: PipelineRegistry;
  metadata?: Record<string, unknown>;
};

export class PipelineRuntime {
  private readonly logger: Logger;

  constructor(private readonly config: PipelineRuntimeConfig = {}) {
    this.logger = config.logger ?? consoleLogger;
  }

  runRegistered<T = unknown>(
    name: string,
    input: unknown,
    options: PipelineRunOptions = {},
    registry = this.config.registry,
  ): Promise<T> {
    if (!registry) throw new Error("[PipelineRuntime] pipeline registry is required");
    return this.run<T>(registry.require(name), input, options);
  }

  async run<T = unknown>(pipeline: Pipeline, input: unknown, options: PipelineRunOptions = {}): Promise<T> {
    this.validateInput(pipeline, input);

    const runId = createId("run");
    const metadata = { ...(this.config.metadata ?? {}), ...(options.metadata ?? {}) };
    const emit = async (event: Parameters<NonNullable<PipelineRunOptions["emit"]>>[0]) => {
      await options.emit?.({ ...event, runId, pipelineName: event.pipelineName ?? pipeline.name });
    };
    const hookContextBase = {
      runId,
      mode: options.mode ?? this.config.defaultMode ?? "sync",
      metadata,
      emit,
      pipelineName: pipeline.name,
      input,
    };

    await this.config.storage?.saveRun({
      id: runId,
      pipelineName: pipeline.name,
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
      this.logger.error?.("[PipelineRuntime] pipeline failed", { name: pipeline.name, error });
      throw error;
    }
  }

  async runNested<T = unknown>(
    name: string,
    input: unknown,
    context?: PipelineContext,
    options: NestedPipelineRunOptions = {},
  ): Promise<T> {
    const registry = options.registry ?? this.config.registry;
    if (!registry) throw new Error("[PipelineRuntime] pipeline registry is required");

    const pipeline = registry.require(name);
    this.validateInput(pipeline, input);

    return pipeline.run(input, {
      runId: context?.runId,
      mode: context?.mode,
      metadata: { ...(context?.metadata ?? {}), ...(options.metadata ?? {}) },
      emit: context?.emit,
    }) as Promise<T>;
  }

  private validateInput(pipeline: Pipeline, input: unknown): void {
    if (pipeline.inputSchema) validateWithSchema(pipeline.inputSchema, input, `${pipeline.name} input`);
    pipeline.validate?.(input);
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
