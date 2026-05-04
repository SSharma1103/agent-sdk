import type { Transport, TransportRequest, TransportResponse } from "./contracts.js";
import { AgentSDKError } from "../errors.js";

export class HttpTransport implements Transport {
  constructor(private readonly config: { baseUrl?: string; fetch?: typeof fetch } = {}) {}

  async send<T = unknown>(request: TransportRequest): Promise<TransportResponse<T>> {
    const fetchImpl = this.config.fetch ?? fetch;
    const url = `${this.config.baseUrl ?? ""}${request.route ?? ""}`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(request.headers ?? {}) },
      body: JSON.stringify(request.body ?? {}),
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.json() as T,
    };
  }
}

export class WebSocketTransport implements Transport {
  private readonly socket: WebSocketLike;
  private readonly pending = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    timeout?: ReturnType<typeof setTimeout>;
  }>();

  constructor(private readonly config: WebSocketTransportConfig) {
    this.socket = config.socket ?? createWebSocket(config.url, config.WebSocket);
    bindWebSocketMessage(this.socket, (message) => this.handleMessage(message));
  }

  async send<T = unknown>(request: TransportRequest): Promise<T> {
    const id = createMessageId();
    const payload = JSON.stringify({ id, ...request });
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new AgentSDKError({
          code: "TRANSPORT_TIMEOUT",
          message: `[WebSocketTransport] request "${id}" timed out`,
          details: { id, route: request.route },
        }));
      }, this.config.timeoutMs ?? 30000);

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
      this.socket.send(payload);
    });
  }

  private handleMessage(message: unknown): void {
    const data = parseMessage(message);
    if (!isResponseEnvelope(data)) return;
    const pending = this.pending.get(data.id);
    if (!pending) return;
    this.pending.delete(data.id);
    if (pending.timeout) clearTimeout(pending.timeout);
    if (data.error) {
      pending.reject(new AgentSDKError({
        code: "TRANSPORT_REQUEST_FAILED",
        message: `[WebSocketTransport] request "${data.id}" failed`,
        details: { id: data.id, error: data.error },
      }));
      return;
    }
    pending.resolve(data.body ?? data);
  }
}

export class StdioTransport implements Transport {
  constructor(private readonly client: StdioClient) {}

  async send<T = unknown>(request: TransportRequest): Promise<T> {
    return this.client.send<T>(request);
  }
}

export interface QueueClient {
  enqueue(queue: string, payload: unknown): Promise<unknown>;
}

export class QueueTransport implements Transport {
  constructor(private readonly queue: QueueClient, private readonly queueName = "agent-sdk") {}

  async send<T = unknown>(request: TransportRequest): Promise<T> {
    return this.queue.enqueue(this.queueName, request) as Promise<T>;
  }
}

export type WebSocketLike = {
  send(data: string): void;
  addEventListener?(type: "message", listener: (event: { data: unknown }) => void): void;
  on?(type: "message", listener: (data: unknown) => void): void;
};

export type WebSocketConstructorLike = new (url: string) => WebSocketLike;

export type WebSocketTransportConfig = {
  url?: string;
  socket?: WebSocketLike;
  WebSocket?: WebSocketConstructorLike;
  timeoutMs?: number;
};

export interface StdioClient {
  send<T = unknown>(request: TransportRequest): Promise<T>;
}

function createWebSocket(url: string | undefined, WebSocketCtor?: WebSocketConstructorLike): WebSocketLike {
  const Ctor = WebSocketCtor ?? (globalThis as { WebSocket?: WebSocketConstructorLike }).WebSocket;
  if (!url || !Ctor) {
    throw new AgentSDKError({
      code: "TRANSPORT_CONFIG_ERROR",
      message: "[WebSocketTransport] provide either socket or url with WebSocket constructor",
    });
  }
  return new Ctor(url);
}

function bindWebSocketMessage(socket: WebSocketLike, listener: (message: unknown) => void): void {
  if (socket.addEventListener) {
    socket.addEventListener("message", (event) => listener(event.data));
    return;
  }
  socket.on?.("message", listener);
}

function parseMessage(message: unknown): unknown {
  const data = typeof message === "object" && message && "data" in message
    ? (message as { data: unknown }).data
    : message;
  if (typeof data === "string") return JSON.parse(data);
  return data;
}

function isResponseEnvelope(value: unknown): value is { id: string; body?: unknown; error?: unknown } {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

function createMessageId(): string {
  return `ws_${globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? Date.now().toString(36)}`;
}
