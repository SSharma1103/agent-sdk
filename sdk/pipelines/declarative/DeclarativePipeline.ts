import type { Brain } from "../../core/Brain.js";
import type { ToolRegistry } from "../../tools/contracts.js";
import type { DeclarativePipelineConfig, Pipeline, PipelineContext } from "../contracts.js";
import type { Orchestrator } from "../../orchestrator/Orchestrator.js";

export class DeclarativePipeline implements Pipeline {
  readonly name: string;

  constructor(
    private readonly config: DeclarativePipelineConfig,
    private readonly deps: { brain: Brain; tools: ToolRegistry; orchestrator?: Orchestrator },
  ) {
    this.name = config.name;
  }

  async run(input: unknown, _context?: PipelineContext): Promise<unknown> {
    let current = input;
    for (const step of this.config.steps) {
      if (step.type === "tool") {
        current = await this.deps.tools.call(step.name, step.input ?? current);
      }
      if (step.type === "llm") {
        current = await this.deps.brain.run({
          provider: step.provider,
          model: step.model,
          messages: [
            ...(step.system ? [{ role: "system" as const, content: step.system }] : []),
            { role: "user", content: step.prompt ?? JSON.stringify(current) },
          ],
        });
      }
      if (step.type === "pipeline") {
        if (!this.deps.orchestrator) throw new Error("[DeclarativePipeline] orchestrator dependency is required");
        current = await this.deps.orchestrator.run(step.name, step.input ?? current);
      }
    }
    return current;
  }
}
