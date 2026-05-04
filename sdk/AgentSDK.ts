import type { Brain } from "./core/Brain.js";
import { Orchestrator, type OrchestratorConfig, type Strategy } from "./orchestrator/Orchestrator.js";
import type { Pipeline } from "./pipelines/contracts.js";
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

  constructor(readonly config: AgentSDKConfig = {}) {
    this.brain = config.brain ?? config.provider;
    this.orchestrator = new Orchestrator({
      storage: config.storage,
      logger: config.logger,
      defaultMode: config.defaultMode,
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
    this.orchestrator.registerPipeline({
      name: nameOrPipeline,
      run: maybePipeline.run.bind(maybePipeline),
      validate: maybePipeline.validate?.bind(maybePipeline),
    });
  }

  runPipeline<T = unknown>(name: string, input: unknown): Promise<T> {
    return this.orchestrator.run<T>(name, input);
  }

  runStrategy(strategy: Strategy, steps: Array<{ name: string; input: unknown }>): Promise<unknown[]> {
    return this.orchestrator.runStrategy(strategy, steps);
  }
}
