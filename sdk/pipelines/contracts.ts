import type { ExecutionMode } from "../types.js";

export interface Pipeline<TInput = unknown, TOutput = unknown> {
  name: string;
  run(input: TInput, context?: PipelineContext): Promise<TOutput>;
  validate?(input: TInput): void;
}

export type PipelineContext = {
  runId?: string;
  mode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  emit?(event: { type: string; payload?: unknown }): Promise<void> | void;
};

export type DeclarativePipelineConfig = {
  name: string;
  steps: DeclarativeStep[];
};

export type DeclarativeStep =
  | { type: "tool"; name: string; input?: unknown }
  | { type: "llm"; model: string; provider?: string; prompt?: string; system?: string }
  | { type: "pipeline"; name: string; input?: unknown };
