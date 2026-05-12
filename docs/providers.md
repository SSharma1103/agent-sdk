# Providers

Providers implement the `LLMProvider` interface.

```ts
export interface LLMProvider {
  name: string;
  generate(input: BrainGenerateInput, tools?: ToolRegistry): Promise<BrainGenerateOutput>;
  generateObject?<T>(input: BrainObjectInput, tools?: ToolRegistry): Promise<BrainObjectOutput<T>>;
}
```

## Built-In Providers

| Provider             | Status                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `OpenAIProvider`     | OpenAI-compatible chat completions and object generation.                                      |
| `LocalModelProvider` | OpenAI-compatible local endpoints such as Ollama or LM Studio.                                 |
| `AnthropicProvider`  | Not implemented yet; tracked in [issue #1](https://github.com/SSharma1103/agent-sdk/issues/1). |

## Provider Responsibilities

Provider adapters should:

- map SDK messages into provider request format
- map tool definitions into provider tool format
- map provider tool calls into SDK `ToolCall`
- normalize usage into SDK `Usage`
- throw SDK errors for request failures and unsupported capabilities

## API Keys

Use `BrainConfig.keyResolver` when provider selection or credentials depend on user context.
