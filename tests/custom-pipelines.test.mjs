import test from "node:test";
import assert from "node:assert/strict";
import * as sdkModule from "../dist/sdk/index.js";

const {
  Agent,
  AgentSDK,
  AgentTeam,
  Brain,
  DeclarativePipeline,
  InMemorySessionStore,
  LocalToolConnector,
  LocalModelProvider,
  MemoryStore,
  OAuthProvider,
  Orchestrator,
  PipelineRegistry,
  PipelineRuntime,
  PipelineNotFoundError,
  StdioTransport,
  ToolRegistry,
  ToolExecutionError,
  ToolNotFoundError,
  ValidationError,
  WebSocketTransport,
  WebhookTrigger,
  CronTrigger,
} = sdkModule;

class EchoProvider {
  name = "echo";
  calls = [];

  async generate(input) {
    this.calls.push(input);
    return {
      text: input.messages.map((message) => message.content).join(" "),
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    };
  }
}

class ToolCallingProvider {
  name = "tool-caller";
  calls = [];

  async generate(input) {
    this.calls.push(input);
    if (this.calls.length === 1) {
      return {
        text: "",
        toolCalls: [{ id: "call_1", name: "lookup", input: { id: 42 } }],
        usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
      };
    }

    const toolMessage = input.messages.find((message) => message.role === "tool");
    return {
      text: `final:${toolMessage.content}`,
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    };
  }
}

test("orchestrator runs global, pipeline, and call hooks while preserving plain output", async () => {
  const events = [];
  const storage = new MemoryStore();
  const sdk = new AgentSDK({
    storage,
    metadata: { source: "global" },
    hooks: {
      beforeRun: () => events.push("global:before"),
      afterRun: () => events.push("global:after"),
    },
  });
  sdk.registerPipeline({
    name: "hello",
    hooks: {
      beforeRun: () => events.push("pipeline:before"),
      afterRun: () => events.push("pipeline:after"),
    },
    async run(input, context) {
      events.push(`run:${context.metadata.source}:${context.metadata.requestId}`);
      return `hi ${input.name}`;
    },
  });

  const output = await sdk.runPipeline(
    "hello",
    { name: "Ada" },
    {
      metadata: { requestId: "req_1" },
      hooks: {
        beforeRun: () => events.push("call:before"),
        afterRun: () => events.push("call:after"),
      },
    },
  );

  assert.equal(output, "hi Ada");
  assert.deepEqual(events, [
    "global:before",
    "pipeline:before",
    "call:before",
    "run:global:req_1",
    "global:after",
    "pipeline:after",
    "call:after",
  ]);
  const runs = await storage.getRuns();
  assert.equal(runs[0].status, "success");
  assert.deepEqual(runs[0].metadata, { source: "global", requestId: "req_1" });
});

test("orchestrator can recover from errors with onError fallback", async () => {
  const sdk = new AgentSDK({
    hooks: {
      onError: ({ error }) => ({ recovered: error.message }),
    },
  });
  sdk.registerPipeline({
    name: "fails",
    async run() {
      throw new Error("boom");
    },
  });

  assert.deepEqual(await sdk.runPipeline("fails", {}), { recovered: "boom" });
});

test("pipeline registry manages named pipelines and aliases", async () => {
  const registry = new PipelineRegistry();
  const calls = [];
  const pipeline = {
    name: "original",
    hooks: {},
    inputSchema: {
      safeParse(input) {
        return input && typeof input.value === "number"
          ? { success: true, data: input }
          : { success: false, error: [{ path: ["value"], message: "Required" }] };
      },
    },
    validate(input) {
      calls.push(input.value);
    },
    async run(input) {
      return input.value * 2;
    },
  };

  registry.register(pipeline);
  registry.register("alias", pipeline);

  assert.equal(registry.has("original"), true);
  assert.equal(registry.has("alias"), true);
  assert.deepEqual(
    registry.list().map((item) => item.name),
    ["original", "alias"],
  );
  assert.equal(await registry.require("alias").run({ value: 3 }), 6);
  registry.require("alias").validate({ value: 4 });
  assert.deepEqual(calls, [4]);
  assert.equal(registry.unregister("original"), true);
  assert.equal(registry.get("original"), undefined);
  assert.throws(() => registry.require("missing"), (error) => error instanceof PipelineNotFoundError);
  registry.clear();
  assert.deepEqual(registry.list(), []);
});

