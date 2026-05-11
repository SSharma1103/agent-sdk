# Dev UI

The dev UI is an ADK-style local debugging cockpit for agents and teams. It is intended for development, demos, and manual inspection.

## Run

```sh
npm run dev:web
```

Open:

```txt
http://127.0.0.1:8787
```

## Features

- Agent/team selector.
- Session list and session creation.
- Chat-style agent runs.
- Server-sent event stream.
- Event timeline.
- Session state inspector.
- Run details with usage and raw output.

## API

The dev server exposes:

- `GET /api/agents`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `PATCH /api/sessions/:sessionId`
- `POST /api/run`
- `POST /api/run-sse`

## Production Note

The dev UI has no authentication or production hardening. Do not expose it publicly without wrapping it in your own auth, hosting, and data-retention controls.
