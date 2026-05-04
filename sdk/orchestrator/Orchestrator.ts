import type { Pipeline } from "../pipelines/contracts.js";
import type { Storage } from "../storage/contracts.js";
import type { ExecutionMode, Logger } from "../types.js";
import { consoleLogger } from "../types.js";
import { createId } from "../utils/id.js";

export type Strategy = "sequential" | "parallel" | "agentic" | "planner-executor";

export type OrchestratorConfig = {
  storage?: Storage;
  logger?: Logger;
  defaultMode?: ExecutionMode;
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

  async run<T = unknown>(name: string, input: unknown, options: { mode?: ExecutionMode } = {}): Promise<T> {
    const pipeline = this.pipelines.get(name);
    if (!pipeline) throw new Error(`[Orchestrator] pipeline "${name}" is not registered`);

    pipeline.validate?.(input);
    const runId = createId("run");
    await this.config.storage?.saveRun({
      id: runId,
      pipelineName: name,
      status: "running",
      input,
    });

    try {
      const output = await pipeline.run(input, {
        runId,
        mode: options.mode ?? this.config.defaultMode ?? "sync",
      });
      await this.config.storage?.updateRun?.(runId, {
        status: "success",
        output,
        completedAt: new Date(),
      });
      return output as T;
    } catch (error) {
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
}
