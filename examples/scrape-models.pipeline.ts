import {
  Agent,
  AgentSDK,
  Brain,
  DeclarativePipeline,
  InMemorySessionStore,
  LocalToolConnector,
  MemoryStore,
  OpenAIProvider,
  ToolRegistry,
  type AgentRunOutput,
  type BrainGenerateOutput,
} from "../sdk/index.js";

declare const process: { env: { OPENAI_API_KEY?: string } };

type SearchHit = { title: string; url: string; snippet: string };
type CrawledPage = SearchHit & { content: string };

const storage = new MemoryStore();
const memory = new InMemorySessionStore();
const tools = new ToolRegistry();

tools.register(
  new LocalToolConnector<{ query: string }, SearchHit[]>("search_sources", async (input) => [
    {
      title: "Provider model updates",
      url: `https://example.com/search?q=${encodeURIComponent(input.query)}`,
      snippet: "Recent model launches and changelogs.",
    },
  ]),
);

tools.register(
  new LocalToolConnector<SearchHit[], CrawledPage[]>("crawl_results", async (hits) =>
    hits.map((hit) => ({ ...hit, content: `${hit.snippet}\nModel launch notes from ${hit.url}` })),
  ),
);

tools.register(
  new LocalToolConnector<BrainGenerateOutput, { embedded: number }>("embed_docs", async (models) => {
    console.info("embedding extracted model docs", models.text);
    return { embedded: 1 };
  }),
);

tools.register(
  new LocalToolConnector<{ query: string; extracted: BrainGenerateOutput; judgment: AgentRunOutput }, { saved: true }>(
    "save_run",
    async (input) => {
      console.info("saving scrape run", input.query, input.judgment.text);
      return { saved: true };
    },
  ),
);

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  defaultProvider: "openai",
  storage,
  tools,
});

const modelJudge = new Agent(
  {
    name: "judge_models",
    description: "Judge extracted LLM model announcements for novelty and relevance.",
    instructions: "Score extracted model announcements. Keep only concrete new or updated LLM models.",
    model: "gpt-4o-mini",
  },
  { brain, memory },
);

tools.register(modelJudge.asTool());

const scrapeModelsPipeline = new DeclarativePipeline(
  {
    name: "scrape-new-llm-models",
    steps: [
      {
        id: "search_sources",
        type: "tool",
        name: "search_sources",
        mapInput: (state) => ({ query: (state.input as { query: string }).query }),
      },
      { id: "crawl_results", type: "tool", name: "crawl_results" },
      {
        id: "extract_models",
        type: "llm",
        model: "gpt-4o-mini",
        system: "Extract new or updated LLM model names, providers, dates, and source URLs as JSON.",
        prompt: (state) => JSON.stringify(state.steps.crawl_results),
      },
      {
        id: "judge_models",
        type: "tool",
        name: "judge_models",
        mapInput: (state) => ({
          input: `Judge these extracted models:\n${(state.steps.extract_models as BrainGenerateOutput).text}`,
          sessionId: "scrape-models-demo",
        }),
      },
      {
        id: "embed_docs",
        type: "tool",
        name: "embed_docs",
        mapInput: (state) => state.steps.extract_models,
      },
      {
        id: "save_run",
        type: "tool",
        name: "save_run",
        mapInput: (state) => ({
          query: (state.input as { query: string }).query,
          extracted: state.steps.extract_models as BrainGenerateOutput,
          judgment: state.steps.judge_models as AgentRunOutput,
        }),
      },
    ],
  },
  { brain, tools },
);

const sdk = new AgentSDK({ brain, storage });
sdk.registerPipeline(scrapeModelsPipeline);

await sdk.runPipeline("scrape-new-llm-models", { query: "new LLM model releases this week" });
