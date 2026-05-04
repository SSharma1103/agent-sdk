import {
  AgentSDK,
  Brain,
  EmailPipeline,
  LocalToolConnector,
  MemoryStore,
  OpenAIProvider,
  ToolRegistry,
} from "../sdk/index.js";

declare const process: { env: { OPENAI_API_KEY?: string } };

const storage = new MemoryStore();
const tools = new ToolRegistry();

tools.register(
  new LocalToolConnector(
    "reply_to_thread",
    async (input) => ({ ok: true, input }),
    "Reply to an existing email thread.",
    {
      type: "object",
      properties: {
        threadId: { type: "string" },
        text: { type: "string" },
      },
      required: ["threadId", "text"],
    },
  ),
);

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  defaultProvider: "openai",
  storage,
  tools,
});

const sdk = new AgentSDK({ provider: brain, storage });

const email = new EmailPipeline({
  brain,
  storage,
  tools,
  shareBaseUrl: "https://example.com",
});

sdk.registerPipeline(email);

await sdk.runPipeline("email", { operation: "ensure", userId: "user_123" });
