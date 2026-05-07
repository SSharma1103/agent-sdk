import test from "node:test";
import assert from "node:assert/strict";
import {
  Agent,
  AgentSDK,
  AgentTeam,
  Brain,
  InMemorySessionStore,
  ToolRegistry,
} from "../dist/sdk/index.js";
import { createDevUiServer } from "../dist/examples/dev-ui/server/devServer.js";

class EchoProvider {
  name = "echo";

  async generate(input) {
    return {
      text: `${input.model}:${input.messages.at(-1).content}`,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    };
  }
}

test("dev UI server lists agents and teams", async () => {
  const fixture = await createFixture();
  try {
    const response = await fetch(`${fixture.url}/api/agents`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.targets.map((target) => `${target.type}:${target.name}`), [
      "agent:researcher",
      "agent:writer",
      "team:research-team",
    ]);
  } finally {
    await fixture.close();
  }
});

test("dev UI server creates, reads, and patches sessions", async () => {
  const fixture = await createFixture();
  try {
    const created = await post(`${fixture.url}/api/sessions`, { title: "Debug", state: { topic: "agents" } });
    const patched = await patch(`${fixture.url}/api/sessions/${created.session.id}`, { state: { depth: 2 } });
    const read = await get(`${fixture.url}/api/sessions/${created.session.id}`);

    assert.equal(created.session.title, "Debug");
    assert.deepEqual(patched.session.state, { topic: "agents", depth: 2 });
    assert.equal(read.session.id, created.session.id);
  } finally {
    await fixture.close();
  }
});

test("dev UI server runs an agent and captures emitted events", async () => {
  const fixture = await createFixture();
  try {
    const session = await post(`${fixture.url}/api/sessions`, { title: "Run" });
    const body = await post(`${fixture.url}/api/run`, {
      targetType: "agent",
      targetName: "researcher",
      sessionId: session.session.id,
      input: "hello",
    });
    const read = await get(`${fixture.url}/api/sessions/${session.session.id}`);

    assert.equal(body.output.text, "research-model:hello");
    assert.ok(body.events.some((event) => event.type === "agent.started"));
    assert.ok(body.events.some((event) => event.type === "agent.completed"));
    assert.equal(read.session.messages.length, 2);
  } finally {
    await fixture.close();
  }
});

test("dev UI server runs a team and captures team and member events", async () => {
  const fixture = await createFixture();
  try {
    const session = await post(`${fixture.url}/api/sessions`, { title: "Team" });
    const body = await post(`${fixture.url}/api/run`, {
      targetType: "team",
      targetName: "research-team",
      sessionId: session.session.id,
      input: "start",
    });

    assert.equal(body.output.text, "writer-model:research-model:start");
    assert.ok(body.events.some((event) => event.type === "agent_team.started"));
    assert.ok(body.events.some((event) => event.payload?.agentName === "researcher"));
    assert.ok(body.events.some((event) => event.payload?.agentName === "writer"));
  } finally {
    await fixture.close();
  }
});

test("dev UI server streams run events over SSE", async () => {
  const fixture = await createFixture();
  try {
    const session = await post(`${fixture.url}/api/sessions`, { title: "SSE" });
    const response = await fetch(`${fixture.url}/api/run-sse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "agent",
        targetName: "researcher",
        sessionId: session.session.id,
        input: "stream",
      }),
    });
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /event: event/);
    assert.match(text, /agent\.started/);
    assert.match(text, /event: done/);
  } finally {
    await fixture.close();
  }
});

test("dev UI server returns structured errors for missing targets", async () => {
  const fixture = await createFixture();
  try {
    const response = await fetch(`${fixture.url}/api/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetType: "agent",
        targetName: "missing",
        input: "hello",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, "TARGET_NOT_FOUND");
  } finally {
    await fixture.close();
  }
});

async function createFixture() {
  const memory = new InMemorySessionStore();
  const tools = new ToolRegistry();
  const brain = new Brain({ providers: [new EchoProvider()], tools });
  const sdk = new AgentSDK({ brain });
  const researcher = new Agent({
    name: "researcher",
    instructions: "Research",
    model: "research-model",
  }, { brain, memory });
  const writer = new Agent({
    name: "writer",
    instructions: "Write",
    model: "writer-model",
  }, { brain, memory });
  const team = new AgentTeam({
    name: "research-team",
    mode: "sequential",
    agents: [researcher, writer],
    brain,
    tools,
  });

  sdk.registerAgent(researcher);
  sdk.registerAgent(writer);
  sdk.registerTeam(team);

  const devUi = createDevUiServer({
    sdk,
    agents: [researcher, writer],
    teams: [team],
    memory,
    port: 0,
  });
  await devUi.start();
  const address = devUi.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => devUi.close(),
  };
}

async function get(url) {
  const response = await fetch(url);
  assert.ok(response.ok, `${url} returned ${response.status}`);
  return response.json();
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${url} returned ${response.status}`);
  return response.json();
}

async function patch(url, body) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${url} returned ${response.status}`);
  return response.json();
}
