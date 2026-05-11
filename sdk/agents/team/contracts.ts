import type { Brain } from "../../core/Brain.js";
import type { SessionMemory } from "../../memory/contracts.js";
import type { ToolRegistry } from "../../tools/contracts.js";
import type { Agent } from "../Agent.js";
import type { AgentRunOutput } from "../contracts.js";

export type RouterDecision =
  | {
      action: "call_agent";
      agent: string;
      input: string;
      reason?: string;
    }
  | {
      action: "finish";
      answer: string;
      reason?: string;
    };

export type TeamRuntimeConfig = {
  name: string;
  manager: Agent;
  agents: Agent[];
  brain: Brain;
  tools?: ToolRegistry;
  memory?: SessionMemory;
  maxSteps?: number;
  maxCallsPerAgent?: number;
  metadata?: Record<string, unknown>;
};

export type TeamMessage = {
  id: string;
  from: string;
  to: string | "broadcast";
  channel: "tasks" | "findings" | "review" | "final" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type TeamStep = {
  step: number;
  decision: RouterDecision;
  result?: AgentRunOutput;
};
