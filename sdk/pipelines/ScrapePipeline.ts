import type { Pipeline } from "./contracts.js";
import type { Storage } from "../storage/contracts.js";

export type ScrapePipelineInput = {
  url: string;
  strategy?: string;
  maxDepth?: number;
  maxPages?: number;
  detailLevel?: string;
  includeExternal?: boolean;
};

export class ScrapePipeline implements Pipeline<ScrapePipelineInput, unknown> {
  readonly name = "scrape";

  constructor(private readonly deps: { storage: Storage; scrape: (input: ScrapePipelineInput) => Promise<unknown> }) {}

  validate(input: ScrapePipelineInput): void {
    if (!input.url) throw new Error("[ScrapePipeline] url is required");
  }

  async run(input: ScrapePipelineInput): Promise<unknown> {
    return this.deps.scrape(input);
  }
}
