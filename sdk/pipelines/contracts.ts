import type { ExecutionMode } from "../types.js";
import type { BrainGenerateInput } from "../core/contracts.js";
import type { ValidationSchema } from "../validation.js";

export interface Pipeline<TInput = unknown, TOutput = unknown> {
  name: string;
  hooks?: PipelineHooks<TInput, TOutput>;
  inputSchema?: ValidationSchema<TInput>;
  run(input: TInput, context?: PipelineContext): Promise<TOutput>;
  validate?(input: TInput): void;
}

export type PipelineContext = {
  runId?: string;
  mode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  emit?(event: PipelineEvent): Promise<void> | void;
};

export type PipelineEvent = {
  type: string;
  payload?: unknown;
  runId?: string;
  pipelineName?: string;
  stepId?: string;
};

export type PipelineRunOptions = {
  mode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  hooks?: PipelineHooks;
  emit?: PipelineContext["emit"];
  errorPolicy?: "throw" | "returnFallback";
  fallbackOutput?: unknown;
};

export type PipelineExecutionResult<TOutput = unknown> = {
  runId: string;
  pipelineName: string;
  status: "success" | "error";
  output?: TOutput;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

export type PipelineHookContext<TInput = unknown, TOutput = unknown> = PipelineContext & {
  pipelineName: string;
  input: TInput;
  output?: TOutput;
  error?: unknown;
};

export type PipelineHooks<TInput = unknown, TOutput = unknown> = {
  beforeRun?(context: PipelineHookContext<TInput, TOutput>): Promise<void> | void;
  afterRun?(context: PipelineHookContext<TInput, TOutput>): Promise<void> | void;
  onError?(context: PipelineHookContext<TInput, TOutput>): Promise<TOutput | void> | TOutput | void;
};

export type PipelineDefinition = {
  name: string;
  hooks?: PipelineHooks;
  metadata?: Record<string, unknown>;
  steps: PipelineStep[];
};

export type DeclarativePipelineConfig = PipelineDefinition;

export type PipelineStepState = {
  input: unknown;
  current: unknown;
  steps: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type PipelineStepBase<TInput = unknown, TOutput = unknown> = {
  id?: string;
  input?: TInput;
  when?: (state: PipelineStepState) => boolean | Promise<boolean>;
  mapInput?: (state: PipelineStepState) => TInput | Promise<TInput>;
  mapOutput?: (output: TOutput, state: PipelineStepState) => unknown | Promise<unknown>;
  retry?: number | { attempts: number };
  timeoutMs?: number;
  fallback?: TOutput | ((error: unknown, state: PipelineStepState) => TOutput | Promise<TOutput>);
};

export type ToolPipelineStep = PipelineStepBase & {
  type: "tool";
  name: string;
};

export type LLMPipelineStep = PipelineStepBase<unknown, unknown> & {
  type: "llm";
  model: string;
  provider?: string;
  prompt?: string | ((state: PipelineStepState) => string | Promise<string>);
  system?: string | ((state: PipelineStepState) => string | Promise<string>);
  buildInput?: (state: PipelineStepState) => BrainGenerateInput | Promise<BrainGenerateInput>;
};

export type NestedPipelineStep = PipelineStepBase & {
  type: "pipeline";
  name: string;
};

export type PipelineStep = ToolPipelineStep | LLMPipelineStep | NestedPipelineStep;

export type DeclarativeStep = PipelineStep;
