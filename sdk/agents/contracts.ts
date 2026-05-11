import type { Brain } from "../core/Brain.js";
import type { ModelMessage, ToolCall } from "../core/contracts.js";
import type { SessionMemory } from "../memory/contracts.js";
import type {
  McpCommandInput,
  McpCommandValidationOptions,
  McpConnectedServer,
  McpServerConfig,
  McpServerInfo,
} from "../mcp/McpServerConfig.js";
import type { PipelineContext } from "../pipelines/contracts.js";
import type { ToolConnector, ToolRegistry } from "../tools/contracts.js";
import type { Usage } from "../types.js";
import type { Agent } from "./Agent.js";

export type AgentConfig = {
  name: string;
  description?: string;
  instructions: string;
  model: string;
  provider?: string;
  tools?: string[];
  memory?: SessionMemory;
  metadata?: Record<string, unknown>;
};

export type AgentDeps = {
  brain: Brain;
  tools?: ToolRegistry;
  memory?: SessionMemory;
  mcp?: McpCommandValidationOptions;
};

export type AgentRunInput = {
  input: string;
  sessionId?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AgentRunOutput = {
  agentName: string;
  text: string;
  usage: Usage;
  toolCalls?: ToolCall[];
  raw?: unknown;
};

export type AgentMemoryState = {
  messages: ModelMessage[];
};

export type AgentToolInput = string | AgentRunInput;

export type AgentTool = ToolConnector<AgentToolInput, AgentRunOutput>;

export type AgentAddMcpCommandInput = McpCommandInput;

export type AgentAddMcpServerInput = McpServerConfig;

export type AgentMcpServerInfo = McpServerInfo;

export type AgentMcpConnectedServer = McpConnectedServer;

export type AgentTeamMode = "manager" | "sequential" | "parallel" | "handoff" | "planner-executor";

export type AgentTeamConfig = {
  name: string;
  mode: AgentTeamMode;
  manager?: Agent;
  agents: Agent[];
  brain: Brain;
  tools?: ToolRegistry;
  memory?: SessionMemory;
  metadata?: Record<string, unknown>;
};

export type AgentTeamRunInput = AgentRunInput;

export type AgentTeamRunOutput = {
  teamName: string;
  mode: AgentTeamMode;
  text: string;
  usage: Usage;
  results: AgentRunOutput[];
  raw?: unknown;
};

export type AgentRunContext = PipelineContext;
