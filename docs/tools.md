# Tools

Tools let providers request deterministic work from your application.

## Local Tools

```ts
tools.register(
  new LocalToolConnector("lookup_customer", async ({ id }) => ({
    id,
    plan: "pro",
  })),
);
```

When a model returns a tool call, `Brain` executes the matching connector, appends a tool result message, and continues until the provider returns final text or the tool iteration limit is reached.

## Agent As Tool

Agents can be exposed as tools for manager-style teams.

```ts
tools.register(researcher.asTool());
```

## Transport Tools

Use transport-backed connectors when the tool lives outside the process. Keep secrets, network permissions, and runtime ownership in the host application.

## Testing Tools

Prefer local fake connectors in tests. Verify:

- correct tool name
- input mapping
- output shape
- error handling
