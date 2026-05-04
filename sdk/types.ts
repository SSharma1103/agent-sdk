export type JsonObject = Record<string, unknown>;

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ExecutionMode = "sync" | "async" | "streaming";

export type RunStatus = "queued" | "running" | "success" | "error";

export type Logger = {
  debug?(message: string, meta?: JsonObject): void;
  info?(message: string, meta?: JsonObject): void;
  warn?(message: string, meta?: JsonObject): void;
  error?(message: string, meta?: JsonObject): void;
};

export const consoleLogger: Logger = {
  debug: (message, meta) => console.debug(message, meta ?? {}),
  info: (message, meta) => console.info(message, meta ?? {}),
  warn: (message, meta) => console.warn(message, meta ?? {}),
  error: (message, meta) => console.error(message, meta ?? {}),
};
