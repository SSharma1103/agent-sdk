import { Agent, Brain, InMemorySessionStore, ToolRegistry } from "../sdk/index.js";
import type { BrainGenerateInput, BrainGenerateOutput, LLMProvider } from "../sdk/index.js";

class ExampleProvider implements LLMProvider {
  readonly name = "example";

  async generate(input: BrainGenerateInput): Promise<BrainGenerateOutput> {
    return {
      text: `echo: ${input.messages.at(-1)?.content ?? ""}`,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    };
  }
}

const tools = new ToolRegistry();
const memory = new InMemorySessionStore();
const brain = new Brain({ providers: [new ExampleProvider()], tools });

const agent = new Agent(
  {
    name: "scraper-agent",
    instructions: "Extract the most important facts from the provided page text.",
    model: "gpt-4o-mini",
    provider: "example",
    hooks: {
      beforeRun: (ctx) => console.log("agent started", ctx.agentName),
      onToolCall: (ctx) => console.log("tool call", ctx.toolCall),
      afterRun: (ctx) => console.log("agent completed", ctx.output?.text),
      onError: (ctx) => console.error("agent failed", ctx.error),
    },
  },
  { brain, tools, memory },
);

await agent.run({ input: "Summarize the latest page snapshot.", sessionId: "agent-hooks-example" });
