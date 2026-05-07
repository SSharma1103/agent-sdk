import type { Brain } from "../core/Brain.js";
import type { ModelMessage, ToolCall } from "../core/contracts.js";
import type { SessionMemory } from "../memory/contracts.js";
import type { PipelineContext } from "../pipelines/contracts.js";
import type { AgentConfig, AgentDeps, AgentMemoryState, AgentRunInput, AgentRunOutput, AgentTool, AgentToolInput } from "./contracts.js";

export class Agent {
  readonly name: string;
  readonly description?: string;
  private readonly brain: Brain;
  private readonly memory?: SessionMemory;

  constructor(readonly config: AgentConfig, deps: AgentDeps) {
    this.name = config.name;
    this.description = config.description;
    this.brain = deps.brain;
    this.memory = config.memory ?? deps.memory;
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
}

function normalizeRunInput(input: AgentRunInput | string): AgentRunInput {
  return typeof input === "string" ? { input } : input;
}

function emit(context: PipelineContext | undefined, type: string, payload?: unknown): Promise<void> | void {
  return context?.emit?.({ type, payload, runId: context.runId });
}
