import test from "node:test";
import assert from "node:assert/strict";
import {
  Agent,
  AgentSDK,
  AgentTeam,
  Brain,
  DeclarativePipeline,
  EmailPipeline,
  InMemorySessionStore,
  LocalToolConnector,
  MemoryStore,
  Orchestrator,
  ToolRegistry,
  ToolExecutionError,
  ToolNotFoundError,
  ValidationError,
} from "../dist/sdk/index.js";

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

  const output = await sdk.runPipeline("hello", { name: "Ada" }, {
    metadata: { requestId: "req_1" },
    hooks: {
      beforeRun: () => events.push("call:before"),
      afterRun: () => events.push("call:after"),
    },
  });

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

test("declarative pipelines support mapping, conditions, retries, nested pipelines, and LLM steps", async () => {
  const provider = new EchoProvider();
  const tools = new ToolRegistry();
  const events = [];
  let flakyCalls = 0;

  tools.register(new LocalToolConnector("double", (input) => input.value * 2));
  tools.register(new LocalToolConnector("flaky", () => {
    flakyCalls += 1;
    if (flakyCalls === 1) throw new Error("try again");
    return "ok";
  }));

  const brain = new Brain({ providers: [provider] });
  const orchestrator = new Orchestrator();
  orchestrator.registerPipeline({
    name: "wrap",
    async run(input) {
      return { wrapped: input };
    },
  });

  const pipeline = new DeclarativePipeline({
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
  }, { brain, tools, orchestrator });

  const output = await pipeline.run({ count: 3 }, {
    emit: (event) => events.push(event.type),
  });

  assert.deepEqual(output, { wrapped: "count 6" });
  assert.equal(flakyCalls, 2);
  assert.equal(provider.calls[0].model, "echo-model");
  assert.ok(events.includes("pipeline.step.skipped"));
  assert.ok(events.includes("pipeline.step.failed"));
});

test("email pipeline hooks customize rules, messages, and tool selection", async () => {
  const provider = new EchoProvider();
  const storage = new MemoryStore();
  const tools = new ToolRegistry();
  const brain = new Brain({ providers: [provider], storage, tools });
  tools.register(new LocalToolConnector("reply_to_thread", async () => ({ ok: true })));

  const emailPipeline = new EmailPipeline({
    brain,
    storage,
    tools,
    hooks: {
      matchRule: () => false,
      buildMessages: (email) => [{ role: "user", content: `custom:${email.subject}` }],
      selectTools: () => ["reply_to_thread"],
    },
  });

  const record = await emailPipeline.ensure("user_1");
  await emailPipeline.updateConfig("user_1", { keyId: "key_1", provider: "echo", model: "echo-model" });
  await emailPipeline.addWorkflowRule("user_1", {
    match: { field: "subject", op: "contains", value: "Pricing" },
    action: { kind: "reply", text: "static reply" },
  });

  const output = await emailPipeline.processIncomingEmail(record.webhookToken, {
    threadId: "thread_1",
    from: "customer@example.com",
    subject: "Pricing",
    body: "hello",
  });

  assert.equal(output.handled, "brain");
  assert.equal(output.reply, "custom:Pricing");
  assert.deepEqual(provider.calls[0].tools, ["reply_to_thread"]);
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
  tools.register(new LocalToolConnector("lookup", async () => {
    throw new Error("database unavailable");
  }));
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

test("agents build instruction and memory messages, persist sessions, and emit lifecycle events", async () => {
  const provider = new EchoProvider();
  const memory = new InMemorySessionStore();
  const brain = new Brain({ providers: [provider] });
  const agent = new Agent({
    name: "researcher",
    instructions: "Be concise.",
    model: "echo-model",
  }, { brain, memory });
  const events = [];

  const first = await agent.run({ input: "first", sessionId: "session_1" }, {
    emit: (event) => events.push(event.type),
  });
  const second = await agent.run({ input: "second", sessionId: "session_1" });

  assert.equal(first.agentName, "researcher");
  assert.deepEqual(events, ["agent.started", "agent.completed"]);
  assert.equal(provider.calls[0].messages[0].role, "system");
  assert.equal(provider.calls[0].messages[0].content, "Be concise.");
  assert.ok(provider.calls[1].messages.some((message) => message.content === "first"));
  assert.ok(second.text.includes("second"));
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
  const researcher = new Agent({
    name: "researcher",
    instructions: "Research.",
    model: "research-model",
  }, { brain });
  const manager = new Agent({
    name: "manager",
    instructions: "Delegate.",
    model: "manager-model",
    tools: ["researcher"],
  }, { brain });
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
  const teamOutput = await sdk.runTeam("software-team", { input: "Build X" }, {
    emit: (event) => events.push(event.type),
  });

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
