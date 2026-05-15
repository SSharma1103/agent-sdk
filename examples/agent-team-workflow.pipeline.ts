import {
  Agent,
  AgentSDK,
  AgentTeam,
  Brain,
  DeclarativePipeline,
  InMemorySessionStore,
  OpenAIProvider,
  ToolRegistry,
} from "../sdk/index.js";

declare const process: { env: { OPENAI_API_KEY?: string } };

const tools = new ToolRegistry();
const memory = new InMemorySessionStore();
const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  defaultProvider: "openai",
  tools,
});

const scraperAgent = new Agent(
  {
    name: "scraper_agent",
    description: "Collects raw launch facts and source links.",
    instructions: "Collect raw facts and source links. Keep the output compact.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

const judgeAgent = new Agent(
  {
    name: "judge_agent",
    description: "Checks evidence quality and flags weak claims.",
    instructions: "Review the prior findings for accuracy, novelty, and missing evidence.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

const docsAgent = new Agent(
  {
    name: "docs_agent",
    description: "Turns approved findings into user-facing notes.",
    instructions: "Write concise documentation notes from the verified findings.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

const researchTeam = new AgentTeam({
  name: "research_team",
  mode: "sequential",
  agents: [scraperAgent, judgeAgent, docsAgent],
  brain,
  tools,
  memory,
});

tools.register(researchTeam.asTool());

const researchTeamPipeline = new DeclarativePipeline(
  {
    name: "research-team-workflow",
    steps: [
      {
        id: "run_team",
        type: "tool",
        name: "research_team",
        mapInput: (state) => ({
          input: (state.input as { topic: string }).topic,
          sessionId: "research-team-demo",
        }),
      },
    ],
  },
  { brain, tools },
);

const sdk = new AgentSDK({ brain });
sdk.registerPipeline(researchTeamPipeline);

await sdk.runPipeline("research-team-workflow", {
  topic: "Find and verify the most important new LLM model launches this month.",
});
