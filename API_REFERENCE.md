# Agent SDK — API Reference

> Comprehensive reference for the Agent SDK TypeScript library.
> Generated from source files in `sdk/`.

---

## Table of Contents

1. [Core Types & Utilities](#core-types--utilities)
2. [Errors](#errors)
3. [Validation](#validation)
4. [Core / Brain](#core--brain)
5. [Orchestrator](#orchestrator)
6. [Pipelines](#pipelines)
7. [Tools](#tools)
8. [Transport](#transport)
9. [Storage](#storage)
10. [Memory](#memory)
11. [Auth](#auth)
12. [Triggers](#triggers)
13. [AgentSDK](#agentsdk)

---

## Core Types & Utilities

### `JsonObject`

```ts
export type JsonObject = Record<string, unknown>;
```

Utility type representing a JSON object with string keys and unknown values.

---

### `Usage`

```ts
export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};
```

Tracks token usage for LLM API calls.

| Property | Type | Description |
|----------|------|-------------|
| `promptTokens` | `number` | Tokens consumed by the prompt |
| `completionTokens` | `number` | Tokens generated in the response |
| `totalTokens` | `number` | Total tokens used |

---

### `ExecutionMode`

```ts
export type ExecutionMode = "sync" | "async" | "streaming";
```

Pipeline execution mode. Controls how the pipeline runs and streams results.

---

### `RunStatus`

```ts
export type RunStatus = "queued" | "running" | "success" | "error";
```

Status of a pipeline run.

---

### `Logger`

```ts
export type Logger = {
  debug?(message: string, meta?: JsonObject): void;
  info?(message: string, meta?: JsonObject): void;
  warn?(message: string, meta?: JsonObject): void;
  error?(message: string, meta?: JsonObject): void;
};
```

Structured logger interface. All methods are optional.

---

### `consoleLogger`

```ts
export const consoleLogger: Logger;
```

Default logger implementation that delegates to `console.debug`, `console.info`, `console.warn`, and `console.error`.

---

### `createId(prefix?)`

```ts
export function createId(prefix = "id"): string;
```

Generates a unique identifier with an optional prefix.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prefix` | `string` | `"id"` | Prefix for the generated ID |

**Returns:** `string` — Unique ID in the format `{prefix}_{random}`

**Notes:** Uses `crypto.randomUUID()` when available, falls back to `Date.now()` + `Math.random()`.

---

## Errors

### `AgentSDKError`

```ts
export class AgentSDKError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(options: AgentSDKErrorOptions);
}
```

Base error class for all SDK errors.

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` | Machine-readable error code |
| `details` | `Record<string, unknown>` | Additional error context |
| `cause` | `unknown` | Original cause (if provided) |

---

### `AgentSDKErrorOptions`

```ts
export type AgentSDKErrorOptions = {
  code: string;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};
```

Constructor options for `AgentSDKError`.

---

### `ValidationError`

```ts
export class ValidationError extends AgentSDKError {
  constructor(message: string, details?: Record<string, unknown>, cause?: unknown);
}
```

Thrown when input validation fails. Code: `"VALIDATION_ERROR"`.

---

### `NotImplementedError`

```ts
export class NotImplementedError extends AgentSDKError {
  constructor(message: string, details?: Record<string, unknown>);
}
```

Thrown when a feature is not yet implemented. Code: `"NOT_IMPLEMENTED"`.

---

### `ProviderNotFoundError`

```ts
export class ProviderNotFoundError extends AgentSDKError {
  constructor(provider: string);
}
```

Thrown when a requested LLM provider is not registered. Code: `"PROVIDER_NOT_FOUND"`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `string` | Name of the missing provider |

---

### `ProviderCapabilityError`

```ts
export class ProviderCapabilityError extends AgentSDKError {
  constructor(provider: string, capability: string);
}
```

Thrown when a provider does not support a requested capability (e.g., object generation). Code: `"PROVIDER_CAPABILITY_UNSUPPORTED"`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `string` | Provider name |
| `capability` | `string` | Capability that is unsupported |

---

### `ProviderRequestError`

```ts
export class ProviderRequestError extends AgentSDKError {
  constructor(provider: string, status: number, body: string);
}
```

Thrown when an LLM provider API request fails. Code: `"PROVIDER_REQUEST_FAILED"`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `string` | Provider name |
| `status` | `number` | HTTP status code |
| `body` | `string` | Response body |

---

### `PipelineNotFoundError`

```ts
export class PipelineNotFoundError extends AgentSDKError {
  constructor(pipelineName: string);
}
```

Thrown when a requested pipeline is not registered. Code: `"PIPELINE_NOT_FOUND"`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pipelineName` | `string` | Name of the missing pipeline |

---

### `ToolNotFoundError`

```ts
export class ToolNotFoundError extends AgentSDKError {
  constructor(toolName: string);
}
```

Thrown when a requested tool is not registered. Code: `"TOOL_NOT_FOUND"`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `toolName` | `string` | Name of the missing tool |

---

### `ToolExecutionError`

```ts
export class ToolExecutionError extends AgentSDKError {
  constructor(toolName: string, cause: unknown);
}
```

Thrown when a tool execution fails. Code: `"TOOL_EXECUTION_FAILED"`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `toolName` | `string` | Name of the tool that failed |
| `cause` | `unknown` | Original error |

---

## Validation

### `SafeParseSuccess<T>`

```ts
export type SafeParseSuccess<T> = { success: true; data: T };
```

Represents a successful schema parse result.

---

### `SafeParseFailure`

```ts
export type SafeParseFailure = { success: false; error: unknown };
```

Represents a failed schema parse result.

---

### `ValidationSchema<T>`

```ts
export type ValidationSchema<T = unknown> = {
  parse?(input: unknown): T;
  safeParse?(input: unknown): SafeParseSuccess<T> | SafeParseFailure;
};
```

Interface for validation schemas. Compatible with Zod, Valibot, and similar libraries.

---

### `Validator<T>`

```ts
export type Validator<T = unknown> = (input: unknown) => T;
```

Function type that validates unknown input and returns a typed value.

---

### `validateWithSchema(schema, input, label?)`

```ts
export function validateWithSchema<T>(
  schema: ValidationSchema<T>,
  input: unknown,
  label = "input"
): T;
```

Validates input against a schema. Prefers `safeParse`, falls back to `parse`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `schema` | `ValidationSchema<T>` | — | Validation schema |
| `input` | `unknown` | — | Value to validate |
| `label` | `string` | `"input"` | Label for error messages |

**Returns:** `T` — Validated and typed input

**Throws:** `ValidationError` if validation fails or schema has no parse method

---

### `createValidator(schema, label?)`

```ts
export function createValidator<T>(
  schema: ValidationSchema<T>,
  label?: string
): Validator<T>;
```

Creates a reusable validator function from a schema.

| Parameter | Type | Description |
|-----------|------|-------------|
| `schema` | `ValidationSchema<T>` | Validation schema |
| `label` | `string` | Label for error messages |

**Returns:** `Validator<T>` — Curried validator function

---

### `assertObject(input, label?)`

```ts
export function assertObject(
  input: unknown,
  label = "input"
): asserts input is Record<string, unknown>;
```

Asserts that input is a plain object (not null or array).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `unknown` | — | Value to check |
| `label` | `string` | `"input"` | Label for error messages |

**Throws:** `ValidationError` if input is not an object

---

### `assertString(value, label)`

```ts
export function assertString(
  value: unknown,
  label: string
): asserts value is string;
```

Asserts that value is a non-empty string.

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `unknown` | Value to check |
| `label` | `string` | Label for error messages |

**Throws:** `ValidationError` if value is not a non-empty string

---

## Core / Brain

### `ChatRole`

```ts
export type ChatRole = "system" | "user" | "assistant" | "tool";
```

Valid roles in a chat message sequence.

---

### `ModelMessage`

```ts
export type ModelMessage = {
  role: ChatRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};
```

A single message in a chat conversation.

| Property | Type | Description |
|----------|------|-------------|
| `role` | `ChatRole` | Message role |
| `content` | `string` | Message content |
| `name` | `string` | Optional name (for tool messages) |
| `toolCallId` | `string` | ID of the tool call this message responds to |
| `toolCalls` | `ToolCall[]` | Tool calls made by the assistant |

---

### `ToolCall`

```ts
export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};
```

Represents a tool call requested by an LLM.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique call ID |
| `name` | `string` | Tool name |
| `input` | `unknown` | Tool input arguments |

---

### `BrainGenerateInput`

```ts
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
};
```

Input for text generation via the Brain.

| Property | Type | Description |
|----------|------|-------------|
| `userId` | `string` | Optional user identifier |
| `keyId` | `string` | Optional API key identifier |
| `provider` | `string` | Target LLM provider name |
| `model` | `string` | Target model name |
| `messages` | `ModelMessage[]` | Chat message history |
| `tools` | `ToolDefinition[] \| string[]` | Tools to make available |
| `maxToolIterations` | `number` | Max tool call rounds (default: 4) |
| `executeTools` | `boolean` | Whether to execute tool calls |
| `metadata` | `Record<string, unknown>` | Arbitrary metadata |

---

### `BrainGenerateOutput`

```ts
export type BrainGenerateOutput = {
  text: string;
  toolCalls?: ToolCall[];
  usage: Usage;
  raw?: unknown;
};
```

Output from text generation.

| Property | Type | Description |
|----------|------|-------------|
| `text` | `string` | Generated text |
| `toolCalls` | `ToolCall[]` | Tool calls requested by the model |
| `usage` | `Usage` | Token usage statistics |
| `raw` | `unknown` | Raw provider response |

---

### `BrainObjectInput<TSchema>`

```ts
export type BrainObjectInput<TSchema = unknown> = Omit<BrainGenerateInput, "messages"> & {
  schema: TSchema;
  prompt: string;
  system?: string;
};
```

Input for structured object generation.

| Property | Type | Description |
|----------|------|-------------|
| `schema` | `TSchema` | Schema to validate against |
| `prompt` | `string` | User prompt |
| `system` | `string` | System instructions |

---

### `BrainObjectOutput<T>`

```ts
export type BrainObjectOutput<T> = {
  object: T;
  usage: Usage;
  raw?: unknown;
};
```

Output from structured object generation.

| Property | Type | Description |
|----------|------|-------------|
| `object` | `T` | Parsed structured object |
| `usage` | `Usage` | Token usage statistics |
| `raw` | `unknown` | Raw provider response |

---

### `LLMProvider`

```ts
export interface LLMProvider {
  name: string;
  generate(input: BrainGenerateInput, tools?: ToolRegistry): Promise<BrainGenerateOutput>;
  generateObject?<T>(input: BrainObjectInput, tools?: ToolRegistry): Promise<BrainObjectOutput<T>>;
}
```

Interface for LLM provider adapters.

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `name` | `string` | Provider name |
| `generate` | `(input, tools?) => Promise<BrainGenerateOutput>` | Generate text completion |
| `generateObject?` | `(input, tools?) => Promise<BrainObjectOutput<T>>` | Generate structured object (optional) |

---

### `ApiKeyResolver`

```ts
export interface ApiKeyResolver {
  resolve(input: { userId?: string; keyId?: string; provider?: string }): Promise<{
    provider: string;
    apiKey?: string;
  }>;
}
```

Resolves which provider and API key to use for a given user/key combination.

---

### `BrainConfig`

```ts
export type BrainConfig = {
  providers: LLMProvider[];
  defaultProvider?: string;
  storage?: Storage;
  tools?: ToolRegistry;
  keyResolver?: ApiKeyResolver;
  logger?: Logger;
  maxToolIterations?: number;
  executeTools?: boolean;
};
```

Configuration for the Brain.

| Property | Type | Description |
|----------|------|-------------|
| `providers` | `LLMProvider[]` | Registered LLM providers |
| `defaultProvider` | `string` | Default provider name |
| `storage` | `Storage` | Storage for usage tracking |
| `tools` | `ToolRegistry` | Available tools |
| `keyResolver` | `ApiKeyResolver` | API key resolver |
| `logger` | `Logger` | Logger instance |
| `maxToolIterations` | `number` | Max tool call rounds |
| `executeTools` | `boolean` | Whether to execute tools by default |

---

### `Brain`

```ts
export class Brain {
  constructor(config: BrainConfig);
  registerProvider(provider: LLMProvider): void;
  run(input: BrainGenerateInput): Promise<BrainGenerateOutput>;
  runObject<T>(input: BrainObjectInput): Promise<BrainObjectOutput<T>>;
}
```

Orchestrates LLM inference with tool execution, usage tracking, and provider routing.

#### `constructor(config)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `BrainConfig` | Brain configuration |

#### `registerProvider(provider)`

Registers an additional LLM provider at runtime.

| Parameter | Type | Description |
|-----------|------|-------------|
| `provider` | `LLMProvider` | Provider to register |

#### `run(input)`

Runs text generation with optional tool execution loop.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `BrainGenerateInput` | Generation input |

**Returns:** `Promise<BrainGenerateOutput>`

**Throws:** `ProviderNotFoundError`, `ToolExecutionError`

**Notes:**
- Automatically executes tool calls up to `maxToolIterations` times
- Aggregates usage across all iterations
- Persists usage to storage asynchronously

#### `runObject<T>(input)`

Runs structured object generation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `BrainObjectInput` | Object generation input |

**Returns:** `Promise<BrainObjectOutput<T>>`

**Throws:** `ProviderNotFoundError`, `ProviderCapabilityError`

---

### `OpenAIProvider`

```ts
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  constructor(config?: OpenAIProviderConfig);
  generate(input: BrainGenerateInput, tools?: ToolRegistry): Promise<BrainGenerateOutput>;
  generateObject<T>(input: BrainObjectInput): Promise<BrainObjectOutput<T>>;
}
```

LLM provider adapter for OpenAI-compatible APIs.

#### `OpenAIProviderConfig`

```ts
type OpenAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  fetch?: typeof fetch;
};
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `apiKey` | `string` | — | OpenAI API key |
| `baseUrl` | `string` | `"https://api.openai.com/v1"` | API base URL |
| `defaultModel` | `string` | — | Default model name |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |

**Throws:** `ProviderRequestError` on API failure, `ValidationError` for invalid tool messages

---

### `AnthropicProvider`

```ts
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  async generate(_input: BrainGenerateInput): Promise<BrainGenerateOutput>;
}
```

Placeholder adapter for Anthropic. Throws `NotImplementedError` — provide a custom implementation.

---

### `LocalModelProvider`

```ts
export class LocalModelProvider implements LLMProvider {
  readonly name = "local";

  constructor(config?: {
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    fetch?: typeof fetch;
  });
}
```

OpenAI compatible provider for local models such as Ollama or LM Studio.

By default, requests are sent to: `http://localhost:11434/v1/chat/completions`

Supports:
- OpenAI compatible local endpoints
- Custom base URLs
- Optional API key authentication
- Tool/function calling support

---

## Orchestrator

### `Strategy`

```ts
export type Strategy = "sequential" | "parallel" | "agentic" | "planner-executor";
```

Execution strategy for multi-step pipeline runs.

---

### `OrchestratorConfig`

```ts
export type OrchestratorConfig = {
  storage?: Storage;
  logger?: Logger;
  defaultMode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  hooks?: PipelineHooks;
  errorPolicy?: "throw" | "returnFallback";
  fallbackOutput?: unknown;
};
```

Configuration for the Orchestrator.

| Property | Type | Description |
|----------|------|-------------|
| `storage` | `Storage` | Persistence layer |
| `logger` | `Logger` | Logger instance |
| `defaultMode` | `ExecutionMode` | Default pipeline execution mode |
| `metadata` | `Record<string, unknown>` | Global metadata added to all runs |
| `hooks` | `PipelineHooks` | Global hooks |
| `errorPolicy` | `"throw" \| "returnFallback"` | How to handle errors |
| `fallbackOutput` | `unknown` | Default fallback output on error |

---

### `Orchestrator`

```ts
export class Orchestrator {
  constructor(config?: OrchestratorConfig);
  registerPipeline(pipeline: Pipeline): void;
  getPipeline(name: string): Pipeline | undefined;
  run<T = unknown>(name: string, input: unknown, options?: PipelineRunOptions): Promise<T>;
  runStrategy(strategy: Strategy, steps: Array<{ name: string; input: unknown }>): Promise<unknown[]>;
}
```

Manages pipeline registry, execution lifecycle, hooks, and error handling.

#### `constructor(config?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `config` | `OrchestratorConfig` | `{}` | Orchestrator configuration |

#### `registerPipeline(pipeline)`

Registers a pipeline for execution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pipeline` | `Pipeline` | Pipeline instance |

#### `getPipeline(name)`

Retrieves a registered pipeline by name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Pipeline name |

**Returns:** `Pipeline | undefined`

#### `run<T>(name, input, options?)`

Executes a registered pipeline.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Pipeline name |
| `input` | `unknown` | Pipeline input |
| `options` | `PipelineRunOptions` | Run options |

**Returns:** `Promise<T>` — Pipeline output

**Throws:** `PipelineNotFoundError`, or the pipeline's own errors

**Lifecycle:**
1. Validates input against schema
2. Emits `beforeRun` hooks
3. Executes pipeline
4. Emits `afterRun` hooks
5. Persists run status to storage

#### `runStrategy(strategy, steps)`

Runs multiple pipelines with a coordination strategy.

| Parameter | Type | Description |
|-----------|------|-------------|
| `strategy` | `Strategy` | Execution strategy |
| `steps` | `Array<{ name: string; input: unknown }>` | Steps to execute |

**Returns:** `Promise<unknown[]>` — Array of step outputs

| Strategy | Behavior |
|----------|----------|
| `"parallel"` | Runs all steps concurrently |
| `"sequential"` | Runs steps one at a time |
| `"agentic"` / `"planner-executor"` | Sequential with logging |

---

## Pipelines

### `Pipeline<TInput, TOutput>`

```ts
export interface Pipeline<TInput = unknown, TOutput = unknown> {
  name: string;
  hooks?: PipelineHooks<TInput, TOutput>;
  inputSchema?: ValidationSchema<TInput>;
  run(input: TInput, context?: PipelineContext): Promise<TOutput>;
  validate?(input: TInput): void;
}
```

Core pipeline interface.

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `name` | `string` | Pipeline name |
| `hooks` | `PipelineHooks` | Pipeline-specific hooks |
| `inputSchema` | `ValidationSchema` | Input validation schema |
| `run` | `(input, context?) => Promise<TOutput>` | Execute pipeline |
| `validate?` | `(input) => void` | Custom validation hook |

---

### `PipelineContext`

```ts
export type PipelineContext = {
  runId?: string;
  mode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  emit?(event: PipelineEvent): Promise<void> | void;
};
```

Context passed to pipeline `run()` methods.

---

### `PipelineEvent`

```ts
export type PipelineEvent = {
  type: string;
  payload?: unknown;
  runId?: string;
  pipelineName?: string;
  stepId?: string;
};
```

Event emitted during pipeline execution.

---

### `PipelineRunOptions`

```ts
export type PipelineRunOptions = {
  mode?: ExecutionMode;
  metadata?: Record<string, unknown>;
  hooks?: PipelineHooks;
  emit?: PipelineContext["emit"];
  errorPolicy?: "throw" | "returnFallback";
  fallbackOutput?: unknown;
};
```

Options for a single pipeline run.

---

### `PipelineExecutionResult<TOutput>`

```ts
export type PipelineExecutionResult<TOutput = unknown> = {
  runId: string;
  pipelineName: string;
  status: "success" | "error";
  output?: TOutput;
  error?: unknown;
  metadata?: Record<string, unknown>;
};
```

Result of a pipeline execution.

---

### `PipelineHookContext<TInput, TOutput>`

```ts
export type PipelineHookContext<TInput = unknown, TOutput = unknown> = PipelineContext & {
  pipelineName: string;
  input: TInput;
  output?: TOutput;
  error?: unknown;
};
```

Context passed to pipeline hooks.

---

### `PipelineHooks<TInput, TOutput>`

```ts
export type PipelineHooks<TInput = unknown, TOutput = unknown> = {
  beforeRun?(context: PipelineHookContext<TInput, TOutput>): Promise<void> | void;
  afterRun?(context: PipelineHookContext<TInput, TOutput>): Promise<void> | void;
  onError?(context: PipelineHookContext<TInput, TOutput>): Promise<TOutput | void> | TOutput | void;
};
```

Lifecycle hooks for pipelines.

| Hook | When Called | Return Value |
|------|-------------|--------------|
| `beforeRun` | Before pipeline execution | `void` |
| `afterRun` | After successful execution | `void` |
| `onError` | On execution failure | Fallback output or `void` |

---

### `PipelineDefinition`

```ts
export type PipelineDefinition = {
  name: string;
  hooks?: PipelineHooks;
  metadata?: Record<string, unknown>;
  steps: PipelineStep[];
};
```

Definition for a declarative pipeline.

---

### `DeclarativePipelineConfig`

```ts
export type DeclarativePipelineConfig = PipelineDefinition;
```

Alias for `PipelineDefinition`.

---

### `PipelineStepState`

```ts
export type PipelineStepState = {
  input: unknown;
  current: unknown;
  steps: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
```

Mutable state passed through declarative pipeline steps.

---

### `PipelineStepBase<TInput, TOutput>`

```ts
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
```

Base properties for all declarative pipeline steps.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Step identifier |
| `input` | `TInput` | Static input |
| `when` | `(state) => boolean` | Conditional execution |
| `mapInput` | `(state) => TInput` | Dynamic input mapping |
| `mapOutput` | `(output, state) => unknown` | Output transformation |
| `retry` | `number \| { attempts: number }` | Retry policy |
| `timeoutMs` | `number` | Step timeout |
| `fallback` | `TOutput \| ((error, state) => TOutput)` | Fallback on failure |

---

### `ToolPipelineStep`

```ts
export type ToolPipelineStep = PipelineStepBase & {
  type: "tool";
  name: string;
};
```

Step that calls a registered tool.

---

### `LLMPipelineStep`

```ts
export type LLMPipelineStep = PipelineStepBase<unknown, unknown> & {
  type: "llm";
  model: string;
  provider?: string;
  prompt?: string | ((state) => string | Promise<string>);
  system?: string | ((state) => string | Promise<string>);
  buildInput?: (state) => BrainGenerateInput | Promise<BrainGenerateInput>;
};
```

Step that calls the Brain/LLM.

---

### `NestedPipelineStep`

```ts
export type NestedPipelineStep = PipelineStepBase & {
  type: "pipeline";
  name: string;
};
```

Step that runs another registered pipeline.

---

### `PipelineStep`

```ts
export type PipelineStep = ToolPipelineStep | LLMPipelineStep | NestedPipelineStep;
```

Union of all step types.

---

### `PipelineBase<TInput, TOutput>`

```ts
export abstract class PipelineBase<TInput = unknown, TOutput = unknown> implements Pipeline<TInput, TOutput> {
  abstract readonly name: string;
  readonly hooks?: PipelineHooks<TInput, TOutput>;
  readonly inputSchema?: ValidationSchema<TInput>;

  constructor(config?: { hooks?: PipelineHooks<TInput, TOutput>; inputSchema?: ValidationSchema<TInput> });
  validate(input: TInput): void;
  abstract run(input: TInput, context?: PipelineContext): Promise<TOutput>;
  protected emit(context, type, payload?): Promise<void> | void;
}
```

Abstract base class for custom pipelines.

#### `constructor(config?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.hooks` | `PipelineHooks` | Pipeline hooks |
| `config.inputSchema` | `ValidationSchema` | Input validation schema |

#### `validate(input)`

Validates input against `inputSchema` if defined.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `TInput` | Input to validate |

#### `emit(context, type, payload?)`

Protected helper to emit pipeline events.

---

### `ScrapePipeline`

```ts
export class ScrapePipeline implements Pipeline<ScrapePipelineInput, unknown> {
  readonly name = "scrape";
  constructor(deps: { storage: Storage; scrape: (input: ScrapePipelineInput) => Promise<unknown> });
  validate(input: ScrapePipelineInput): void;
  run(input: ScrapePipelineInput): Promise<unknown>;
}
```

Pipeline for web scraping operations.

#### `ScrapePipelineInput`

```ts
export type ScrapePipelineInput = {
  url: string;
  strategy?: string;
  maxDepth?: number;
  maxPages?: number;
  detailLevel?: string;
  includeExternal?: boolean;
};
```

| Property | Type | Description |
|----------|------|-------------|
| `url` | `string` | Target URL to scrape |
| `strategy` | `string` | Scraping strategy |
| `maxDepth` | `number` | Max crawl depth |
| `maxPages` | `number` | Max pages to fetch |
| `detailLevel` | `string` | Detail level |
| `includeExternal` | `boolean` | Include external links |

**Throws:** `Error` if `url` is missing

---

### `OnboardingApiPipeline`

```ts
export class OnboardingApiPipeline implements Pipeline<OnboardingApiInput, unknown> {
  readonly name = "onboarding-api";
  constructor(deps: { brain: Brain; memory: SessionMemory });
  run(input: OnboardingApiInput): Promise<unknown>;
}
```

Pipeline for managing interactive onboarding sessions.

#### `OnboardingApiInput`

```ts
export type OnboardingApiInput =
  | { operation: "createSession"; pipelineId: string; fields: Array<{ id: string; question: string }>; context?: string }
  | { operation: "answer"; sessionId: string; fieldId: string; value: unknown };
```

| Operation | Description |
|-----------|-------------|
| `"createSession"` | Create a new onboarding session |
| `"answer"` | Submit an answer for a field |

---

### `DeclarativePipeline`

```ts
export class DeclarativePipeline implements Pipeline {
  readonly name: string;
  readonly hooks;
  constructor(config: DeclarativePipelineConfig, deps: { brain: Brain; tools: ToolRegistry; orchestrator?: Orchestrator });
  run(input: unknown, context?: PipelineContext): Promise<unknown>;
}
```

Pipeline defined via a declarative configuration of steps.

#### `constructor(config, deps)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `DeclarativePipelineConfig` | Step definitions |
| `deps.brain` | `Brain` | Brain for LLM steps |
| `deps.tools` | `ToolRegistry` | Tools for tool steps |
| `deps.orchestrator` | `Orchestrator` | Required for nested pipeline steps |

**Features:**
- Conditional execution via `when`
- Input/output mapping
- Retry with configurable attempts
- Timeout support
- Fallback on failure
- Event emission for each step

---

### `EmailPipeline`

```ts
export class EmailPipeline implements Pipeline<EmailPipelineInput, EmailPipelineOutput> {
  readonly name = "email";
  constructor(deps: EmailPipelineDeps);
  validate(input: EmailPipelineInput): void;
  run(input: EmailPipelineInput): Promise<EmailPipelineOutput>;
}
```

Pipeline for email automation with workflow rules and AI replies.

#### `EmailPipelineDeps`

```ts
export type EmailPipelineDeps = {
  storage: Storage;
  brain: Brain;
  tools?: ToolRegistry;
  shareBaseUrl?: string;
  defaultModel?: string;
  defaultProvider?: string;
  hooks?: EmailPipelineHooks;
};
```

#### `EmailPipelineHooks`

```ts
export type EmailPipelineHooks = {
  matchRule?(rule, email, pipeline): boolean | Promise<boolean>;
  onRuleMatched?(rule, email, pipeline): EmailPipelineOutput | void | Promise<...>;
  onNoMatchingRule?(email, pipeline): EmailPipelineOutput | void | Promise<...>;
  buildMessages?(email, pipeline): ModelMessage[] | Promise<ModelMessage[]>;
  selectTools?(email, pipeline, tools?): ToolDefinition[] | string[] | undefined | Promise<...>;
};
```

#### `EmailPipelineInput`

```ts
export type EmailPipelineInput =
  | { operation: "ensure"; userId: string }
  | { operation: "updateConfig"; userId: string; patch: EmailPipelineConfigPatch }
  | { operation: "addWorkflowRule"; userId: string; rule: Omit<WorkflowRule, "id"> }
  | { operation: "processIncomingEmail"; token: string; email: IncomingEmail }
  | { operation: "stats"; userId: string };
```

#### `EmailPipelineOutput`

```ts
export type EmailPipelineOutput =
  | EmailPipelineRecord
  | WorkflowRule
  | { handled: "rule" | "brain" | "skipped"; rule?: WorkflowRule; reply?: string; usage?: Usage }
  | { rulesHandled: number; brainReplies: number; tokensUsed: number };
```

#### `IncomingEmail`

```ts
export type IncomingEmail = {
  threadId: string;
  from: string;
  subject: string;
  body: string;
};
```

#### `EmailPipelineConfigPatch`

```ts
export type EmailPipelineConfigPatch = Partial<{
  name: string;
  context: string;
  model: string;
  provider: string;
  keyId: string | null;
  agentmailInboxId: string | null;
}>;
```

---

## Tools

### `ToolRuntime`

```ts
export type ToolRuntime = "stdio" | "http" | "grpc" | "local";
```

Execution runtime for tools.

---

### `ToolDefinition`

```ts
export type ToolDefinition = {
  name: string;
  description?: string;
  schema?: unknown;
};
```

Minimal tool definition (name + metadata).

---

### `ToolConnector<TInput, TOutput>`

```ts
export interface ToolConnector<TInput = unknown, TOutput = unknown> extends ToolDefinition {
  type: ToolRuntime;
  call(input: TInput): Promise<TOutput>;
}
```

Executable tool connector.

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `type` | `ToolRuntime` | Runtime type |
| `call` | `(input) => Promise<TOutput>` | Execute the tool |

---

### `ToolRegistry`

```ts
export class ToolRegistry {
  register(connector: ToolConnector): void;
  get(name: string): ToolConnector | undefined;
  list(): ToolConnector[];
  resolveMany(tools?: ToolDefinition[] | string[]): ToolConnector[];
  call(name: string, input: unknown): Promise<unknown>;
}
```

Registry for managing and executing tools.

#### `register(connector)`

Registers a tool connector.

| Parameter | Type | Description |
|-----------|------|-------------|
| `connector` | `ToolConnector` | Tool to register |

#### `get(name)`

Retrieves a tool by name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Tool name |

**Returns:** `ToolConnector | undefined`

#### `list()`

Lists all registered tools.

**Returns:** `ToolConnector[]`

#### `resolveMany(tools?)`

Resolves tool definitions to connectors.

| Parameter | Type | Description |
|-----------|------|-------------|
| `tools` | `ToolDefinition[] \| string[]` | Tool names or definitions |

**Returns:** `ToolConnector[]` — Unresolved tools become local no-ops

#### `call(name, input)`

Executes a tool by name.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Tool name |
| `input` | `unknown` | Tool input |

**Returns:** `Promise<unknown>` — Tool output

**Throws:** `ToolNotFoundError` if tool is not registered

---

### `LocalToolConnector<TInput, TOutput>`

```ts
export class LocalToolConnector<TInput = unknown, TOutput = unknown> implements ToolConnector<TInput, TOutput> {
  readonly type = "local";
  constructor(
    name: string,
    handler: (input: TInput) => Promise<TOutput> | TOutput,
    description?: string,
    schema?: unknown
  );
  call(input: TInput): Promise<TOutput>;
}
```

Local function-based tool connector.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Tool name |
| `handler` | `(input) => TOutput \| Promise<TOutput>` | Tool implementation |
| `description` | `string` | Tool description |
| `schema` | `unknown` | JSON schema for parameters |

---

### `TransportToolConnector<TInput, TOutput>`

```ts
export class TransportToolConnector<TInput = unknown, TOutput = unknown> implements ToolConnector<TInput, TOutput> {
  constructor(
    type: Exclude<ToolRuntime, "local">,
    name: string,
    transport: Transport,
    description?: string,
    schema?: unknown
  );
  call(input: TInput): Promise<TOutput>;
}
```

Tool connector that delegates to a Transport layer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `ToolRuntime` | Transport type (`stdio`, `http`, `grpc`) |
| `name` | `string` | Tool name |
| `transport` | `Transport` | Transport instance |
| `description` | `string` | Tool description |
| `schema` | `unknown` | JSON schema for parameters |

---

## Transport

### `TransportRequest`

```ts
export type TransportRequest = {
  route?: string;
  headers?: Record<string, string>;
  body?: unknown;
  metadata?: Record<string, unknown>;
};
```

Generic transport request.

---

### `TransportResponse<T>`

```ts
export type TransportResponse<T = unknown> = {
  status?: number;
  body: T;
  headers?: Record<string, string>;
};
```

Generic transport response.

---

### `Transport`

```ts
export interface Transport {
  send<T = unknown>(request: TransportRequest): Promise<TransportResponse<T> | T>;
}
```

Generic transport interface.

---

### `HttpTransport`

```ts
export class HttpTransport implements Transport {
  constructor(config?: { baseUrl?: string; fetch?: typeof fetch });
  send<T = unknown>(request: TransportRequest): Promise<TransportResponse<T>>;
}
```

HTTP transport implementation using `fetch`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `baseUrl` | `string` | `""` | Base URL prefix |
| `fetch` | `typeof fetch` | `globalThis.fetch` | Custom fetch implementation |

---

### `WebSocketTransport`

```ts
export class WebSocketTransport implements Transport {
  send<T = unknown>(_request: TransportRequest): Promise<T>;
}
```

Placeholder WebSocket transport. Throws `Error` — provide a runtime-specific adapter.

---

### `StdioTransport`

```ts
export class StdioTransport implements Transport {
  send<T = unknown>(_request: TransportRequest): Promise<T>;
}
```

Placeholder stdio transport. Throws `Error` — provide a runtime-specific adapter.

---

### `QueueClient`

```ts
export interface QueueClient {
  enqueue(queue: string, payload: unknown): Promise<unknown>;
}
```

Interface for queue-based transports.

---

### `QueueTransport`

```ts
export class QueueTransport implements Transport {
  constructor(queue: QueueClient, queueName = "agent-sdk");
  send<T = unknown>(request: TransportRequest): Promise<T>;
}
```

Transport that enqueues requests to a queue system.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `queue` | `QueueClient` | — | Queue client |
| `queueName` | `string` | `"agent-sdk"` | Queue name |

---

## Storage

### `RunRecord`

```ts
export type RunRecord = {
  id: string;
  pipelineName: string;
  status: RunStatus;
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
  startedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
};
```

Record of a pipeline execution.

---

### `UsageRecord`

```ts
export type UsageRecord = {
  userId?: string;
  keyId?: string;
  provider: string;
  model: string;
  usage: Usage;
  metadata?: Record<string, unknown>;
};
```

Record of LLM usage.

---

### `EmailPipelineRecord`

```ts
export type EmailPipelineRecord = {
  id: string;
  userId: string;
  name: string;
  context: string;
  model: string;
  provider: string;
  keyId: string | null;
  agentmailInboxId?: string | null;
  rules: WorkflowRule[];
  webhookToken: string;
  webhookSecretLastFour?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

Persisted email pipeline configuration.

---

### `WorkflowRuleMatch`

```ts
export type WorkflowRuleMatch = {
  field: "subject" | "from" | "body";
  op: "contains" | "equals" | "startsWith";
  value: string;
};
```

Matching criteria for email workflow rules.

---

### `WorkflowRuleAction`

```ts
export type WorkflowRuleAction =
  | { kind: "reply"; text: string }
  | { kind: "skip" }
  | { kind: "forward"; to: string };
```

Actions available for workflow rules.

---

### `WorkflowRule`

```ts
export type WorkflowRule = {
  id: string;
  match: WorkflowRuleMatch;
  action: WorkflowRuleAction;
};
```

Email workflow rule.

---

### `Storage`

```ts
export interface Storage {
  saveRun(data: Omit<RunRecord, "id" | "startedAt"> & Partial<Pick<RunRecord, "id" | "startedAt">>): Promise<void>;
  updateRun?(id: string, data: Partial<RunRecord>): Promise<void>;
  getRuns(filter?: { pipelineName?: string; limit?: number }): Promise<RunRecord[]>;
  saveUsage?(record: UsageRecord): Promise<void>;
  getUsage?(filter?: { userId?: string; keyId?: string }): Promise<UsageRecord[]>;
  getEmailPipelineByUser?(userId: string): Promise<EmailPipelineRecord | null>;
  getEmailPipelineByWebhookToken?(token: string): Promise<EmailPipelineRecord | null>;
  saveEmailPipeline?(record: EmailPipelineRecord): Promise<EmailPipelineRecord>;
}
```

Storage interface for persistence. All methods except `saveRun` and `getRuns` are optional.

| Method | Description |
|--------|-------------|
| `saveRun` | Save a pipeline run record |
| `updateRun` | Update an existing run |
| `getRuns` | Query run records |
| `saveUsage` | Save LLM usage data |
| `getUsage` | Query usage records |
| `getEmailPipelineByUser` | Get email pipeline by user |
| `getEmailPipelineByWebhookToken` | Get email pipeline by webhook token |
| `saveEmailPipeline` | Save email pipeline config |

---

### `MemoryStore`

```ts
export class MemoryStore implements Storage {
  constructor();
  saveRun(data): Promise<void>;
  updateRun(id, data): Promise<void>;
  getRuns(filter?): Promise<RunRecord[]>;
  saveUsage(record): Promise<void>;
  getUsage(filter?): Promise<UsageRecord[]>;
  getEmailPipelineByUser(userId): Promise<EmailPipelineRecord | null>;
  getEmailPipelineByWebhookToken(token): Promise<EmailPipelineRecord | null>;
  saveEmailPipeline(record): Promise<EmailPipelineRecord>;
}
```

In-memory storage implementation. Not persisted across restarts.

---

### `PrismaStore`

```ts
export class PrismaStore implements Storage {
  constructor(prisma: PrismaLike);
  saveRun(data): Promise<void>;
  updateRun(id, data): Promise<void>;
  getRuns(filter?): Promise<RunRecord[]>;
  saveUsage(record): Promise<void>;
  getUsage(filter?): Promise<UsageRecord[]>;
  getEmailPipelineByUser(userId): Promise<EmailPipelineRecord | null>;
  getEmailPipelineByWebhookToken(token): Promise<EmailPipelineRecord | null>;
  saveEmailPipeline(record): Promise<EmailPipelineRecord>;
}
```

Prisma ORM storage adapter.

#### `PrismaLike`

```ts
type PrismaLike = {
  llmUsage?: { create(input); findMany(input?); };
  emailPipeline?: { findUnique(input); create(input); update(input); };
  orchestrationRun?: { create(input); findMany(input?); update(input); };
};
```

---

## Memory

### `SessionMemory`

```ts
export interface SessionMemory {
  getSession<T = unknown>(sessionId: string): Promise<T | null>;
  setSession<T = unknown>(sessionId: string, value: T, ttlMs?: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  appendPersistent?(key: string, value: unknown): Promise<void>;
  readPersistent?<T = unknown>(key: string): Promise<T[]>;
}
```

Interface for session/memory storage.

| Method | Description |
|--------|-------------|
| `getSession` | Retrieve a session value |
| `setSession` | Store a session value with optional TTL |
| `deleteSession` | Remove a session |
| `appendPersistent` | Append to a persistent list |
| `readPersistent` | Read a persistent list |

---

### `InMemorySessionStore`

```ts
export class InMemorySessionStore implements SessionMemory {
  constructor();
  getSession<T>(sessionId): Promise<T | null>;
  setSession<T>(sessionId, value, ttlMs?): Promise<void>;
  deleteSession(sessionId): Promise<void>;
  appendPersistent(key, value): Promise<void>;
  readPersistent<T>(key): Promise<T[]>;
}
```

In-memory session store with TTL support and persistent lists.

---

## Auth

### `Principal`

```ts
export type Principal = {
  id: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
};
```

Authenticated user principal.

---

### `AuthProvider`

```ts
export interface AuthProvider {
  authenticate(request: { headers?: Record<string, string>; token?: string }): Promise<Principal | null>;
}
```

Authentication provider interface.

---

### `ApiKeyStore`

```ts
export interface ApiKeyStore {
  findByToken(token: string): Promise<Principal | null>;
}
```

Store for API key lookups.

---

### `ApiKeyAuthProvider`

```ts
export class ApiKeyAuthProvider implements AuthProvider {
  constructor(keys: ApiKeyStore);
  authenticate(request): Promise<Principal | null>;
}
```

Bearer token / API key authentication provider.

| Parameter | Type | Description |
|-----------|------|-------------|
| `keys` | `ApiKeyStore` | API key store |

**Notes:** Extracts token from `request.token` or `Authorization: Bearer <token>` header.

---

### `OAuthProvider`

```ts
export class OAuthProvider implements AuthProvider {
  authenticate(request): Promise<Principal | null>;
}
```

Placeholder OAuth provider. Throws `Error` — provide an OAuth/OIDC verifier adapter.

---

## Triggers

### `TriggerEvent<T>`

```ts
export type TriggerEvent<T = unknown> = {
  type: "webhook" | "cron" | "event";
  name: string;
  payload: T;
  headers?: Record<string, string>;
};
```

Event fired by a trigger.

---

### `Trigger<T>`

```ts
export interface Trigger<T = unknown> {
  name: string;
  type: TriggerEvent["type"];
  start(handler: (event: TriggerEvent<T>) => Promise<void>): Promise<void>;
  stop?(): Promise<void>;
}
```

Trigger interface for event sources.

---

### `InternalEventTrigger<T>`

```ts
export class InternalEventTrigger<T = unknown> implements Trigger<T> {
  readonly type = "event";
  constructor(name: string);
  start(handler): Promise<void>;
  emit(payload: T): Promise<void>;
}
```

In-memory event trigger. Use `emit()` to fire events programmatically.

| Method | Description |
|--------|-------------|
| `start` | Attach event handler |
| `emit` | Fire an event |

**Throws:** `Error` if `emit` is called before `start`

---

### `WebhookTrigger<T>`

```ts
export class WebhookTrigger<T = unknown> implements Trigger<T> {
  readonly type = "webhook";
  constructor(name: string);
  start(_handler): Promise<void>;
}
```

Webhook trigger placeholder. Framework adapters bind HTTP requests to the handler.

---

### `CronTrigger<T>`

```ts
export class CronTrigger<T = unknown> implements Trigger<T> {
  readonly type = "cron";
  constructor(name: string, schedule: string);
  start(_handler): Promise<void>;
}
```

Cron trigger placeholder. Runtime adapters provide scheduling.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Trigger name |
| `schedule` | `string` | Cron expression |

---

## AgentSDK

### `AgentSDKConfig`

```ts
export type AgentSDKConfig = OrchestratorConfig & {
  brain?: Brain;
  provider?: Brain;
  transport?: Transport;
  storage?: Storage;
};
```

Configuration for the main AgentSDK.

| Property | Type | Description |
|----------|------|-------------|
| `brain` | `Brain` | Brain instance |
| `provider` | `Brain` | Alias for `brain` |
| `transport` | `Transport` | Default transport |
| `storage` | `Storage` | Storage instance |

**Notes:** Inherits all `OrchestratorConfig` properties.

---

### `AgentSDK`

```ts
export class AgentSDK {
  readonly orchestrator: Orchestrator;
  readonly brain?: Brain;

  constructor(config?: AgentSDKConfig);
  registerPipeline(pipeline: Pipeline): void;
  registerPipeline(name: string, pipeline: Pipeline): void;
  runPipeline<T = unknown>(name: string, input: unknown, options?: PipelineRunOptions): Promise<T>;
  runStrategy(strategy: Strategy, steps: Array<{ name: string; input: unknown }>): Promise<unknown[]>;
}
```

Main entry point for the Agent SDK. Composes Brain, Orchestrator, and pipelines.

#### `constructor(config?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `config` | `AgentSDKConfig` | `{}` | SDK configuration |

#### `registerPipeline(pipeline)` / `registerPipeline(name, pipeline)`

Registers a pipeline.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Pipeline name (optional if pipeline has `name`) |
| `pipeline` | `Pipeline` | Pipeline instance |

**Throws:** `Error` if pipeline is missing

#### `runPipeline<T>(name, input, options?)`

Runs a registered pipeline.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Pipeline name |
| `input` | `unknown` | Pipeline input |
| `options` | `PipelineRunOptions` | Run options |

**Returns:** `Promise<T>` — Pipeline output

#### `runStrategy(strategy, steps)`

Runs multiple pipelines with a coordination strategy.

| Parameter | Type | Description |
|-----------|------|-------------|
| `strategy` | `Strategy` | Execution strategy |
| `steps` | `Array<{ name: string; input: unknown }>` | Steps to execute |

**Returns:** `Promise<unknown[]>` — Array of step outputs

---

## Package Exports

The following are re-exported from `sdk/index.ts`:

- `AgentSDK`
- `Brain`, `OpenAIProvider`, `AnthropicProvider`, `LocalModelProvider`
- `Orchestrator`
- `PipelineBase`, `DeclarativePipeline`, `ScrapePipeline`, `OnboardingApiPipeline`, `EmailPipeline`
- `ToolRegistry`, `LocalToolConnector`, `TransportToolConnector`
- `MemoryStore`, `PrismaStore`, `InMemorySessionStore`
- `HttpTransport`, `WebSocketTransport`, `StdioTransport`, `QueueTransport`
- `ApiKeyAuthProvider`, `OAuthProvider`
- `InternalEventTrigger`, `WebhookTrigger`, `CronTrigger`
- All error classes: `AgentSDKError`, `ValidationError`, `NotImplementedError`, `ProviderNotFoundError`, `ProviderCapabilityError`, `ProviderRequestError`, `PipelineNotFoundError`, `ToolNotFoundError`, `ToolExecutionError`
- All types and contracts

---

*Generated on 2026-05-05 from source files in `/root/projects/agent-sdk/sdk/`.*
