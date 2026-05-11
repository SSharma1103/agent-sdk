# Getting Started

Agent SDK is a framework-agnostic TypeScript library for building agentic workflows without committing to a specific web framework, database, or model provider.

## Requirements

- Node.js 20 or newer.
- TypeScript project using ESM.
- At least one `LLMProvider`.

## Install

```sh
npm install @shivamsharma11/agent-sdk
```

## Minimal Agent

```ts
import { Agent, AgentSDK, Brain, OpenAIProvider } from "@shivamsharma11/agent-sdk";

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
});

const sdk = new AgentSDK({ brain });

sdk.registerAgent(
  new Agent(
    {
      name: "assistant",
      instructions: "Answer clearly and ask for missing context when needed.",
      model: "gpt-4o-mini",
    },
    { brain },
  ),
);

const output = await sdk.runAgent("assistant", "Summarize this SDK in one sentence.");
console.log(output.text);
```

## Compatibility

| Area             | Support                                                |
| ---------------- | ------------------------------------------------------ |
| Node.js          | 20+                                                    |
| Module system    | ESM                                                    |
| TypeScript       | 5.8+                                                   |
| Runtime adapters | Framework-owned via dependency injection               |
| Stability        | `0.x`; expect documented breaking changes before `1.0` |

## Next Steps

- Read [Agents](agents.md) for single-agent design.
- Read [Agent Teams](agent-teams.md) for orchestration patterns.
- Run the local [Dev UI](dev-ui.md) to inspect agent events.
