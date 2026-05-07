import { FormEvent, useState } from "react";
import type { DevUiMessage } from "../api";

export function ChatPanel({
  messages,
  disabled,
  onSend,
}: {
  messages: DevUiMessage[];
  disabled?: boolean;
  onSend(input: string): Promise<void>;
}) {
  const [input, setInput] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setInput("");
    await onSend(value);
  }

  return (
    <div className="chat">
      <div className="messages">
        {messages.length ? messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            <header>
              <span>{message.role}</span>
              <time>{new Date(message.timestamp).toLocaleTimeString()}</time>
            </header>
            <p>{message.content}</p>
          </article>
        )) : <div className="empty">Start a run to inspect messages and events.</div>}
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={disabled}
          placeholder="Send a task to the selected agent or team"
        />
        <button type="submit" disabled={disabled || !input.trim()}>Run</button>
      </form>
    </div>
  );
}
