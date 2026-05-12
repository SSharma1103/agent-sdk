# Agents

An `Agent` is the smallest reusable LLM worker in Agent SDK. It combines instructions, model configuration, optional tools, metadata, and session memory.

## Core Shape

```ts
const agent = new Agent(
  {
    name: "researcher",
    description: "Finds important context.",
    instructions: "Be concise. List uncertainty.",
    model: "gpt-4o-mini",
    tools: ["search_docs"],
  },
  { brain, memory },
);
```

## Running Agents

Agents can be run directly or registered with `AgentSDK`.

```ts
sdk.registerAgent(agent);

const output = await sdk.runAgent("researcher", {
  sessionId: "session_1",
  input: "Research the current roadmap.",
});
```

## Events

Agents emit lifecycle events through the pipeline context:

- `agent.started`
- `agent.tool_call`
- `agent.completed`
- `agent.failed`

These events power the local dev UI and can also be used by host applications for tracing.

## Memory

When `sessionId` is provided and a `SessionMemory` implementation is available, the agent stores user and assistant messages under an agent-scoped session key.

Use `InMemorySessionStore` for local development and tests. Use a custom `SessionMemory` adapter for production.
