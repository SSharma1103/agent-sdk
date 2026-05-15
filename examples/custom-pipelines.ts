import {
  AgentSDK,
  Brain,
  DeclarativePipeline,
  LocalToolConnector,
  MemoryStore,
  OpenAIProvider,
  PipelineBase,
  ToolRegistry,
} from "../sdk/index.js";

declare const process: { env: { OPENAI_API_KEY?: string } };

class GreetingPipeline extends PipelineBase<{ name: string }, { greeting: string }> {
  readonly name = "greeting";

  async run(input: { name: string }) {
    return { greeting: `Hello, ${input.name}` };
  }
}

const storage = new MemoryStore();
const tools = new ToolRegistry();
tools.register(new LocalToolConnector("uppercase", (input: { text: string }) => input.text.toUpperCase()));

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  storage,
  tools,
});

const sdk = new AgentSDK({
  storage,
  hooks: {
    beforeRun: ({ pipelineName }) => console.info("starting", pipelineName),
    afterRun: ({ pipelineName }) => console.info("completed", pipelineName),
  },
});

sdk.registerPipeline(new GreetingPipeline());
sdk.registerPipeline(
  new DeclarativePipeline(
    {
      name: "custom-greeting",
      steps: [
        {
          id: "base",
          type: "pipeline",
          name: "greeting",
          mapInput: (state) => state.input,
        },
        {
          id: "shout",
          type: "tool",
          name: "uppercase",
          mapInput: (state) => ({ text: (state.current as { greeting: string }).greeting }),
          retry: 1,
        },
      ],
    },
    { brain, tools, registry: sdk.orchestrator.registry, runtime: sdk.orchestrator.runtime },
  ),
);

await sdk.runPipeline("custom-greeting", { name: "Ada" });
