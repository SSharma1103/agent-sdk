import type { AgentSDK } from "../../../sdk/AgentSDK.js";
import type { Agent } from "../../../sdk/agents/Agent.js";
import type { AgentTeam } from "../../../sdk/agents/AgentTeam.js";
import type { AgentTeamMode } from "../../../sdk/agents/contracts.js";
import type { SessionMemory } from "../../../sdk/memory/contracts.js";
import { createId } from "../../../sdk/utils/id.js";

export type DevUiTargetType = "agent" | "team";

export type DevUiTarget = {
  type: DevUiTargetType;
  name: string;
  description?: string;
  mode?: AgentTeamMode;
  model?: string;
  provider?: string;
  tools?: string[];
};

export type DevUiSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  state: Record<string, unknown>;
  messages: DevUiMessage[];
};

export type DevUiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  targetName?: string;
  timestamp: string;
};

export type DevUiRegistryConfig = {
  sdk: AgentSDK;
  agents?: Agent[];
  teams?: AgentTeam[];
  memory?: SessionMemory;
};

export class DevUiRegistry {
  private readonly agents = new Map<string, Agent>();
  private readonly teams = new Map<string, AgentTeam>();
  private readonly sessions = new Map<string, DevUiSession>();

  constructor(readonly config: DevUiRegistryConfig) {
    for (const agent of config.agents ?? []) this.agents.set(agent.name, agent);
    for (const team of config.teams ?? []) this.teams.set(team.name, team);
  }

  listTargets(): DevUiTarget[] {
    return [
      ...[...this.agents.values()].map((agent) => ({
        type: "agent" as const,
        name: agent.name,
        description: agent.description,
        model: agent.config.model,
        provider: agent.config.provider,
        tools: agent.config.tools,
      })),
      ...[...this.teams.values()].map((team) => ({
        type: "team" as const,
        name: team.name,
        mode: team.config.mode,
        description: `${team.config.mode} team`,
      })),
    ];
  }

  getTarget(type: DevUiTargetType, name: string): Agent | AgentTeam | undefined {
    return type === "agent" ? this.agents.get(name) : this.teams.get(name);
  }

  listSessions(): DevUiSession[] {
    return [...this.sessions.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createSession(title = "Untitled session", state: Record<string, unknown> = {}): DevUiSession {
    const now = new Date().toISOString();
    const session: DevUiSession = {
      id: createId("session"),
      title,
      createdAt: now,
      updatedAt: now,
      state,
      messages: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): DevUiSession | undefined {
    return this.sessions.get(id);
  }

  ensureSession(id?: string): DevUiSession {
    if (id) {
      const existing = this.sessions.get(id);
      if (existing) return existing;
    }
    return this.createSession();
  }

  updateSessionState(id: string, state: Record<string, unknown>): DevUiSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    session.state = { ...session.state, ...state };
    session.updatedAt = new Date().toISOString();
    return session;
  }

  appendMessage(sessionId: string, message: Omit<DevUiMessage, "id" | "timestamp">): DevUiMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const item: DevUiMessage = {
      id: createId("msg"),
      timestamp: new Date().toISOString(),
      ...message,
    };
    session.messages.push(item);
    session.updatedAt = item.timestamp;
    return item;
  }
}