test("declarative pipelines support mapping, conditions, retries, nested pipelines, and LLM steps", async () => {
  const provider = new EchoProvider();
  const tools = new ToolRegistry();
  const events = [];
  let flakyCalls = 0;

  tools.register(new LocalToolConnector("double", (input) => input.value * 2));
  tools.register(
    new LocalToolConnector("flaky", () => {
      flakyCalls += 1;
      if (flakyCalls === 1) throw new Error("try again");
      return "ok";
    }),
  );

  const brain = new Brain({ providers: [provider] });
  const registry = new PipelineRegistry();
  const runtime = new PipelineRuntime({ registry });
  registry.register({
    name: "wrap",
    async run(input) {
      return { wrapped: input };
    },
  });

  const pipeline = new DeclarativePipeline(
    {
      name: "custom",
      steps: [
        {
          id: "double",
          type: "tool",
          name: "double",
          mapInput: (state) => ({ value: state.input.count }),
        },
        {
          id: "skip",
          type: "tool",
          name: "double",
          when: () => false,
        },
        {
          id: "flaky",
          type: "tool",
          name: "flaky",
          retry: 1,
          mapOutput: (_output, state) => state.steps.double,
        },
        {
          id: "llm",
          type: "llm",
          model: "echo-model",
          prompt: (state) => `count ${state.current}`,
        },
        {
          id: "nested",
          type: "pipeline",
          name: "wrap",
          mapInput: (state) => state.steps.llm.text,
        },
      ],
    },
    { brain, tools, registry, runtime },
  );

  const output = await pipeline.run(
    { count: 3 },
    {
      emit: (event) => events.push(event.type),
    },
  );

  assert.deepEqual(output, { wrapped: "count 6" });
  assert.equal(flakyCalls, 2);
  assert.equal(provider.calls[0].model, "echo-model");
  assert.ok(events.includes("pipeline.step.skipped"));
  assert.ok(events.includes("pipeline.step.failed"));
});

test("declarative pipelines can run a tool step", async () => {
  const tools = new ToolRegistry();
  const brain = new Brain({ providers: [new EchoProvider()] });
  tools.register(new LocalToolConnector("double", (input) => input.value * 2));

  const pipeline = new DeclarativePipeline(
    {
      name: "tool-only",
      steps: [{ id: "double", type: "tool", name: "double" }],
    },
    { brain, tools },
  );

  assert.equal(await pipeline.run({ value: 4 }), 8);
});

test("declarative pipelines can run an llm step through Brain", async () => {
  const provider = new EchoProvider();
  const tools = new ToolRegistry();
  const brain = new Brain({ providers: [provider], tools });

  const pipeline = new DeclarativePipeline(
    {
      name: "llm-only",
      steps: [{ id: "draft", type: "llm", model: "echo-model", prompt: "hello brain" }],
    },
    { brain, tools },
  );

  const output = await pipeline.run({});

  assert.equal(output.text, "hello brain");
  assert.equal(provider.calls[0].model, "echo-model");
});

test("declarative pipelines can call an Agent registered as a tool", async () => {
  const provider = new EchoProvider();
  const tools = new ToolRegistry();
  const brain = new Brain({ providers: [provider], tools });
  const agent = new Agent(
    {
      name: "researcher",
      instructions: "Research briefly.",
      model: "echo-model",
    },
    { brain },
  );
  tools.register(agent.asTool());

  const pipeline = new DeclarativePipeline(
    {
      name: "agent-tool",
      steps: [
        {
          id: "research",
          type: "tool",
          name: "researcher",
          mapInput: () => ({ input: "new models", sessionId: "session_agent_tool" }),
        },
      ],
    },
    { brain, tools },
  );

  const output = await pipeline.run({});

  assert.equal(output.agentName, "researcher");
  assert.ok(output.text.includes("new models"));
});

