import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ValidationError } from "../errors.js";
import type { McpServerConfig, McpServerInfo, McpToolCallResult, McpToolDefinition } from "./McpServerConfig.js";

type JsonRpcId = string | number;

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type InitializeResult = {
  protocolVersion?: string;
  serverInfo?: McpServerInfo["serverInfo"];
  capabilities?: Record<string, unknown>;
  instructions?: string;
};

type ListToolsResult = {
  tools?: McpToolDefinition[];
  nextCursor?: string;
};

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class McpServerConnection {
  private child?: ChildProcessWithoutNullStreams;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private nextRequestId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private tools: McpToolDefinition[] = [];
  private initializeResult?: InitializeResult;
  private stopped = false;

  constructor(readonly config: McpServerConfig) {
    if (config.transport !== "stdio") {
      throw new ValidationError("[MCP] only stdio transport is supported");
    }
  }

  async start(): Promise<McpServerInfo> {
    if (this.child) return this.info("connected");
    this.stopped = false;
    this.child = spawn(this.config.command, this.config.args ?? [], {
      cwd: this.config.cwd,
      env: { ...process.env, ...(this.config.env ?? {}) },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: string) => this.handleStderr(chunk));
    this.child.once("error", (error) => this.rejectAll(error));
    this.child.once("exit", (code, signal) => {
      if (!this.stopped) {
        this.rejectAll(
          new Error(`[MCP] server "${this.config.name}" exited with code ${code ?? "null"} signal ${signal ?? "null"}`),
        );
      }
    });

    this.initializeResult = await this.request<InitializeResult>(
      "initialize",
      {
        protocolVersion: this.config.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "agent-sdk",
          version: "0.1.0",
        },
      },
      this.config.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
    );
    this.notify("notifications/initialized");
    this.tools = await this.listTools();
    return this.info("connected");
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const tools: McpToolDefinition[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.request<ListToolsResult>("tools/list", cursor ? { cursor } : undefined);
      tools.push(...(result.tools ?? []));
      cursor = result.nextCursor;
    } while (cursor);

    this.tools = tools;
    return tools;
  }

  callTool(name: string, input: unknown): Promise<McpToolCallResult> {
    const argumentsValue =
      input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : { input };
    return this.request<McpToolCallResult>("tools/call", {
      name,
      arguments: argumentsValue,
    });
  }

  info(status: McpServerInfo["status"] = this.child ? "connected" : "disconnected"): McpServerInfo {
    return {
      name: this.config.name,
      status,
      transport: this.config.transport,
      command: this.config.command,
      args: this.config.args ?? [],
      tools: this.tools,
      serverInfo: this.initializeResult?.serverInfo,
      protocolVersion:
        this.initializeResult?.protocolVersion ?? this.config.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
    };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const child = this.child;
    this.child = undefined;
    this.rejectAll(new Error(`[MCP] server "${this.config.name}" stopped`));
    if (!child) return;

    child.stdin.end();
    if (!child.killed) child.kill();
  }

  private request<T>(
    method: string,
    params?: unknown,
    timeoutMs = this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    const child = this.child;
    if (!child || !child.stdin.writable) {
      return Promise.reject(new Error(`[MCP] server "${this.config.name}" is not running`));
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[MCP] request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });

      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  private notify(method: string, params?: unknown): void {
    const child = this.child;
    if (!child || !child.stdin.writable) return;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line) this.handleMessageLine(line);
      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleMessageLine(line: string): void {
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }

    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timeout);

    if (message.error) {
      pending.reject(new Error(`[MCP] ${message.error.message}`));
      return;
    }
    pending.resolve(message.result);
  }

  private handleStderr(chunk: string): void {
    this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(-8_192);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
