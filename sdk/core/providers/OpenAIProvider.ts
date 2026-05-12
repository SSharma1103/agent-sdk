import type {
  BrainGenerateInput,
  BrainGenerateOutput,
  BrainObjectInput,
  BrainObjectOutput,
  LLMProvider,
} from "../contracts.js";
import type { ToolRegistry } from "../../tools/contracts.js";
import { ProviderRequestError, ValidationError } from "../../errors.js";

type OpenAIProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  fetch?: typeof fetch;
};

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: OpenAIProviderConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.fetchImpl = config.fetch ?? fetch;
  }

  async generate(input: BrainGenerateInput, tools?: ToolRegistry): Promise<BrainGenerateOutput> {
    const apiKey = input.apiKey ?? this.config.apiKey;
    if (!apiKey) throw new Error("[OpenAIProvider] apiKey is required");

    const resolvedTools = tools?.resolveMany(input.tools);
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model || this.config.defaultModel,
        messages: input.messages.map(toOpenAIMessage),
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
      throw new ProviderRequestError("OpenAIProvider", response.status, await response.text());
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

  async generateObject<T>(input: BrainObjectInput): Promise<BrainObjectOutput<T>> {
    const generated = await this.generate({
      ...input,
      messages: [
        ...(input.system ? [{ role: "system" as const, content: input.system }] : []),
        {
          role: "user",
          content: `${input.prompt}\n\nReturn only JSON matching this schema:\n${JSON.stringify(input.schema)}`,
        },
      ],
    });

    return {
      object: safeJson(generated.text) as T,
      usage: generated.usage,
      raw: generated.raw,
    };
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toOpenAIMessage(message: BrainGenerateInput["messages"][number]): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.input ?? {}),
        },
      })),
    };
  }

  if (message.role === "tool") {
    if (!message.toolCallId) {
      throw new ValidationError("[OpenAIProvider] tool messages require toolCallId");
    }
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
