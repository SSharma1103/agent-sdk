import type { AgentRunOutput } from "../contracts.js";
import type { RouterDecision, TeamMessage, TeamStep } from "./contracts.js";

export class TeamState {
  readonly messages: TeamMessage[] = [];
  readonly results: AgentRunOutput[] = [];
  readonly steps: TeamStep[] = [];
  readonly callCountsByAgent: Record<string, number> = {};
  finalAnswer?: string;

  constructor(readonly originalInput: string) {}

  addMessage(message: TeamMessage): void {
    this.messages.push(message);
  }

  addStep(decision: RouterDecision): TeamStep {
    const step: TeamStep = {
      step: this.steps.length + 1,
      decision,
    };
    this.steps.push(step);
    return step;
  }

  attachResult(step: TeamStep, result: AgentRunOutput): void {
    step.result = result;
    this.results.push(result);
  }

  incrementCallCount(agentName: string): number {
    const next = this.getCallCount(agentName) + 1;
    this.callCountsByAgent[agentName] = next;
    return next;
  }

  getCallCount(agentName: string): number {
    return this.callCountsByAgent[agentName] ?? 0;
  }

  setFinalAnswer(answer: string): void {
    this.finalAnswer = answer;
  }

  summarizeResults(): string {
    if (!this.results.length) return "No agent results are available yet.";
    return this.results.map((result) => `${result.agentName}: ${result.text}`).join("\n\n");
  }
}
