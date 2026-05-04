import type { ToolConnector, ToolRuntime } from "./contracts.js";
import type { Transport } from "../transport/contracts.js";

export class LocalToolConnector<TInput = unknown, TOutput = unknown> implements ToolConnector<TInput, TOutput> {
  readonly type = "local" as const;

  constructor(
    readonly name: string,
    private readonly handler: (input: TInput) => Promise<TOutput> | TOutput,
    readonly description?: string,
    readonly schema?: unknown,
  ) {}

  async call(input: TInput): Promise<TOutput> {
    return this.handler(input);
  }
}

export class TransportToolConnector<TInput = unknown, TOutput = unknown> implements ToolConnector<TInput, TOutput> {
  constructor(
    readonly type: Exclude<ToolRuntime, "local">,
    readonly name: string,
    private readonly transport: Transport,
    readonly description?: string,
    readonly schema?: unknown,
  ) {}

  async call(input: TInput): Promise<TOutput> {
    return this.transport.send({ route: this.name, body: input }) as Promise<TOutput>;
  }
}
