import { PipelineNotFoundError } from "../errors.js";
import type { Pipeline } from "./contracts.js";

export class PipelineRegistry {
  private readonly pipelines = new Map<string, Pipeline>();

  constructor(pipelines: Pipeline[] = []) {
    for (const pipeline of pipelines) {
      this.register(pipeline);
    }
  }

  register(pipeline: Pipeline): void;
  register(name: string, pipeline: Pipeline): void;
  register(nameOrPipeline: string | Pipeline, maybePipeline?: Pipeline): void {
    if (typeof nameOrPipeline !== "string") {
      this.pipelines.set(nameOrPipeline.name, nameOrPipeline);
      return;
    }

    if (!maybePipeline) throw new Error("[PipelineRegistry] pipeline is required");
    this.pipelines.set(nameOrPipeline, aliasPipeline(nameOrPipeline, maybePipeline));
  }

  get<TPipeline extends Pipeline = Pipeline>(name: string): TPipeline | undefined {
    return this.pipelines.get(name) as TPipeline | undefined;
  }

  require<TPipeline extends Pipeline = Pipeline>(name: string): TPipeline {
    const pipeline = this.get<TPipeline>(name);
    if (!pipeline) throw new PipelineNotFoundError(name);
    return pipeline;
  }

  has(name: string): boolean {
    return this.pipelines.has(name);
  }

  list(): Pipeline[] {
    return [...this.pipelines.values()];
  }

  unregister(name: string): boolean {
    return this.pipelines.delete(name);
  }

  clear(): void {
    this.pipelines.clear();
  }
}

function aliasPipeline(name: string, pipeline: Pipeline): Pipeline {
  return {
    name,
    hooks: pipeline.hooks,
    inputSchema: pipeline.inputSchema,
    run: pipeline.run.bind(pipeline),
    validate: pipeline.validate?.bind(pipeline),
  };
}