test("declarative pipelines can call an AgentTeam registered as a tool", async () => {
  class NamedProvider {
    name = "named-team";

    async generate(input) {
      return {
        text: `${input.model}:${input.messages.at(-1).content}`,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    }
  }

  const tools = new ToolRegistry();
  const brain = new Brain({ providers: [new NamedProvider()], tools });
  const first = new Agent({ name: "scraper", instructions: "Scrape.", model: "scraper-model" }, { brain });
  const second = new Agent({ name: "judge", instructions: "Judge.", model: "judge-model" }, { brain });
  const team = new AgentTeam({
    name: "research_team",
    mode: "sequential",
    agents: [first, second],
    brain,
    tools,
  });
  tools.register(team.asTool());

  const pipeline = new DeclarativePipeline(
    {
      name: "team-tool",
      steps: [{ id: "team", type: "tool", name: "research_team", mapInput: () => ({ input: "launches" }) }],
    },
    { brain, tools },
  );

  const output = await pipeline.run({});

  assert.equal(output.teamName, "research_team");
  assert.equal(output.results.length, 2);
  assert.equal(output.text, "judge-model:scraper-model:launches");
});

test("pipeline runtime can run nested DeclarativePipelines", async () => {
  const tools = new ToolRegistry();
  const storage = new MemoryStore();
  const events = [];
  const brain = new Brain({ providers: [new EchoProvider()], tools });
  const registry = new PipelineRegistry();
  const runtime = new PipelineRuntime({ registry, storage });
  tools.register(new LocalToolConnector("append", (input) => `${input.text}!`));

  const child = new DeclarativePipeline(
    {
      name: "child-declarative",
      steps: [{ id: "append", type: "tool", name: "append" }],
    },
    { brain, tools },
  );
  const parent = new DeclarativePipeline(
    {
      name: "parent-declarative",
      steps: [
        {
          id: "child",
          type: "pipeline",
          name: "child-declarative",
          mapInput: (state) => ({ text: state.input }),
        },
      ],
    },
    { brain, tools, registry, runtime },
  );

  registry.register(child);
  registry.register(parent);

  assert.equal(
    await runtime.runRegistered("parent-declarative", "nested", {
      emit: (event) => events.push(event),
    }),
    "nested!",
  );
  assert.equal((await storage.getRuns()).length, 1);
  assert.equal(new Set(events.map((event) => event.runId).filter(Boolean)).size, 1);
});

test("sdk index does not export app-specific pipeline classes", () => {
  assert.equal("EmailPipeline" in sdkModule, false);
  assert.equal("ScrapePipeline" in sdkModule, false);
  assert.equal("OnboardingApiPipeline" in sdkModule, false);
});

test("brain executes tool calls until the provider returns final text", async () => {
  const provider = new ToolCallingProvider();
  const tools = new ToolRegistry();
  tools.register(new LocalToolConnector("lookup", async (input) => ({ value: `item-${input.id}` })));
  const brain = new Brain({ providers: [provider], tools });

  const output = await brain.run({
    model: "tool-model",
    messages: [{ role: "user", content: "lookup item" }],
  });

  assert.equal(output.text, 'final:{"value":"item-42"}');
  assert.equal(output.usage.totalTokens, 10);
  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[1].messages.at(-1).role, "tool");
  assert.equal(provider.calls[1].messages.at(-1).toolCallId, "call_1");
});

test("brain wraps tool failures in ToolExecutionError", async () => {
  const provider = new ToolCallingProvider();
  const tools = new ToolRegistry();
  tools.register(
    new LocalToolConnector("lookup", async () => {
      throw new Error("database unavailable");
    }),
  );
  const brain = new Brain({ providers: [provider], tools });

  await assert.rejects(
    brain.run({ model: "tool-model", messages: [{ role: "user", content: "lookup" }] }),
    (error) => error instanceof ToolExecutionError && error.code === "TOOL_EXECUTION_FAILED",
  );
});

test("validation helpers support zod-like safeParse schemas on pipelines", async () => {
  const schema = {
    safeParse(input) {
      return input && typeof input.name === "string"
        ? { success: true, data: input }
        : { success: false, error: [{ path: ["name"], message: "Required" }] };
    },
  };
  const sdk = new AgentSDK();
  sdk.registerPipeline({
    name: "validated",
    inputSchema: schema,
    async run(input) {
      return input.name;
    },
  });

  assert.equal(await sdk.runPipeline("validated", { name: "Ada" }), "Ada");
  await assert.rejects(
    sdk.runPipeline("validated", { bad: true }),
    (error) => error instanceof ValidationError && error.code === "VALIDATION_ERROR",
  );
});

test("tool registry throws a named ToolNotFoundError", async () => {
  const tools = new ToolRegistry();

  await assert.rejects(
    tools.call("missing", {}),
    (error) => error instanceof ToolNotFoundError && error.code === "TOOL_NOT_FOUND",
  );
});

