import { McpToolConnector } from "../connectors/mcp/McpToolConnector.js";
import type { McpServerConnection } from "./McpServerConnection.js";
import type { McpLoadedTools, McpToolDefinition } from "./McpServerConfig.js";

export class McpToolLoader {
  constructor(private readonly connection: McpServerConnection) {}

  async load(): Promise<McpLoadedTools> {
    const definitions = await this.connection.listTools();
    return {
      definitions,
      connectors: definitions.map((tool) => this.toConnector(tool)),
    };
  }

  toConnector(tool: McpToolDefinition): McpToolConnector {
    return new McpToolConnector(this.connection.config.name, this.connection, tool);
  }
}
