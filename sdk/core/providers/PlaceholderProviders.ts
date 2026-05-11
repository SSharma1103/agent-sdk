import type { BrainGenerateInput, BrainGenerateOutput, LLMProvider } from "../contracts.js";
import { NotImplementedError, ProviderRequestError, ValidationError } from "../../errors.js";
import type { ToolRegistry } from "../../tools/contracts.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  async generate(_input: BrainGenerateInput): Promise<BrainGenerateOutput> {
    throw new NotImplementedError("[AnthropicProvider] adapter is intentionally pluggable and not implemented yet");
  }
}

export class LocalModelProvider implements LLMProvider {
  readonly name = "local";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: {
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      fetch?: typeof fetch;
    } = {},
  ) {
    this.baseUrl = config.baseUrl ?? "http://localhost:11434/v1";
    this.fetchImpl = config.fetch ?? fetch;
  }

  async generate(input: BrainGenerateInput, tools?: ToolRegistry): Promise<BrainGenerateOutput> {
    const resolvedTools = tools?.resolveMany(input.tools);
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model || this.config.defaultModel,
        messages: input.messages.map(toLocalMessage),
        tools: resolvedTools?.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.schema ?? { type: "object", properties: {} },
          },
        })),
      }),
    });

    if (!response.ok) {
      throw new ProviderRequestError("LocalModelProvider", response.status, await response.text());
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const message = json.choices?.[0]?.message;
    return {
      text: message?.content ?? "",
      toolCalls: message?.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function.name,
        input: safeJson(call.function.arguments),
      })),
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
      raw: json,
    };
  }
}

function toLocalMessage(message: BrainGenerateInput["messages"][number]): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
      })),
    };
  }

  if (message.role === "tool") {
    if (!message.toolCallId) throw new ValidationError("[LocalModelProvider] tool messages require toolCallId");
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      name: message.name,
      content: message.content,
    };
  }

  return {
    role: message.role,
    content: message.content,
    ...(message.name ? { name: message.name } : {}),
  };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
