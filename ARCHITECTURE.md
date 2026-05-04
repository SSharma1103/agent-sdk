# Architecture Extraction Notes

## Source Foundation

The SDK preserves the `/root/projects/automations` system boundaries:

- `agents/_shared/BrainNode.ts` becomes `sdk/core/Brain.ts`.
- Provider-specific execution moves behind `LLMProvider`.
- Usage persistence moves from direct Prisma calls to `Storage.saveUsage`.
- `lib/templates/EmailPipeline.ts` becomes `sdk/pipelines/email/EmailPipeline.ts`.
- Rule-first email handling remains identical: evaluate rules in order, then call the Brain only when no rule matches.
- `ScrapePipeline` and `OnboardingApiPipeline` are represented as injectable pipelines so their existing logic can be migrated without direct Prisma or `BrainNode` imports.

## TypeScript Interfaces

Core interfaces:

- `LLMProvider.generate(input): Promise<output>`
- `Pipeline.run(input, context): Promise<output>`
- `ToolConnector.call(input): Promise<output>`
- `Transport.send(request): Promise<response>`
- `Storage.saveRun(data)` and `Storage.getRuns()`
- `SessionMemory` for session and persistent memory
- `Trigger` for webhook, cron, and internal events
- `AuthProvider` for API key and OAuth authentication

## Adapter Pattern

Adapters isolate hard dependencies:

- `OpenAIProvider` implements `LLMProvider`.
- `AnthropicProvider` and `LocalModelProvider` are placeholders for future providers.
- `PrismaStore` preserves the existing Prisma boundary.
- `MemoryStore` supports tests, local usage, and non-persistent runtimes.
- `LocalToolConnector` wraps in-process functions.
- `TransportToolConnector` routes tools over HTTP, STDIO, gRPC, or queues.
- `HttpTransport`, `WebSocketTransport`, `StdioTransport`, and `QueueTransport` abstract communication.

## Dependency Injection

No pipeline imports concrete providers, Prisma, or framework routes. Constructors receive only SDK interfaces:

```ts
new EmailPipeline({ brain, storage, tools, shareBaseUrl });
new Brain({ providers, storage, tools, keyResolver });
new AgentSDK({ storage, transport });
```

This keeps developer experience simple while making every production concern replaceable.

## Execution Modes

The orchestrator accepts `sync`, `async`, and `streaming` modes through `PipelineContext`. Queue-backed async execution is implemented by plugging in `QueueTransport` and an external worker that calls `runPipeline`.

## Strategies

`Orchestrator.runStrategy` supports:

- `sequential`
- `parallel`
- `agentic`
- `planner-executor`

The last two are intentionally strategy hooks. Production implementations should register planner and executor pipelines rather than baking one planning algorithm into the SDK core.

## Declarative Pipelines

`DeclarativePipeline` supports config-driven pipelines:

```ts
{
  name: "scrape-and-summarize",
  steps: [
    { type: "tool", name: "scrape" },
    { type: "llm", model: "gpt-4o-mini" }
  ]
}
```

## Plugin Marketplace Guidelines

Plugins should export a manifest and factory. They should register providers, tools, transports, triggers, auth providers, pipelines, or storage adapters through SDK interfaces.

Marketplace validation should require:

- Manifest with name, version, capabilities, runtime compatibility, and secret requirements.
- No direct dependency on app-specific Prisma models or Next.js routes.
- Capability tests for every connector.
- Explicit permissions for network, filesystem, secrets, and background execution.
- Semver and compatibility metadata for SDK core versions.
