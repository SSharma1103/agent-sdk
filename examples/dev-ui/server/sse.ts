import type { ServerResponse } from "node:http";

export type SseWriter = {
  send(event: string, data: unknown): void;
  close(): void;
};

export function createSseWriter(response: ServerResponse): SseWriter {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(": connected\n\n");

  return {
    send(event, data) {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      response.end();
    },
  };
}
