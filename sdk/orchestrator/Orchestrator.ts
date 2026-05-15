import type { PipelineRunOptions } from "../pipelines/contracts.js";
import type { Pipeline } from "../pipelines/contracts.js";
import { PipelineRegistry } from "../pipelines/PipelineRegistry.js";
import { PipelineRuntime } from "../pipelines/PipelineRuntime.js";
import type { PipelineRuntimeConfig } from "../pipelines/PipelineRuntime.js";
import { consoleLogger } from "../types.js";
import type { Logger } from "../types.js";

export type Strategy = "sequential" | "parallel" | "agentic" | "planner-executor";

export type OrchestratorConfig = PipelineRuntimeConfig & {
  registry?: PipelineRegistry;
  runtime?: PipelineRuntime;
};

export class Orchestrator {
  readonly registry: PipelineRegistry;
  readonly runtime: PipelineRuntime;
  private readonly logger: Logger;

  constructor(private readonly config: OrchestratorConfig = {}) {
    this.registry = config.registry ?? new PipelineRegistry();
    this.runtime =
      config.runtime ??
      new PipelineRuntime({
        registry: this.registry,
        storage: config.storage,
        logger: config.logger,
        defaultMode: config.defaultMode,
        metadata: config.metadata,
        hooks: config.hooks,
        errorPolicy: config.errorPolicy,
        fallbackOutput: config.fallbackOutput,
      });
    this.logger = config.logger ?? consoleLogger;
  }

  registerPipeline(pipeline: Pipeline): void;
  registerPipeline(name: string, pipeline: Pipeline): void;
  registerPipeline(nameOrPipeline: string | Pipeline, maybePipeline?: Pipeline): void {
    if (typeof nameOrPipeline === "string") {
      if (!maybePipeline) throw new Error("[Orchestrator] pipeline is required");
      this.registry.register(nameOrPipeline, maybePipeline);
      return;
    }

    this.registry.register(nameOrPipeline);
  }

  getPipeline(name: string): Pipeline | undefined {
    return this.registry.get(name);
  }

  run<T = unknown>(name: string, input: unknown, options: PipelineRunOptions = {}): Promise<T> {
    return this.runtime.runRegistered<T>(name, input, options, this.registry);
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
}
