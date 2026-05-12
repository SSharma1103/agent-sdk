import type { Brain } from "../core/Brain.js";
import type { ModelMessage, ToolCall } from "../core/contracts.js";
import { ValidationError } from "../errors.js";
import type { SessionMemory } from "../memory/contracts.js";
import { McpServerConnection } from "../mcp/McpServerConnection.js";
import type { McpCommandValidationOptions } from "../mcp/McpServerConfig.js";
import { McpToolLoader } from "../mcp/McpToolLoader.js";
import { parseMcpCommand } from "../mcp/parseMcpCommand.js";
import { validateMcpCommand } from "../mcp/validateMcpCommand.js";
import type { PipelineContext } from "../pipelines/contracts.js";
import type { ToolConnector, ToolRegistry } from "../tools/contracts.js";
import type {
  AgentAddMcpCommandInput,
  AgentAddMcpServerInput,
  AgentMcpConnectedServer,
  AgentMcpServerInfo,
  AgentConfig,
  AgentDeps,
  AgentMemoryState,
  AgentRunInput,
  AgentRunOutput,
  AgentTool,
  AgentToolInput,
} from "./contracts.js";

export class Agent {
  readonly name: string;
  readonly description?: string;
  private readonly brain: Brain;
  private readonly tools?: ToolRegistry;
  private readonly memory?: SessionMemory;
  private readonly mcpValidation?: McpCommandValidationOptions;
  private readonly mcpServers = new Map<string, { connection: McpServerConnection; toolNames: string[] }>();
  private readonly mcpToolNames = new Set<string>();

  constructor(
    readonly config: AgentConfig,
    deps: AgentDeps,
  ) {
    this.name = config.name;
    this.description = config.description;
    this.brain = deps.brain;
    this.tools = deps.tools ?? deps.brain.tools;
    this.memory = config.memory ?? deps.memory;
    this.mcpValidation = deps.mcp;
  }

  async run(input: AgentRunInput | string, context?: PipelineContext): Promise<AgentRunOutput> {
    const runInput = normalizeRunInput(input);
    const metadata = {
      ...(this.config.metadata ?? {}),
      ...(context?.metadata ?? {}),
      ...(runInput.metadata ?? {}),
    };
    const memoryMessages = runInput.sessionId ? await this.readMemory(runInput.sessionId) : [];
    const toolCalls: ToolCall[] = [];
    const messages: ModelMessage[] = [
      { role: "system", content: this.config.instructions },
      ...memoryMessages,
      { role: "user", content: runInput.input },
    ];

    await emit(context, "agent.started", {
      agentName: this.name,
      input: runInput.input,
      sessionId: runInput.sessionId,
      metadata,
    });

    try {
      const result = await this.brain.run({
        provider: this.config.provider,
        model: this.config.model,
        messages,
        tools: this.config.tools,
        metadata: { ...metadata, agentName: this.name, agentContext: runInput.context },
        onToolCall: async (call) => {
          toolCalls.push(call);
          await emit(context, "agent.tool_call", { agentName: this.name, toolCall: call });
        },
      });

      const output: AgentRunOutput = {
        agentName: this.name,
        text: result.text,
        usage: result.usage,
        toolCalls: toolCalls.length ? toolCalls : result.toolCalls,
        raw: result.raw,
      };

      if (runInput.sessionId) {
        await this.writeMemory(runInput.sessionId, [
          ...memoryMessages,
          { role: "user", content: runInput.input },
          { role: "assistant", content: result.text },
        ]);
      }

      await emit(context, "agent.completed", output);
      return output;
    } catch (error) {
      await emit(context, "agent.failed", {
        agentName: this.name,
        error,
        sessionId: runInput.sessionId,
      });
      throw error;
    }
  }

  asTool(): AgentTool {
    return {
      type: "local",
      name: this.name,
      description: this.description ?? `Run the ${this.name} agent`,
      schema: {
        type: "object",
        properties: {
          input: { type: "string" },
          sessionId: { type: "string" },
          context: { type: "object" },
          metadata: { type: "object" },
        },
        required: ["input"],
      },
      call: (input: AgentToolInput) => this.run(input),
    };
  }

  async addMcpCommand(input: AgentAddMcpCommandInput): Promise<AgentMcpConnectedServer> {
    return this.addMcpServer(parseMcpCommand(input));
  }

  async addMcpServer(input: AgentAddMcpServerInput): Promise<AgentMcpConnectedServer> {
    if (!this.tools) {
      throw new ValidationError("[MCP] Agent requires deps.tools to attach MCP tools");
    }
    if (this.mcpServers.has(input.name)) {
      throw new ValidationError(`[MCP] server "${input.name}" is already connected`);
    }

    const config = validateMcpCommand(input, this.mcpValidation);
    const connection = new McpServerConnection(config);

    try {
      const serverInfo = await connection.start();
      const loaded = await new McpToolLoader(connection).load();
      for (const connector of loaded.connectors) this.assertToolCanBeRegistered(connector);
      for (const connector of loaded.connectors) {
        this.tools.register(connector);
        this.mcpToolNames.add(connector.name);
      }

      const toolNames = loaded.connectors.map((tool) => tool.name);
      this.attachToolNames(toolNames);
      this.mcpServers.set(config.name, { connection, toolNames });

      return {
        ...serverInfo,
        status: "connected",
        tools: loaded.definitions,
      };
    } catch (error) {
      await connection.stop();
      throw error;
    }
  }

  listTools(): ToolConnector[] {
    if (!this.tools) return [];
    return this.tools.resolveMany(this.config.tools);
  }

  listMcpServers(): AgentMcpServerInfo[] {
    return [...this.mcpServers.values()].map(({ connection }) => connection.info("connected"));
  }

  async removeMcpServer(name: string): Promise<boolean> {
    const server = this.mcpServers.get(name);
    if (!server) return false;

    for (const toolName of server.toolNames) {
      this.tools?.unregister(toolName);
      this.mcpToolNames.delete(toolName);
    }
    if (this.config.tools) {
      const removed = new Set(server.toolNames);
      this.config.tools = this.config.tools.filter((toolName) => !removed.has(toolName));
    }
    this.mcpServers.delete(name);
    await server.connection.stop();
    return true;
  }

  private async readMemory(sessionId: string): Promise<ModelMessage[]> {
    const state = await this.memory?.getSession<AgentMemoryState | ModelMessage[]>(this.memoryKey(sessionId));
    if (!state) return [];
    return Array.isArray(state) ? state : state.messages;
  }

  private async writeMemory(sessionId: string, messages: ModelMessage[]): Promise<void> {
    await this.memory?.setSession<AgentMemoryState>(this.memoryKey(sessionId), { messages });
  }

  private memoryKey(sessionId: string): string {
    return `agent:${this.name}:${sessionId}`;
  }

  private assertToolCanBeRegistered(connector: ToolConnector): void {
    const existing = this.tools?.get(connector.name);
    if (existing && !this.mcpToolNames.has(connector.name)) {
      throw new ValidationError(`[MCP] tool "${connector.name}" is already registered`);
    }
  }

  private attachToolNames(toolNames: string[]): void {
    if (!this.config.tools) return;
    const existing = new Set(this.config.tools);
    for (const toolName of toolNames) {
      if (!existing.has(toolName)) this.config.tools.push(toolName);
    }
  }
}

function normalizeRunInput(input: AgentRunInput | string): AgentRunInput {
  return typeof input === "string" ? { input } : input;
}

function emit(context: PipelineContext | undefined, type: string, payload?: unknown): Promise<void> | void {
  return context?.emit?.({ type, payload, runId: context.runId });
}
