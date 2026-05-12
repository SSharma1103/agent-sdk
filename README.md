# Agent SDK

Framework-agnostic TypeScript SDK for building agents, agent teams, tools, pipelines, and local development UIs.

[![CI](https://github.com/SSharma1103/agent-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/SSharma1103/agent-sdk/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Agent SDK gives you small, composable primitives instead of a full application framework:

- `Brain` routes model calls to provider adapters and executes tools.
- `Agent` wraps instructions, model choice, tools, metadata, and session memory.
- `AgentTeam` coordinates agents through manager, sequential, and parallel modes.
- `Pipeline` and `Orchestrator` provide reusable workflow execution.
- Storage, memory, auth, triggers, and transports are injected through interfaces.
- `examples/dev-ui` provides an ADK-style local debugging UI for agents and teams.

## Install

```sh
npm install @shivamsharma11/agent-sdk
```

Agent SDK is ESM-only and supports Node.js 20 or newer.

## 60-Second Quickstart

```ts
import {
  Agent,
  AgentSDK,
  Brain,
  InMemorySessionStore,
  LocalToolConnector,
  MemoryStore,
  OpenAIProvider,
  ToolRegistry,
} from "@shivamsharma11/agent-sdk";

const storage = new MemoryStore();
const memory = new InMemorySessionStore();
const tools = new ToolRegistry();

tools.register(
  new LocalToolConnector("lookup_customer", async ({ id }) => ({
    id,
    plan: "pro",
  })),
);

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  storage,
  tools,
});

const sdk = new AgentSDK({ brain, storage });

const supportAgent = new Agent(
  {
    name: "support",
    description: "Answers support questions with account context.",
    instructions: "Be concise and helpful. Use tools when account context is needed.",
    model: "gpt-4o-mini",
    tools: ["lookup_customer"],
  },
  { brain, memory },
);

sdk.registerAgent(supportAgent);

const result = await sdk.runAgent("support", {
  sessionId: "session_1",
  input: "Look up customer cus_123 and summarize their plan.",
});

console.log(result.text);
```

## Agent Layer

The agent layer is the main developer-facing abstraction. It sits above `Brain`, which handles model/provider execution, and plugs back into `Pipeline`/`Orchestrator`, which handle runs, storage, hooks, and events.

```txt
AgentSDK
  ├─ registerAgent(agent) -> AgentPipeline -> Orchestrator
  ├─ registerTeam(team)   -> Pipeline-compatible team runner
  └─ runAgent/runTeam     -> stored runs, hooks, events, metadata

Agent
  ├─ instructions + model/provider config
  ├─ optional tool allowlist
  ├─ optional session memory
  └─ Brain.run(...)

AgentTeam
  ├─ manager / sequential / parallel coordination
  ├─ member agents
  ├─ shared Brain, tools, and memory
  └─ team-level events and combined usage
```

Use `Agent` when you want one reusable LLM worker with a stable role.

```ts
const researcher = new Agent(
  {
    name: "researcher",
    description: "Finds context and summarizes uncertainty.",
    instructions: "Research the request, cite uncertainty, and keep the answer concise.",
    model: "gpt-4o-mini",
    tools: ["lookup_docs"],
    metadata: { owner: "platform" },
  },
  { brain, memory },
);

sdk.registerAgent(researcher);

const output = await sdk.runAgent("researcher", {
  sessionId: "session_1",
  input: "What are the risks in the current provider adapter design?",
});
```

Agents emit lifecycle events that can be consumed by the dev UI or your own tracing layer:

- `agent.started`
- `agent.tool_call`
- `agent.completed`
- `agent.failed`

Any agent can also be exposed as a local tool. This is the recommended first pattern for manager-style teams.

```ts
tools.register(researcher.asTool());

const manager = new Agent(
  {
    name: "manager",
    instructions: "Delegate specialist work to available tools before answering.",
    model: "gpt-4o-mini",
    tools: ["researcher"],
  },
  { brain },
);
```

When you call `sdk.registerAgent(agent)`, the SDK wraps the agent in `AgentPipeline`. That means agents automatically reuse the existing pipeline infrastructure:

- run IDs
- `Storage.saveRun`
- global and per-call hooks
- emitted events
- error policy and fallback behavior

## Agent Teams

Agent teams coordinate multiple agents while reusing the same `Brain`, tools, and memory.

```ts
import { Agent, AgentSDK, AgentTeam, Brain, ToolRegistry } from "@shivamsharma11/agent-sdk";

const tools = new ToolRegistry();
const brain = new Brain({ providers: [provider], tools });
const sdk = new AgentSDK({ brain });

const researcher = new Agent(
  {
    name: "researcher",
    instructions: "Find the important facts and uncertainty.",
    model: "gpt-4o-mini",
  },
  { brain },
);

const writer = new Agent(
  {
    name: "writer",
    instructions: "Turn findings into a clear answer.",
    model: "gpt-4o-mini",
  },
  { brain },
);

const team = new AgentTeam({
  name: "research-team",
  mode: "sequential",
  agents: [researcher, writer],
  brain,
  tools,
});

sdk.registerTeam(team);

const output = await sdk.runTeam("research-team", "Explain the current product direction.");
console.log(output.text);
```

Supported team modes today:

- `manager`
- `sequential`
- `parallel`

Team outputs include final `text`, summed token `usage`, and `results[]` for each member agent so callers can inspect what every agent contributed.

Planned modes are tracked in GitHub issues:

- [`handoff`](https://github.com/SSharma1103/agent-sdk/issues/2)
- [`planner-executor`](https://github.com/SSharma1103/agent-sdk/issues/3)

## Local Dev UI

The repository includes an ADK-style local web UI for debugging agents and teams.

```sh
npm run dev:web
```

Open:

```txt
http://127.0.0.1:8787
```

The dev UI supports:

- agent/team selection
- local sessions
- chat-style runs
- event timeline
- session state editing
- run details and token usage

See [docs/dev-ui.md](docs/dev-ui.md).

## Providers, Tools, And Adapters

Provider adapters implement `LLMProvider`.

Built-in provider support:

- `OpenAIProvider` for OpenAI-compatible chat completions.
- `LocalModelProvider` for local OpenAI-compatible servers such as Ollama or LM Studio.
- `AnthropicProvider` is tracked in [issue #1](https://github.com/SSharma1103/agent-sdk/issues/1).

Tool connectors implement `ToolConnector` and can be local functions or transport-backed adapters.

```ts
tools.register(new LocalToolConnector("normalize", async (input) => input));
```

Storage and runtime concerns are injected:

- `MemoryStore` for in-memory run and usage records.
- `PrismaStore` for Prisma-backed persistence.
- `InMemorySessionStore` for session memory.
- `HttpTransport`, `WebSocketTransport`, `StdioTransport`, and `QueueTransport`.
- `ApiKeyAuthProvider`, `OAuthProvider`, `WebhookTrigger`, and `CronTrigger`.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Agents](docs/agents.md)
- [Agent Teams](docs/agent-teams.md)
- [Tools](docs/tools.md)
- [Providers](docs/providers.md)
- [Dev UI](docs/dev-ui.md)
- [Roadmap](docs/roadmap.md)
- [API Reference](API_REFERENCE.md)
- [Architecture](ARCHITECTURE.md)

## Current Limitations

- The package is pre-`1.0`; public APIs may change with clear release notes.
- Advanced team modes are not complete yet.
- Anthropic support is not implemented yet.
- The dev UI is intended for local development, not production deployment.
- Plugin marketplace support is currently design guidance, tracked in [issue #5](https://github.com/SSharma1103/agent-sdk/issues/5).

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build:web
npm run pack:dry-run
```

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), [ROADMAP.md](ROADMAP.md), and issues labeled `good first issue` or `help wanted`.

## Security

Please do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
