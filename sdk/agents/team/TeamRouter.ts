import type { Brain } from "../../core/Brain.js";
import type { PipelineContext } from "../../pipelines/contracts.js";
import type { Agent } from "../Agent.js";
import type { RouterDecision } from "./contracts.js";
import type { TeamState } from "./TeamState.js";

const ROUTER_DECISION_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        action: { const: "call_agent" },
        agent: { type: "string" },
        input: { type: "string" },
        reason: { type: "string" },
      },
      required: ["action", "agent", "input"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        action: { const: "finish" },
        answer: { type: "string" },
        reason: { type: "string" },
      },
      required: ["action", "answer"],
      additionalProperties: false,
    },
  ],
};

export class TeamRouter {
  constructor(
    private readonly manager: Agent,
    private readonly agents: Agent[],
    private readonly brain?: Brain,
  ) {}

  async decide(state: TeamState, context?: PipelineContext): Promise<RouterDecision> {
    const prompt = this.buildPrompt(state);

    try {
      return await this.decideWithObject(prompt, context);
    } catch {
      return this.decideWithJsonPrompt(prompt, state, context);
    }
  }

  private async decideWithObject(prompt: string, context?: PipelineContext): Promise<RouterDecision> {
    if (!this.brain?.runObject) throw new Error("[TeamRouter] structured output is not available");

    const output = await this.brain.runObject<unknown>({
      provider: this.manager.config.provider,
      model: this.manager.config.model,
      system: this.manager.config.instructions,
      prompt,
      schema: ROUTER_DECISION_SCHEMA,
      metadata: {
        ...(context?.metadata ?? {}),
        agentName: this.manager.name,
        teamRole: "router-manager",
      },
    });

    return assertRouterDecision(output.object);
  }

  private async decideWithJsonPrompt(
    prompt: string,
    state: TeamState,
    context?: PipelineContext,
  ): Promise<RouterDecision> {
    const first = await this.manager.run({ input: prompt, context: { teamRole: "router-manager" } }, context);
    const parsed = parseRouterDecision(first.text);
    if (parsed) return parsed;

    const correction = [
      "Your previous response was not valid router decision JSON.",
      "Return one valid JSON object only. Do not include markdown, prose, or code fences.",
      "Use exactly one of the documented shapes.",
      "",
      "Previous invalid response:",
      first.text,
      "",
      prompt,
    ].join("\n");

    try {
      const retry = await this.manager.run({ input: correction, context: { teamRole: "router-manager" } }, context);
      return parseRouterDecision(retry.text) ?? this.fallbackDecision(state);
    } catch {
      return this.fallbackDecision(state);
    }
  }

  private buildPrompt(state: TeamState): string {
    return [
      "You are the manager of an agent team.",
      "",
      "Original user request:",
      state.originalInput,
      "",
      "Available agents:",
      this.formatAgentList(),
      "",
      "Previous results:",
      state.summarizeResults(),
      "",
      "Messages:",
      formatMessages(state),
      "",
      "Choose exactly one action:",
      "1. call_agent",
      "2. finish",
      "",
      "Rules:",
      "- Call only one agent at a time.",
      "- Use call_agent when more work is needed.",
      "- Use finish only when the final answer is ready.",
      "- Do not repeat the same agent unnecessarily.",
      "- Avoid loops.",
      "- Return valid JSON only.",
      "",
      "JSON shape for calling an agent:",
      "{",
      '  "action": "call_agent",',
      '  "agent": "agent_name",',
      '  "input": "specific task for that agent",',
      '  "reason": "why this agent is needed"',
      "}",
      "",
      "JSON shape for finishing:",
      "{",
      '  "action": "finish",',
      '  "answer": "final answer to user",',
      '  "reason": "why the team is done"',
      "}",
    ].join("\n");
  }

  private formatAgentList(): string {
    if (!this.agents.length) return "No specialist agents are available.";
    return this.agents.map((agent) => `- ${agent.name}: ${agent.description ?? "No description provided."}`).join("\n");
  }

  private fallbackDecision(state: TeamState): RouterDecision {
    return {
      action: "finish",
      answer: buildFallbackAnswer(state),
      reason: "The manager did not return a valid JSON router decision.",
    };
  }
}

function formatMessages(state: TeamState): string {
  if (!state.messages.length) return "No team messages yet.";
  return state.messages
    .map((message) => `[${message.channel}] ${message.from} -> ${message.to}: ${message.content}`)
    .join("\n");
}

function parseRouterDecision(text: string): RouterDecision | undefined {
  const jsonText = extractJson(text);
  if (!jsonText) return undefined;

  try {
    return assertRouterDecision(JSON.parse(jsonText));
  } catch {
    return undefined;
  }
}

function extractJson(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return undefined;
  return trimmed.slice(start, end + 1);
}

function assertRouterDecision(value: unknown): RouterDecision {
  if (!value || typeof value !== "object") throw new Error("[TeamRouter] decision must be an object");
  const decision = value as Record<string, unknown>;

  if (decision.action === "call_agent") {
    if (typeof decision.agent !== "string" || !decision.agent.trim()) {
      throw new Error("[TeamRouter] call_agent decisions require agent");
    }
    if (typeof decision.input !== "string" || !decision.input.trim()) {
      throw new Error("[TeamRouter] call_agent decisions require input");
    }
    return {
      action: "call_agent",
      agent: decision.agent,
      input: decision.input,
      ...(typeof decision.reason === "string" ? { reason: decision.reason } : {}),
    };
  }

  if (decision.action === "finish") {
    if (typeof decision.answer !== "string") {
      throw new Error("[TeamRouter] finish decisions require answer");
    }
    return {
      action: "finish",
      answer: decision.answer,
      ...(typeof decision.reason === "string" ? { reason: decision.reason } : {}),
    };
  }

  throw new Error("[TeamRouter] decision action must be call_agent or finish");
}

function buildFallbackAnswer(state: TeamState): string {
  if (state.finalAnswer) return state.finalAnswer;
  if (!state.results.length) {
    return "I could not complete the team routing loop because the manager did not return a valid decision.";
  }
  return [
    "I could not complete the team routing loop, but these results were gathered:",
    state.summarizeResults(),
  ].join("\n\n");
}
