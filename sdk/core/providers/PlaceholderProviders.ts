import type { BrainGenerateInput, BrainGenerateOutput, LLMProvider } from "../contracts.js";
import { NotImplementedError } from "../../errors.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  async generate(_input: BrainGenerateInput): Promise<BrainGenerateOutput> {
    throw new NotImplementedError("[AnthropicProvider] adapter is intentionally pluggable and not implemented yet");
  }
}

export class LocalModelProvider implements LLMProvider {
  readonly name = "local";

  async generate(_input: BrainGenerateInput): Promise<BrainGenerateOutput> {
    throw new NotImplementedError("[LocalModelProvider] provide an Ollama/LM Studio adapter through LLMProvider");
  }
}
