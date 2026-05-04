export type TransportRequest = {
  route?: string;
  headers?: Record<string, string>;
  body?: unknown;
  metadata?: Record<string, unknown>;
};

export type TransportResponse<T = unknown> = {
  status?: number;
  body: T;
  headers?: Record<string, string>;
};

export interface Transport {
  send<T = unknown>(request: TransportRequest): Promise<TransportResponse<T> | T>;
}
