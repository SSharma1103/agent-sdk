import { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createSession,
  getSession,
  listSessions,
  listTargets,
  patchSessionState,
  runTargetStreaming,
  type DevUiEvent,
  type DevUiRunResponse,
  type DevUiSession,
  type DevUiTarget,
} from "./api";
import { AgentPicker } from "./components/AgentPicker";
import { ChatPanel } from "./components/ChatPanel";
import { EventTimeline } from "./components/EventTimeline";
import { RunDetails } from "./components/RunDetails";
import { StateInspector } from "./components/StateInspector";
import "./styles.css";

type RightTab = "events" | "state" | "run";

function App() {
  const [targets, setTargets] = useState<DevUiTarget[]>([]);
  const [sessions, setSessions] = useState<DevUiSession[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<DevUiTarget | null>(null);
  const [selectedSession, setSelectedSession] = useState<DevUiSession | null>(null);
  const [events, setEvents] = useState<DevUiEvent[]>([]);
  const [lastRun, setLastRun] = useState<DevUiRunResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [tab, setTab] = useState<RightTab>("events");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap().catch((bootstrapError: unknown) => {
      setError(bootstrapError instanceof Error ? bootstrapError.message : "Failed to load dev UI");
      setStatus("error");
    });
  }, []);

  const selectedLabel = useMemo(() => {
    if (!selectedTarget) return "No target";
    return `${selectedTarget.type}:${selectedTarget.name}`;
  }, [selectedTarget]);

  async function bootstrap() {
    const [targetList, sessionList] = await Promise.all([listTargets(), listSessions()]);
    const firstSession = sessionList[0] ?? await createSession("Local debug session");
    setTargets(targetList);
    setSessions(sessionList[0] ? sessionList : [firstSession]);
    setSelectedTarget(targetList[0] ?? null);
    setSelectedSession(firstSession);
  }

  async function refreshSession(sessionId = selectedSession?.id) {
    if (!sessionId) return;
    const session = await getSession(sessionId);
    setSelectedSession(session);
    setSessions(await listSessions());
  }

  async function handleNewSession() {
    const session = await createSession("Local debug session");
    setSessions([session, ...sessions]);
    setSelectedSession(session);
    setEvents([]);
    setLastRun(null);
  }

  async function handleSend(input: string) {
    if (!selectedTarget || !selectedSession) return;
    setStatus("running");
    setError(null);
    setEvents([]);

    await runTargetStreaming({
      targetType: selectedTarget.type,
      targetName: selectedTarget.name,
      sessionId: selectedSession.id,
      input,
    }, {
      onEvent(event) {
        setEvents((items) => [...items, event]);
      },
      onDone(result) {
        setLastRun(result);
        setEvents(result.events);
        setStatus("idle");
        refreshSession(selectedSession.id).catch(() => undefined);
      },
      onError(runError) {
        setError(runError.message);
        setStatus("error");
      },
    });
  }

  async function handleStateSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSession) return;
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("state") ?? "{}");
    const state = JSON.parse(raw) as Record<string, unknown>;
    const session = await patchSessionState(selectedSession.id, state);
    setSelectedSession(session);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>Agent SDK</span>
          <strong>Dev UI</strong>
        </div>
        <AgentPicker
          targets={targets}
          selected={selectedTarget}
          onSelect={setSelectedTarget}
        />
        <section className="sessions">
          <div className="sectionHeader">
            <h2>Sessions</h2>
            <button type="button" onClick={handleNewSession}>New</button>
          </div>
          <div className="sessionList">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={session.id === selectedSession?.id ? "selected" : ""}
                onClick={() => {
                  setSelectedSession(session);
                  setEvents([]);
                  setLastRun(null);
                }}
              >
                <span>{session.title}</span>
                <small>{session.id}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{selectedLabel}</span>
            <h1>{selectedTarget?.name ?? "Select an agent"}</h1>
          </div>
          <div className={`status ${status}`}>{status}</div>
        </header>
        {error ? <div className="error">{error}</div> : null}
        <ChatPanel
          messages={selectedSession?.messages ?? []}
          disabled={status === "running" || !selectedTarget || !selectedSession}
          onSend={handleSend}
        />
      </section>

      <aside className="inspector">
        <div className="tabs">
          <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>Events</button>
          <button className={tab === "state" ? "active" : ""} onClick={() => setTab("state")}>State</button>
          <button className={tab === "run" ? "active" : ""} onClick={() => setTab("run")}>Run</button>
        </div>
        {tab === "events" ? <EventTimeline events={events} /> : null}
        {tab === "state" && selectedSession ? (
          <StateInspector session={selectedSession} onSubmit={handleStateSave} />
        ) : null}
        {tab === "run" ? <RunDetails run={lastRun} /> : null}
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
