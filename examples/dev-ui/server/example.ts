import {
  Agent,
  AgentSDK,
  AgentTeam,
  Brain,
  InMemorySessionStore,
  LocalToolConnector,
  ToolRegistry,
  type BrainGenerateInput,
  type BrainGenerateOutput,
  type LLMProvider,
} from "../../../sdk/index.js";
import { createDevUiServer } from "./devServer.js";

class DemoProvider implements LLMProvider {
  readonly name = "demo";

  async generate(input: BrainGenerateInput): Promise<BrainGenerateOutput> {
    const last = input.messages.at(-1)?.content ?? "";
    return {
      text: `Demo response from ${input.model}: ${last}`,
      usage: { promptTokens: 8, completionTokens: 12, totalTokens: 20 },
    };
  }
}

const memory = new InMemorySessionStore();
const tools = new ToolRegistry();
tools.register(new LocalToolConnector("lookup_note", async (input) => ({ note: `Looked up ${JSON.stringify(input)}` })));

const brain = new Brain({ providers: [new DemoProvider()], tools });
const sdk = new AgentSDK({ brain });

const researcher = new Agent({
  name: "researcher",
  description: "Finds context and summarizes it.",
  instructions: "You are a concise research agent. Surface key facts and uncertainty.",
  model: "demo-research",
  tools: ["lookup_note"],
}, { brain, memory });

const writer = new Agent({
  name: "writer",
  description: "Turns findings into a polished answer.",
  instructions: "You are a practical writing agent. Produce clear, actionable text.",
  model: "demo-writer",
}, { brain, memory });

const team = new AgentTeam({
  name: "research-team",
  mode: "sequential",
  agents: [researcher, writer],
  brain,
  tools,
});

sdk.registerAgent(researcher);
sdk.registerAgent(writer);
sdk.registerTeam(team);

const server = createDevUiServer({
  sdk,
  agents: [researcher, writer],
  teams: [team],
  memory,
  port: Number(process.env.PORT ?? 8787),
});

const { url } = await server.start();
console.info(`[dev-ui] ${url}`);
