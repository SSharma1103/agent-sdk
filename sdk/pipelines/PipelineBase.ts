import type { Pipeline, PipelineContext, PipelineHooks } from "./contracts.js";
import type { ValidationSchema } from "../validation.js";
import { validateWithSchema } from "../validation.js";

export abstract class PipelineBase<TInput = unknown, TOutput = unknown> implements Pipeline<TInput, TOutput> {
  abstract readonly name: string;
  readonly hooks?: PipelineHooks<TInput, TOutput>;
  readonly inputSchema?: ValidationSchema<TInput>;

  constructor(config: { hooks?: PipelineHooks<TInput, TOutput>; inputSchema?: ValidationSchema<TInput> } = {}) {
    this.hooks = config.hooks;
    this.inputSchema = config.inputSchema;
  }

  validate(input: TInput): void {
    if (this.inputSchema) validateWithSchema(this.inputSchema, input, `${this.name} input`);
  }

  abstract run(input: TInput, context?: PipelineContext): Promise<TOutput>;

  protected emit(context: PipelineContext | undefined, type: string, payload?: unknown): Promise<void> | void {
    return context?.emit?.({ type, payload, pipelineName: this.name, runId: context.runId });
  }
}
