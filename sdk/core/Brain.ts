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

export type BrainConfig = {
  providers: LLMProvider[];
  defaultProvider?: string;
  storage?: Storage;
  tools?: ToolRegistry;
  keyResolver?: ApiKeyResolver;
  logger?: Logger;
};

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

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
      throw new NotImplementedError(`[Brain] provider "${providerName}" is not registered`);
    }

    const result = await provider.generate({ ...input, provider: providerName }, this.config.tools);
    this.persistUsage(input, providerName, result).catch((error: unknown) => {
      this.logger.error?.("[Brain] failed to persist usage", { error });
    });
    return result;
  }

  async runObject<T>(input: BrainObjectInput): Promise<BrainObjectOutput<T>> {
    const providerName = await this.resolveProvider(input);
    const provider = this.providers.get(providerName);
    if (!provider?.generateObject) {
      throw new NotImplementedError(`[Brain] provider "${providerName}" does not support object generation`);
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
