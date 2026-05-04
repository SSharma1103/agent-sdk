import { ToolNotFoundError } from "../errors.js";

export type ToolRuntime = "stdio" | "http" | "grpc" | "local";

export type ToolDefinition = {
  name: string;
  description?: string;
  schema?: unknown;
};

export interface ToolConnector<TInput = unknown, TOutput = unknown> extends ToolDefinition {
  type: ToolRuntime;
  call(input: TInput): Promise<TOutput>;
}

export class ToolRegistry {
  private readonly connectors = new Map<string, ToolConnector>();

  register(connector: ToolConnector): void {
    this.connectors.set(connector.name, connector);
  }

  get(name: string): ToolConnector | undefined {
    return this.connectors.get(name);
  }

  list(): ToolConnector[] {
    return [...this.connectors.values()];
  }

  resolveMany(tools?: ToolDefinition[] | string[]): ToolConnector[] {
    if (!tools) return this.list();
    return tools.flatMap((tool) => {
      if (typeof tool === "string") {
        const connector = this.get(tool);
        return connector ? [connector] : [];
      }
      const connector = this.get(tool.name);
      return connector ? [connector] : [{ ...tool, type: "local", call: async () => undefined }];
    });
  }

  async call(name: string, input: unknown): Promise<unknown> {
    const connector = this.connectors.get(name);
    if (!connector) throw new ToolNotFoundError(name);
    return connector.call(input);
  }
}
