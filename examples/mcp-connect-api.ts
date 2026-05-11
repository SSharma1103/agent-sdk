import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Agent, AgentMcpConnectedServer } from "../sdk/index.js";

type ConnectMcpRequest = {
  name?: string;
  command?: string;
  env?: Record<string, string>;
};

export function createMcpConnectApiServer(agent: Agent, port = 8788) {
  const server = createServer((request, response) => {
    handleRequest(agent, request, response).catch((error: unknown) => {
      sendJson(response, 500, {
        error: {
          code: "MCP_CONNECT_FAILED",
          message: error instanceof Error ? error.message : "Failed to connect MCP server",
        },
      });
    });
  });

  return {
    server,
    start: () =>
      new Promise<{ url: string }>((resolve) => {
        server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${port}` }));
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handleRequest(agent: Agent, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method !== "POST" || url.pathname !== "/api/mcp/connect") {
    sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
    return;
  }

  const body = await readJson<ConnectMcpRequest>(request);
  if (!body.name || !body.command) {
    sendJson(response, 400, {
      error: { code: "INVALID_MCP_REQUEST", message: "name and command are required" },
    });
    return;
  }

  const result = await agent.addMcpCommand({
    name: body.name,
    command: body.command,
    env: body.env,
  });

  sendJson(response, 200, toResponse(result));
}

function toResponse(result: AgentMcpConnectedServer) {
  return {
    name: result.name,
    status: result.status,
    transport: result.transport,
    tools: result.tools,
  };
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as T) : ({} as T);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
