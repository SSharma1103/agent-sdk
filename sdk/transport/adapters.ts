import type { Transport, TransportRequest, TransportResponse } from "./contracts.js";

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
  async send<T = unknown>(_request: TransportRequest): Promise<T> {
    throw new Error("[WebSocketTransport] provide a runtime-specific WebSocket adapter");
  }
}

export class StdioTransport implements Transport {
  async send<T = unknown>(_request: TransportRequest): Promise<T> {
    throw new Error("[StdioTransport] provide a runtime-specific stdio adapter");
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
