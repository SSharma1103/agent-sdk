import type { Usage } from "../types.js";
import type { ToolDefinition, ToolRegistry } from "../tools/contracts.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ModelMessage = {
  role: ChatRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type BrainGenerateInput = {
  userId?: string;
  keyId?: string;
  provider?: string;
  model: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[] | string[];
  maxToolIterations?: number;
  executeTools?: boolean;
  metadata?: Record<string, unknown>;
  onToolCall?: (call: ToolCall) => Promise<void> | void;
};

export type BrainGenerateOutput = {
  text: string;
  toolCalls?: ToolCall[];
  usage: Usage;
  raw?: unknown;
};

export type BrainObjectInput<TSchema = unknown> = Omit<BrainGenerateInput, "messages"> & {
  schema: TSchema;
  prompt: string;
  system?: string;
};

export type BrainObjectOutput<T> = {
  object: T;
  usage: Usage;
  raw?: unknown;
};

export interface LLMProvider {
  name: string;
  generate(input: BrainGenerateInput, tools?: ToolRegistry): Promise<BrainGenerateOutput>;
  generateObject?<T>(input: BrainObjectInput, tools?: ToolRegistry): Promise<BrainObjectOutput<T>>;
}

export interface ApiKeyResolver {
  resolve(input: { userId?: string; keyId?: string; provider?: string }): Promise<{
    provider: string;
    apiKey?: string;
  }>;
}
