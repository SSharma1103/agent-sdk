# Agent SDK

Production-grade, stack-agnostic AI orchestration SDK extracted from `/root/projects/automations`.

This is an extraction and generalization of the existing system, not a rewrite. The preserved foundation is:

- `BrainNode` -> `Brain`, with provider routing, tool calling, and usage tracking.
- `EmailPipeline`, `ScrapePipeline`, `OnboardingApiPipeline` -> injectable `Pipeline` implementations.
- Prisma persistence -> `Storage` adapters, with `PrismaStore` preserving the current data model boundary.
- Webhook/rule/LLM fallback patterns -> universal triggers, tools, and orchestrator strategies.

## Architecture

```txt
sdk/
  core/            Brain, provider contracts, usage
  pipelines/       Pipeline contract, declarative pipelines, extracted email pipeline
  orchestrator/    Pipeline registry and execution strategies
  tools/           MCP-style tool connectors
  transport/       HTTP, WebSocket, STDIO, queue transports
  storage/         Storage interface, MemoryStore, PrismaStore adapter
  memory/          Session and persistent memory interfaces
  triggers/        Webhook, cron, internal event triggers
  auth/            API key and OAuth interfaces
  index.ts
```

## Example

```ts
import {
  AgentSDK,
  Brain,
  EmailPipeline,
  HttpTransport,
  MemoryStore,
  OpenAIProvider,
  ToolRegistry,
} from "@agent-sdk/orchestration";

const storage = new MemoryStore();
const tools = new ToolRegistry();
const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  storage,
  tools,
});

const sdk = new AgentSDK({
  provider: brain,
  transport: new HttpTransport(),
  storage,
});

sdk.registerPipeline(
  new EmailPipeline({
    brain,
    storage,
    tools,
    shareBaseUrl: "https://example.com",
  }),
);

await sdk.runPipeline("email", {
  operation: "processIncomingEmail",
  token: "webhook-token",
  email: {
    threadId: "t_1",
    from: "customer@example.com",
    subject: "Pricing",
    body: "Can you send pricing?",
  },
});
```

## Dependency Injection

Every module receives dependencies through constructors:

- Pipelines receive `brain`, `storage`, `tools`, `memory`, or domain clients as interfaces.
- `Brain` receives registered `LLMProvider` implementations and a usage sink through `Storage`.
- Transports and triggers receive handlers instead of importing framework-specific routes.
- Prisma is isolated in `PrismaStore`; application code may replace it with `MemoryStore`, Mongo, Postgres, or a custom adapter.

This keeps the current behavior intact while making provider, persistence, transport, auth, and tools replaceable.

## Plugin System Guidelines

Future marketplace plugins should export a manifest and a factory:

```ts
export const manifest = {
  name: "agentmail",
  version: "1.0.0",
  capabilities: ["tool", "trigger"],
  runtimes: ["node", "edge"],
};

export function createPlugin(ctx) {
  ctx.tools.register(connector);
  ctx.triggers.register(trigger);
}
```

Plugin rules:

- Plugins depend only on SDK interfaces, never concrete stores or framework routes.
- Plugins declare capabilities, permissions, runtime support, and required secrets.
- Tool connectors should use `ToolConnector` and expose schemas when available.
- Storage migrations belong to adapters, not plugin business logic.
- Marketplace validation should typecheck, run capability tests, and verify secret scopes.
