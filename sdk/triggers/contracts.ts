export type TriggerEvent<T = unknown> = {
  type: "webhook" | "cron" | "event";
  name: string;
  payload: T;
  headers?: Record<string, string>;
};

export interface Trigger<T = unknown> {
  name: string;
  type: TriggerEvent["type"];
  start(handler: (event: TriggerEvent<T>) => Promise<void>): Promise<void>;
  stop?(): Promise<void>;
}

export class InternalEventTrigger<T = unknown> implements Trigger<T> {
  readonly type = "event" as const;
  private handler?: (event: TriggerEvent<T>) => Promise<void>;

  constructor(readonly name: string) {}

  async start(handler: (event: TriggerEvent<T>) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async emit(payload: T): Promise<void> {
    if (!this.handler) throw new Error(`[InternalEventTrigger] trigger "${this.name}" has not started`);
    await this.handler({ type: "event", name: this.name, payload });
  }
}

export class WebhookTrigger<T = unknown> implements Trigger<T> {
  readonly type = "webhook" as const;
  constructor(readonly name: string) {}
  async start(_handler: (event: TriggerEvent<T>) => Promise<void>): Promise<void> {
    // Framework adapters bind HTTP requests to this handler.
  }
}

export class CronTrigger<T = unknown> implements Trigger<T> {
  readonly type = "cron" as const;
  constructor(readonly name: string, readonly schedule: string) {}
  async start(_handler: (event: TriggerEvent<T>) => Promise<void>): Promise<void> {
    // Runtime adapters provide cron scheduling.
  }
}
