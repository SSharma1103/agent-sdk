import type { DevUiEvent } from "../api";

export function EventTimeline({ events }: { events: DevUiEvent[] }) {
  return (
    <div className="timeline">
      {events.length ? events.map((event) => (
        <article key={event.id} className="eventItem">
          <header>
            <strong>{event.type}</strong>
            <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
          </header>
          <pre>{JSON.stringify(event.payload ?? {}, null, 2)}</pre>
        </article>
      )) : <div className="empty">No events yet.</div>}
    </div>
  );
}
