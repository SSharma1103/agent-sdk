export type DevUiTarget = {
  type: "agent" | "team";
  name: string;
  description?: string;
  mode?: string;
  model?: string;
  provider?: string;
  tools?: string[];
};

export type DevUiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  targetName?: string;
  timestamp: string;
};

export type DevUiSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  state: Record<string, unknown>;
  messages: DevUiMessage[];
};

export type DevUiEvent = {
  id: string;
  runId: string;
  type: string;
  timestamp: string;
  agentName?: string;
  teamName?: string;
  payload?: unknown;
};

export type DevUiRunRequest = {
  targetType: "agent" | "team";
  targetName: string;
  sessionId: string;
  input: string;
  metadata?: Record<string, unknown>;
};

export type DevUiRunResponse = {
  runId: string;
  output: {
    text: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    toolCalls?: unknown[];
    results?: unknown[];
    raw?: unknown;
    [key: string]: unknown;
  };
  events: DevUiEvent[];
};

export async function listTargets(): Promise<DevUiTarget[]> {
  const data = await request<{ targets: DevUiTarget[] }>("/api/agents");
  return data.targets;
}

export async function listSessions(): Promise<DevUiSession[]> {
  const data = await request<{ sessions: DevUiSession[] }>("/api/sessions");
  return data.sessions;
}

export async function createSession(title?: string): Promise<DevUiSession> {
  const data = await request<{ session: DevUiSession }>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return data.session;
}

export async function getSession(sessionId: string): Promise<DevUiSession> {
  const data = await request<{ session: DevUiSession }>(`/api/sessions/${sessionId}`);
  return data.session;
}

export async function patchSessionState(sessionId: string, state: Record<string, unknown>): Promise<DevUiSession> {
  const data = await request<{ session: DevUiSession }>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
  return data.session;
}

export async function runTargetStreaming(
  input: DevUiRunRequest,
  handlers: {
    onEvent(event: DevUiEvent): void;
    onDone(result: DevUiRunResponse): void;
    onError(error: Error): void;
  },
): Promise<void> {
  const response = await fetch("/api/run-sse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, streaming: true }),
  });
  if (!response.ok || !response.body) throw new Error(`Run failed with HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) parseSseFrame(frame, handlers);
  }
  if (buffer.trim()) parseSseFrame(buffer, handlers);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? `Request failed with HTTP ${response.status}`);
  return data as T;
}

function parseSseFrame(
  frame: string,
  handlers: {
    onEvent(event: DevUiEvent): void;
    onDone(result: DevUiRunResponse): void;
    onError(error: Error): void;
  },
): void {
  const event = frame.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
  const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
  if (!event || !dataLine) return;
  const data = JSON.parse(dataLine.slice(6));
  if (event === "event") handlers.onEvent(data as DevUiEvent);
  if (event === "done") handlers.onDone(data as DevUiRunResponse);
  if (event === "error") handlers.onError(new Error(data.message ?? "Run failed"));
}
