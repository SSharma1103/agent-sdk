# Agent Teams

`AgentTeam` coordinates multiple agents while preserving the same SDK interfaces for tools, memory, and model providers.

## Supported Modes

| Mode         | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| `manager`    | A manager agent coordinates specialist agents registered as tools.           |
| `sequential` | Agents run in order, passing each output to the next agent.                  |
| `parallel`   | Specialist agents run concurrently; an optional manager synthesizes results. |

Planned modes:

- `handoff`: [issue #2](https://github.com/SSharma1103/agent-sdk/issues/2)
- `planner-executor`: [issue #3](https://github.com/SSharma1103/agent-sdk/issues/3)

## Example

```ts
const team = new AgentTeam({
  name: "research-team",
  mode: "parallel",
  manager,
  agents: [researcher, reviewer],
  brain,
  tools,
});

sdk.registerTeam(team);

const output = await sdk.runTeam("research-team", {
  sessionId: "session_1",
  input: "Compare these implementation options.",
});
```

## Events

Teams emit:

- `agent_team.started`
- member agent events
- `agent_team.completed`

Host applications should treat the event stream as the main debugging and observability surface.
