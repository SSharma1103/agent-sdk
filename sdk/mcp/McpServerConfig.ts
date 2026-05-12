import type { ToolConnector } from "../tools/contracts.js";

export type McpTransport = "stdio";
export type McpServerStatus = "connecting" | "connected" | "disconnected" | "error";

export type McpEnv = Record<string, string>;

export type McpCommandInput = {
  name: string;
  command: string;
  env?: McpEnv;
};

export type McpServerConfig = {
  name: string;
  transport: McpTransport;
  command: string;
  args?: string[];
  env?: McpEnv;
  cwd?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  protocolVersion?: string;
};

export type McpCommandValidationOptions = {
  allowedCommands?: readonly string[];
  allowedNpxPackages?: readonly string[];
  isNpxPackageAllowed?: (packageName: string, packageSpec: string) => boolean;
};

export type McpToolDefinition = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
};

export type McpToolCallResult = {
  content?: unknown[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
};

export type McpServerInfo = {
  name: string;
  status: McpServerStatus;
  transport: McpTransport;
  command: string;
  args: string[];
  tools: McpToolDefinition[];
  serverInfo?: {
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
  protocolVersion?: string;
};

export type McpConnectedServer = McpServerInfo & {
  status: "connected";
};

export type McpLoadedTools = {
  definitions: McpToolDefinition[];
  connectors: ToolConnector[];
};
