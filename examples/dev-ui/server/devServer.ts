import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { AgentRunOutput, AgentTeamRunOutput } from "../../../sdk/agents/contracts.js";
import { createId } from "../../../sdk/utils/id.js";
import { createSseWriter } from "./sse.js";
import { DevUiRegistry, type DevUiRegistryConfig, type DevUiTargetType } from "./registry.js";

export type DevUiEvent = {
  id: string;
  runId: string;
  type: string;
  timestamp: string;
  agentName?: string;
  teamName?: string;
  payload?: unknown;
};

export type DevUiRunRequest = {
  targetType: DevUiTargetType;
  targetName: string;
  sessionId?: string;
  input: string;
  streaming?: boolean;
  metadata?: Record<string, unknown>;
};

export type DevUiRunResponse = {
  runId: string;
  output: AgentRunOutput | AgentTeamRunOutput;
  events: DevUiEvent[];
};

export type DevUiServerConfig = DevUiRegistryConfig & {
  port?: number;
  host?: string;
  staticDir?: string;
};

export type DevUiServer = {
  registry: DevUiRegistry;
  server: Server;
  start(): Promise<{ url: string }>;
  close(): Promise<void>;
};

export function createDevUiServer(config: DevUiServerConfig): DevUiServer {
  const registry = new DevUiRegistry(config);
  const staticDir = config.staticDir ?? resolve("examples/dev-ui/web/dist");
  const server = createServer((request, response) => {
    handleRequest(registry, staticDir, request, response).catch((error: unknown) => {
      sendJson(response, errorStatus(error), toErrorBody(error));
    });
  });

  return {
    registry,
    server,
    start() {
      const port = config.port ?? 8787;
      const host = config.host ?? "127.0.0.1";
      return new Promise((resolveStart, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolveStart({ url: `http://${host}:${port}` });
        });
      });
    },
    close() {
      return new Promise((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
    },
  };
}

async function handleRequest(
  registry: DevUiRegistry,
  staticDir: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/api/agents") {
    sendJson(response, 200, { targets: registry.listTargets() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(response, 200, { sessions: registry.listSessions() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readJson<{ title?: string; state?: Record<string, unknown> }>(request);
    sendJson(response, 201, { session: registry.createSession(body.title, body.state) });
    return;
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && request.method === "GET") {
    const session = registry.getSession(sessionMatch[1]);
    if (!session)
      return sendJson(response, 404, { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
    sendJson(response, 200, { session });
    return;
  }

  if (sessionMatch && request.method === "PATCH") {
    const body = await readJson<{ state?: Record<string, unknown> }>(request);
    const session = registry.updateSessionState(sessionMatch[1], body.state ?? {});
    if (!session)
      return sendJson(response, 404, { error: { code: "SESSION_NOT_FOUND", message: "Session not found" } });
    sendJson(response, 200, { session });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/run") {
    const body = await readJson<DevUiRunRequest>(request);
    const result = await runTarget(registry, body);
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/run-sse") {
    const body = await readJson<DevUiRunRequest>(request);
    const writer = createSseWriter(response);
    try {
      const result = await runTarget(registry, body, (event) => writer.send("event", event));
      writer.send("done", result);
    } catch (error) {
      writer.send("error", toErrorBody(error).error);
    } finally {
      writer.close();
    }
    return;
  }

  if (request.method === "GET") {
    await serveStatic(staticDir, url.pathname, response);
    return;
  }

  sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
}

async function runTarget(
  registry: DevUiRegistry,
  request: DevUiRunRequest,
  onEvent?: (event: DevUiEvent) => void,
): Promise<DevUiRunResponse> {
  assertRunRequest(request);
  const target = registry.getTarget(request.targetType, request.targetName);
  if (!target) {
    throw new DevUiHttpError(
      404,
      "TARGET_NOT_FOUND",
      `${request.targetType} "${request.targetName}" is not registered`,
    );
  }

  const session = registry.ensureSession(request.sessionId);
  const runId = createId("run");
  const events: DevUiEvent[] = [];
  registry.appendMessage(session.id, { role: "user", content: request.input, targetName: request.targetName });

  const emit = (type: string, payload?: unknown) => {
    const event = normalizeEvent(runId, type, payload);
    events.push(event);
    onEvent?.(event);
  };

  const output =
    request.targetType === "agent"
      ? await registry.config.sdk.runAgent(
          request.targetName,
          {
            input: request.input,
            sessionId: session.id,
            metadata: request.metadata,
          },
          {
            metadata: request.metadata,
            emit: (event) => emit(event.type, event.payload),
          },
        )
      : await registry.config.sdk.runTeam(
          request.targetName,
          {
            input: request.input,
            sessionId: session.id,
            metadata: request.metadata,
          },
          {
            metadata: request.metadata,
            emit: (event) => emit(event.type, event.payload),
          },
        );

  registry.appendMessage(session.id, { role: "assistant", content: output.text, targetName: request.targetName });
  return { runId, output, events };
}

function normalizeEvent(runId: string, type: string, payload: unknown): DevUiEvent {
  const objectPayload = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    id: createId("event"),
    runId,
    type,
    timestamp: new Date().toISOString(),
    agentName: typeof objectPayload.agentName === "string" ? objectPayload.agentName : undefined,
    teamName: typeof objectPayload.teamName === "string" ? objectPayload.teamName : undefined,
    payload,
  };
}

function assertRunRequest(request: DevUiRunRequest): void {
  if (request.targetType !== "agent" && request.targetType !== "team") {
    throw new DevUiHttpError(400, "INVALID_TARGET_TYPE", "targetType must be agent or team");
  }
  if (!request.targetName || !request.input) {
    throw new DevUiHttpError(400, "INVALID_RUN_REQUEST", "targetName and input are required");
  }
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

async function serveStatic(staticDir: string, pathname: string, response: ServerResponse): Promise<void> {
  const filePath = pathname === "/" ? join(staticDir, "index.html") : join(staticDir, pathname);
  const safePath = resolve(filePath);
  if (!safePath.startsWith(resolve(staticDir))) {
    sendJson(response, 403, { error: { code: "FORBIDDEN", message: "Forbidden" } });
    return;
  }

  try {
    const bytes = await readFile(safePath);
    response.writeHead(200, { "content-type": contentType(safePath) });
    response.end(bytes);
  } catch {
    const index = await readFile(join(staticDir, "index.html"));
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(index);
  }
}

function contentType(pathname: string): string {
  const ext = extname(pathname);
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".html") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function toErrorBody(error: unknown): { error: { code: string; message: string; details?: unknown } } {
  if (error instanceof DevUiHttpError) {
    return { error: { code: error.code, message: error.message } };
  }
  return {
    error: {
      code: "DEV_UI_ERROR",
      message: error instanceof Error ? error.message : "Unknown dev UI error",
    },
  };
}

function errorStatus(error: unknown): number {
  return error instanceof DevUiHttpError ? error.status : 500;
}

class DevUiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
