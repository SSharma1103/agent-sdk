import type { McpServerConnection } from "../../mcp/McpServerConnection.js";
import type { McpToolCallResult, McpToolDefinition } from "../../mcp/McpServerConfig.js";
import type { ToolConnector } from "../../tools/contracts.js";

export class McpToolConnector<TInput = unknown> implements ToolConnector<TInput, McpToolCallResult> {
  readonly type = "stdio" as const;
  readonly name: string;
  readonly description?: string;
  readonly schema: unknown;
  readonly inputSchema: unknown;

  constructor(
    readonly serverName: string,
    private readonly connection: McpServerConnection,
    readonly tool: McpToolDefinition,
  ) {
    this.name = tool.name;
    this.description = tool.description;
    this.schema = tool.inputSchema;
    this.inputSchema = tool.inputSchema;
  }

  call(input: TInput): Promise<McpToolCallResult> {
    return this.connection.callTool(this.tool.name, input);
  }
}
