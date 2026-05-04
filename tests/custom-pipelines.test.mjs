import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentSDK,
  Brain,
  DeclarativePipeline,
  EmailPipeline,
  LocalToolConnector,
  LocalModelProvider,
  MemoryStore,
  OAuthProvider,
  Orchestrator,
  StdioTransport,
  ToolRegistry,
  ToolExecutionError,
  ToolNotFoundError,
  ValidationError,
  WebSocketTransport,
  WebhookTrigger,
  CronTrigger,
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

test("local model provider calls an OpenAI-compatible local endpoint", async () => {
  const requests = [];
  const provider = new LocalModelProvider({
    baseUrl: "http://local.test/v1",
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "local ok" } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      }), { status: 200, headers: { "content-type": "application/json" } });
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
  const provider = new OAuthProvider(async (token) => token === "good"
    ? { id: "user_1", scopes: ["read"] }
    : null);

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
