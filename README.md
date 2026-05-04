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
} from "@myui/agent-sdk";

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

## Customizable Pipelines

Pipelines can be customized at two layers:

- Code-first pipelines can expose lifecycle hooks through `PipelineHooks`.
- Config-driven pipelines can use `DeclarativePipeline` with mapped inputs, mapped outputs, conditional steps, retries, fallbacks, and nested pipelines.
- Pipeline input can be validated with any schema object that exposes `parse` or `safeParse`, including Zod schemas.

```ts
import {
  AgentSDK,
  DeclarativePipeline,
  LocalToolConnector,
  ToolRegistry,
} from "@myui/agent-sdk";

const tools = new ToolRegistry();
tools.register(new LocalToolConnector("normalize", async (input) => input));

const sdk = new AgentSDK({
  hooks: {
    beforeRun: ({ pipelineName }) => console.info("starting", pipelineName),
    onError: ({ error }) => ({ handled: false, error }),
  },
});

sdk.registerPipeline(
  new DeclarativePipeline(
    {
      name: "support-intake",
      steps: [
        {
          id: "normalized",
          type: "tool",
          name: "normalize",
          mapInput: (state) => state.input,
          retry: 1,
        },
        {
          id: "draft",
          type: "llm",
          model: "gpt-4o-mini",
          when: (state) => Boolean(state.steps.normalized),
          prompt: (state) => `Draft a concise response for ${JSON.stringify(state.current)}`,
        },
      ],
    },
    { brain, tools },
  ),
);
```

Built-in pipelines also expose domain hooks. For example, `EmailPipeline` can customize rule matching, prompt construction, and tool selection without forking the pipeline:

```ts
new EmailPipeline({
  brain,
  storage,
  tools,
  hooks: {
    matchRule: (rule, email) => email.subject.includes(rule.match.value),
    buildMessages: (email, pipeline) => [
      { role: "system", content: pipeline.context },
      { role: "user", content: `Reply to: ${email.body}` },
    ],
    selectTools: () => ["reply_to_thread"],
  },
});
```

```ts
sdk.registerPipeline({
  name: "validated",
  inputSchema: z.object({ name: z.string() }),
  async run(input) {
    return `Hello ${input.name}`;
  },
});
```

`Brain.run()` executes model tool calls when a `ToolRegistry` is configured. The provider returns tool calls, the SDK calls matching tools, appends tool results, and continues until the model returns final text.

```ts
tools.register(new LocalToolConnector("lookup_customer", async ({ id }) => ({ id, plan: "pro" })));

const result = await brain.run({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Look up customer cus_123 and summarize their plan." }],
  tools: ["lookup_customer"],
});
```

## Dependency Injection

Every module receives dependencies through constructors:

- Pipelines receive `brain`, `storage`, `tools`, `memory`, or domain clients as interfaces.
- `Brain` receives registered `LLMProvider` implementations and a usage sink through `Storage`.
- Transports and triggers receive handlers instead of importing framework-specific routes.
- Prisma is isolated in `PrismaStore`; application code may replace it with `MemoryStore`, Mongo, Postgres, or a custom adapter.

This keeps the current behavior intact while making provider, persistence, transport, auth, and tools replaceable.

## Runtime Adapters

The SDK includes small default adapters while keeping runtime ownership in the host app:

- `LocalModelProvider` targets OpenAI-compatible local servers such as Ollama or LM Studio at `http://localhost:11434/v1` by default.
- `WebSocketTransport` accepts an existing socket or a URL plus a WebSocket constructor.
- `StdioTransport` wraps an injected client with a `send(request)` method.
- `OAuthProvider` delegates token verification to an injected verifier function or verifier object.
- `WebhookTrigger` stores a handler and exposes `handle({ body, headers })` for framework routes.
- `CronTrigger` supports injected schedulers, interval-based local scheduling, or manual `fire()` calls.

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
