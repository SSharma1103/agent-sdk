import type {
  ApiKeyResolver,
  BrainGenerateInput,
  BrainGenerateOutput,
  BrainObjectInput,
  BrainObjectOutput,
  LLMProvider,
} from "./contracts.js";
import type { Storage } from "../storage/contracts.js";
import type { ToolRegistry } from "../tools/contracts.js";
import type { Logger } from "../types.js";
import { consoleLogger } from "../types.js";
import {
  NotImplementedError,
  ProviderCapabilityError,
  ProviderNotFoundError,
  ToolExecutionError,
} from "../errors.js";

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

export class Brain {
  private readonly providers = new Map<string, LLMProvider>();
  private readonly logger: Logger;

  constructor(private readonly config: BrainConfig) {
    this.logger = config.logger ?? consoleLogger;
    for (const provider of config.providers) {
      this.providers.set(provider.name, provider);
    }
  }

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  async run(input: BrainGenerateInput): Promise<BrainGenerateOutput> {
    const providerName = await this.resolveProvider(input);
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new ProviderNotFoundError(providerName);
    }

    const result = await this.generateWithTools(provider, providerName, input);
    this.persistUsage(input, providerName, result).catch((error: unknown) => {
      this.logger.error?.("[Brain] failed to persist usage", { error });
    });
    return result;
  }

  async runObject<T>(input: BrainObjectInput): Promise<BrainObjectOutput<T>> {
    const providerName = await this.resolveProvider(input);
    const provider = this.providers.get(providerName);
    if (!provider?.generateObject) {
      throw new ProviderCapabilityError(providerName, "object generation");
    }

    const result = await provider.generateObject<T>({ ...input, provider: providerName }, this.config.tools);
    this.config.storage?.saveUsage?.({
      userId: input.userId,
      keyId: input.keyId,
      provider: providerName,
      model: input.model,
      usage: result.usage,
      metadata: input.metadata,
    }).catch((error: unknown) => {
      this.logger.error?.("[Brain] failed to persist object usage", { error });
    });
    return result;
  }

  private async resolveProvider(input: { provider?: string; userId?: string; keyId?: string }) {
    if (input.provider) return input.provider;
    if (this.config.keyResolver) {
      const resolved = await this.config.keyResolver.resolve(input);
      return resolved.provider;
    }
    if (this.config.defaultProvider) return this.config.defaultProvider;
    const first = this.config.providers[0]?.name;
    if (!first) throw new Error("[Brain] at least one provider is required");
    return first;
  }

  private async generateWithTools(
    provider: LLMProvider,
    providerName: string,
    input: BrainGenerateInput,
  ): Promise<BrainGenerateOutput> {
    const tools = this.config.tools;
    const executeTools = input.executeTools ?? this.config.executeTools ?? true;
    const maxToolIterations = input.maxToolIterations ?? this.config.maxToolIterations ?? 4;
    const messages = [...input.messages];
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const rawSteps: unknown[] = [];

    for (let iteration = 0; iteration <= maxToolIterations; iteration += 1) {
      const result = await provider.generate({ ...input, provider: providerName, messages }, tools);
      usage = addUsage(usage, result.usage);
      rawSteps.push(result.raw ?? result);

      if (!result.toolCalls?.length || !executeTools || !tools) {
        return {
          ...result,
          usage,
          raw: rawSteps.length > 1 ? { steps: rawSteps } : result.raw,
        };
      }

      if (iteration === maxToolIterations) {
        return {
          ...result,
          usage,
          raw: { steps: rawSteps, stoppedReason: "maxToolIterations" },
        };
      }

      messages.push({
        role: "assistant",
        content: result.text,
        toolCalls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        try {
          await input.onToolCall?.(call);
          const output = await tools.call(call.name, call.input);
          messages.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: stringifyToolOutput(output),
          });
        } catch (error) {
          throw new ToolExecutionError(call.name, error);
        }
      }
    }

    throw new NotImplementedError("[Brain] unreachable tool execution state");
  }

  private async persistUsage(
    input: BrainGenerateInput,
    provider: string,
    output: BrainGenerateOutput,
  ): Promise<void> {
    await this.config.storage?.saveUsage?.({
      userId: input.userId,
      keyId: input.keyId,
      provider,
      model: input.model,
      usage: output.usage,
      metadata: input.metadata,
    });
  }
}

function addUsage(left: BrainGenerateOutput["usage"], right: BrainGenerateOutput["usage"]): BrainGenerateOutput["usage"] {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  return JSON.stringify(output);
}
