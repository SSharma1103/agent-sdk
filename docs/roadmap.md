# Roadmap

This page mirrors the public GitHub issue roadmap.

## Providers

- [#1 Implement AnthropicProvider adapter](https://github.com/SSharma1103/agent-sdk/issues/1)

## Agent Teams

- [#2 Implement AgentTeam handoff mode](https://github.com/SSharma1103/agent-sdk/issues/2)
- [#3 Implement AgentTeam planner-executor mode](https://github.com/SSharma1103/agent-sdk/issues/3)

## Documentation

- [#4 Refresh API reference to remove stale placeholder docs](https://github.com/SSharma1103/agent-sdk/issues/4)

## Plugins

- [#5 Define plugin marketplace implementation roadmap](https://github.com/SSharma1103/agent-sdk/issues/5)

## Stability Policy

Agent SDK is currently `0.x`.

- Patch releases should preserve behavior unless fixing a bug.
- Minor releases may change APIs before `1.0`, but should include migration notes.
- `1.0` should mark the core `Brain`, `Agent`, `AgentTeam`, `ToolRegistry`, `Pipeline`, and storage interfaces as stable.