test("local model provider calls an OpenAI-compatible local endpoint", async () => {
  const requests = [];
  const provider = new LocalModelProvider({
    baseUrl: "http://local.test/v1",
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "local ok" } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const output = await provider.generate({
    model: "llama",
    messages: [{ role: "user", content: "hi" }],
  });

  assert.equal(output.text, "local ok");
  assert.equal(output.usage.totalTokens, 3);
  assert.equal(requests[0].url, "http://local.test/v1/chat/completions");
  assert.equal(requests[0].body.model, "llama");
});

test("oauth provider delegates token verification", async () => {
  const provider = new OAuthProvider(async (token) => (token === "good" ? { id: "user_1", scopes: ["read"] } : null));

  assert.deepEqual(await provider.authenticate({ token: "good" }), { id: "user_1", scopes: ["read"] });
  assert.equal(await provider.authenticate({ headers: { authorization: "Bearer bad" } }), null);
});

test("websocket transport correlates request and response envelopes", async () => {
  class FakeSocket {
    listener;
    sent = [];
    send(data) {
      this.sent.push(JSON.parse(data));
      queueMicrotask(() => {
        this.listener({ data: JSON.stringify({ id: this.sent[0].id, body: { ok: true } }) });
      });
    }
    addEventListener(_type, listener) {
      this.listener = listener;
    }
  }

  const socket = new FakeSocket();
  const transport = new WebSocketTransport({ socket, timeoutMs: 1000 });
  const output = await transport.send({ route: "ping", body: { hello: "world" } });

  assert.deepEqual(output, { ok: true });
  assert.equal(socket.sent[0].route, "ping");
});

test("stdio transport delegates to an injected client", async () => {
  const transport = new StdioTransport({
    async send(request) {
      return { route: request.route, echoed: request.body };
    },
  });

  assert.deepEqual(await transport.send({ route: "tool", body: { id: 1 } }), {
    route: "tool",
    echoed: { id: 1 },
  });
});

test("webhook and cron triggers can be invoked by host runtimes", async () => {
  const events = [];
  const webhook = new WebhookTrigger("incoming");
  await webhook.start(async (event) => {
    events.push(event);
  });
  await webhook.handle({ body: { id: 1 }, headers: { "x-test": "yes" } });

  const cron = new CronTrigger("nightly", "0 0 * * *");
  await cron.start(async (event) => {
    events.push(event);
  });
  await cron.fire({ job: "sync" });

  assert.equal(events[0].type, "webhook");
  assert.deepEqual(events[0].payload, { id: 1 });
  assert.equal(events[1].type, "cron");
  assert.deepEqual(events[1].payload, { job: "sync" });
});

test("agents build instruction and memory messages, persist sessions, and emit lifecycle events", async () => {
  const provider = new EchoProvider();
  const memory = new InMemorySessionStore();
  const brain = new Brain({ providers: [provider] });
  const agent = new Agent(
    {
      name: "researcher",
      instructions: "Be concise.",
      model: "echo-model",
    },
    { brain, memory },
  );
  const events = [];

  const first = await agent.run(
    { input: "first", sessionId: "session_1" },
    {
      emit: (event) => events.push(event.type),
    },
  );
  const second = await agent.run({ input: "second", sessionId: "session_1" });

  assert.equal(first.agentName, "researcher");
  assert.deepEqual(events, ["agent.started", "agent.completed"]);
  assert.equal(provider.calls[0].messages[0].role, "system");
  assert.equal(provider.calls[0].messages[0].content, "Be concise.");
  assert.ok(provider.calls[1].messages.some((message) => message.content === "first"));
  assert.ok(second.text.includes("second"));
});

test("agent config hooks observe direct runs", async () => {
  const provider = new EchoProvider();
  const brain = new Brain({ providers: [provider] });
  const calls = [];
  const agent = new Agent(
    {
      name: "observer",
      instructions: "Observe.",
      model: "echo-model",
      hooks: {
        beforeRun: (context) => calls.push(["before", context.agentName, context.input.input]),
        afterRun: (context) => calls.push(["after", context.output.agentName, context.output.text]),
      },
    },
    { brain },
  );

  const output = await agent.run("hello hooks");

  assert.equal(output.agentName, "observer");
  assert.deepEqual(calls, [
    ["before", "observer", "hello hooks"],
    ["after", "observer", output.text],
  ]);
});

test("agent dependency hooks run before config hooks", async () => {
  const provider = new EchoProvider();
  const brain = new Brain({ providers: [provider] });
  const calls = [];
  const agent = new Agent(
    {
      name: "ordered",
      instructions: "Order hooks.",
      model: "echo-model",
      hooks: {
        beforeRun: () => calls.push("config:before"),
        afterRun: () => calls.push("config:after"),
      },
    },
    {
      brain,
      hooks: {
        beforeRun: () => calls.push("deps:before"),
        afterRun: () => calls.push("deps:after"),
      },
    },
  );

  await agent.run("check order");

  assert.deepEqual(calls, ["deps:before", "config:before", "deps:after", "config:after"]);
});

test("agent tool call hooks receive tool calls", async () => {
  const provider = new ToolCallingProvider();
  const tools = new ToolRegistry();
  const toolCalls = [];
  tools.register(new LocalToolConnector("lookup", async (input) => ({ value: `item-${input.id}` })));
  const brain = new Brain({ providers: [provider], tools });
  const agent = new Agent(
    {
      name: "tool-observer",
      instructions: "Use tools.",
      model: "tool-model",
      tools: ["lookup"],
      hooks: {
        onToolCall: (context) => toolCalls.push(context.toolCall),
      },
    },
    { brain },
  );

  const output = await agent.run("lookup item");

  assert.equal(output.text, 'final:{"value":"item-42"}');
  assert.deepEqual(toolCalls, [{ id: "call_1", name: "lookup", input: { id: 42 } }]);
});

test("agent error hooks observe failures without swallowing them", async () => {
  const expectedError = new Error("provider failed");
  const provider = {
    name: "failing",
    async generate() {
      throw expectedError;
    },
  };
  const brain = new Brain({ providers: [provider] });
  const errors = [];
  const agent = new Agent(
    {
      name: "failing-agent",
      instructions: "Fail.",
      model: "failing-model",
      hooks: {
        onError: (context) => errors.push(context.error),
      },
    },
    { brain },
  );

  await assert.rejects(() => agent.run("explode"), (error) => error === expectedError);
  assert.deepEqual(errors, [expectedError]);
});

test("agent hooks preserve PipelineRuntime hooks and agent events", async () => {
  const provider = new EchoProvider();
  const brain = new Brain({ providers: [provider] });
  const calls = [];
  const sdk = new AgentSDK({
    hooks: {
      beforeRun: () => calls.push("pipeline:before"),
      afterRun: () => calls.push("pipeline:after"),
    },
  });
  const agent = new Agent(
    {
      name: "pipeline-agent",
      instructions: "Run through pipeline.",
      model: "echo-model",
      hooks: {
        beforeRun: () => calls.push("agent:before"),
        afterRun: () => calls.push("agent:after"),
      },
    },
    { brain },
  );

  sdk.registerAgent(agent);
  await sdk.runAgent("pipeline-agent", "through runtime", {
    emit: (event) => calls.push(`event:${event.type}`),
  });

  assert.deepEqual(calls, [
    "pipeline:before",
    "agent:before",
    "event:agent.started",
    "agent:after",
    "event:agent.completed",
    "pipeline:after",
  ]);
});

test("sdk registers agents and teams as pipelines, with specialist agents usable as tools", async () => {
  class ManagerProvider {
    name = "manager-provider";
    calls = [];

    async generate(input) {
      this.calls.push(input);
      if (input.model === "manager-model" && !input.messages.some((message) => message.role === "tool")) {
        return {
          text: "",
          toolCalls: [{ id: "call_researcher", name: "researcher", input: { input: "Find X" } }],
          usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
        };
      }

      if (input.model === "manager-model") {
        const toolMessage = input.messages.find((message) => message.role === "tool");
        return {
          text: `managed:${toolMessage.content}`,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        };
      }

      return {
        text: `researched:${input.messages.at(-1).content}`,
        usage: { promptTokens: 5, completionTokens: 6, totalTokens: 11 },
      };
    }
  }

  const provider = new ManagerProvider();
  const tools = new ToolRegistry();
  const brain = new Brain({ providers: [provider], tools });
  const researcher = new Agent(
    {
      name: "researcher",
      instructions: "Research.",
      model: "research-model",
    },
    { brain },
  );
  const manager = new Agent(
    {
      name: "manager",
      instructions: "Delegate.",
      model: "manager-model",
      tools: ["researcher"],
    },
    { brain },
  );
  const team = new AgentTeam({
    name: "software-team",
    mode: "manager",
    manager,
    agents: [researcher],
    brain,
    tools,
  });
  const sdk = new AgentSDK();
  const events = [];

  sdk.registerAgent(researcher);
  sdk.registerTeam(team);

  const agentOutput = await sdk.runAgent("researcher", "direct");
  const teamOutput = await sdk.runTeam(
    "software-team",
    { input: "Build X" },
    {
      emit: (event) => events.push(event.type),
    },
  );

  assert.equal(agentOutput.text, "researched:direct");
  assert.equal(teamOutput.teamName, "software-team");
  assert.equal(teamOutput.mode, "manager");
  assert.ok(teamOutput.text.includes("researched:Find X"));
  assert.equal(teamOutput.usage.totalTokens, 10);
  assert.ok(events.includes("agent.tool_call"));
  assert.equal(tools.get("researcher").name, "researcher");
});

test("agent teams support sequential and parallel modes", async () => {
  class NamedProvider {
    name = "named";

    async generate(input) {
      return {
        text: `${input.model}:${input.messages.at(-1).content}`,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    }
  }

  const brain = new Brain({ providers: [new NamedProvider()] });
  const first = new Agent({ name: "first", instructions: "First.", model: "first-model" }, { brain });
  const second = new Agent({ name: "second", instructions: "Second.", model: "second-model" }, { brain });
  const manager = new Agent({ name: "manager", instructions: "Synthesize.", model: "manager-model" }, { brain });

  const sequential = new AgentTeam({
    name: "sequential-team",
    mode: "sequential",
    agents: [first, second],
    brain,
  });
  const parallel = new AgentTeam({
    name: "parallel-team",
    mode: "parallel",
    manager,
    agents: [first, second],
    brain,
  });

  const sequentialOutput = await sequential.run("start");
  const parallelOutput = await parallel.run("start");

  assert.equal(sequentialOutput.text, "second-model:first-model:start");
  assert.equal(sequentialOutput.usage.totalTokens, 4);
  assert.equal(parallelOutput.results.length, 3);
  assert.equal(parallelOutput.usage.totalTokens, 6);
  assert.ok(parallelOutput.text.startsWith("manager-model:Synthesize these agent results"));
});

test("agent teams support router mode with bounded manager decisions", async () => {
  class RouterProvider {
    name = "router";
    decisions = [
      { action: "call_agent", agent: "scraper", input: "Collect launch facts", reason: "Need raw facts" },
      { action: "call_agent", agent: "judge", input: "Review scraper findings", reason: "Need critique" },
      { action: "finish", answer: "final launch plan", reason: "Enough evidence" },
    ];
    objectPrompts = [];

    async generate(input) {
      return {
        text: `${input.model}:${input.messages.at(-1).content}`,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    }

    async generateObject(input) {
      this.objectPrompts.push(input.prompt);
      return {
        object: this.decisions.shift(),
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      };
    }
  }

  const provider = new RouterProvider();
  const brain = new Brain({ providers: [provider] });
  const scraper = new Agent(
    {
      name: "scraper",
      description: "Collects facts.",
      instructions: "Scrape.",
      model: "scraper-model",
    },
    { brain },
  );
  const judge = new Agent(
    {
      name: "judge",
      description: "Reviews facts.",
      instructions: "Judge.",
      model: "judge-model",
    },
    { brain },
  );
  const manager = new Agent(
    {
      name: "manager",
      instructions: "Route.",
      model: "manager-model",
    },
    { brain },
  );
  const team = new AgentTeam({
    name: "router-team",
    mode: "router",
    manager,
    agents: [scraper, judge],
    brain,
    maxSteps: 5,
    maxCallsPerAgent: 2,
  });
  const events = [];

  const output = await team.run("Plan launch", { emit: (event) => events.push(event.type) });

  assert.equal(output.mode, "router");
  assert.equal(output.text, "final launch plan");
  assert.deepEqual(
    output.results.map((result) => result.agentName),
    ["scraper", "judge"],
  );
  assert.equal(output.usage.totalTokens, 4);
  assert.ok(output.raw.state.messages.some((message) => message.channel === "findings"));
  assert.ok(provider.objectPrompts[1].includes("scraper: scraper-model:Collect launch facts"));
  assert.ok(events.includes("agent_team.router.started"));
  assert.ok(events.includes("agent_team.router.decision"));
  assert.ok(events.includes("agent_team.agent_call.started"));
  assert.ok(events.includes("agent_team.agent_call.completed"));
  assert.ok(events.includes("agent_team.router.finished"));
});
