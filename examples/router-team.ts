import { Agent, AgentSDK, AgentTeam, Brain, InMemorySessionStore, OpenAIProvider, ToolRegistry } from "../sdk/index.js";

declare const process: { env: { OPENAI_API_KEY?: string } };

const tools = new ToolRegistry();
const memory = new InMemorySessionStore();
const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  tools,
});

const scraper = new Agent(
  {
    name: "scraper",
    description: "Collects raw facts and links.",
    instructions: "You collect useful raw information. Be concise.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

const judge = new Agent(
  {
    name: "judge",
    description: "Checks accuracy and missing details.",
    instructions: "You critique, verify, and identify gaps.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

const writer = new Agent(
  {
    name: "writer",
    description: "Writes final polished responses.",
    instructions: "You write clear final answers.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

const manager = new Agent(
  {
    name: "manager",
    description: "Routes work between team agents.",
    instructions: "You are the manager. Decide which specialist to call next or finish.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

const team = new AgentTeam({
  name: "research-router-team",
  mode: "router",
  manager,
  agents: [scraper, judge, writer],
  brain,
  tools,
  memory,
  maxSteps: 8,
  maxCallsPerAgent: 3,
});

const sdk = new AgentSDK({ brain });
sdk.registerTeam(team);

const result = await sdk.runTeam("research-router-team", {
  input: "Research my Agent SDK launch plan and produce a judged final answer.",
  sessionId: "demo-session",
});

console.log(result.text);
console.log(result.results);
