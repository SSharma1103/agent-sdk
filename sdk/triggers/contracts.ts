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
  private handler?: (event: TriggerEvent<T>) => Promise<void>;

  constructor(readonly name: string) {}

  async start(handler: (event: TriggerEvent<T>) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async handle(request: { body?: T; headers?: Record<string, string> }): Promise<void> {
    if (!this.handler) throw new Error(`[WebhookTrigger] trigger "${this.name}" has not started`);
    await this.handler({
      type: "webhook",
      name: this.name,
      payload: request.body as T,
      headers: request.headers,
    });
  }
}

export class CronTrigger<T = unknown> implements Trigger<T> {
  readonly type = "cron" as const;
  private stopHandle?: () => Promise<void> | void;
  private handler?: (event: TriggerEvent<T>) => Promise<void>;

  constructor(
    readonly name: string,
    readonly schedule: string,
    private readonly config: {
      scheduler?: CronScheduler<T>;
      intervalMs?: number;
      payload?: T;
    } = {},
  ) {}

  async start(handler: (event: TriggerEvent<T>) => Promise<void>): Promise<void> {
    this.handler = handler;
    if (this.config.scheduler) {
      this.stopHandle = await this.config.scheduler.schedule(this.name, this.schedule, handler);
      return;
    }

    if (this.config.intervalMs) {
      const timer = setInterval(() => {
        void this.fire(this.config.payload as T, handler);
      }, this.config.intervalMs);
      this.stopHandle = () => clearInterval(timer);
    }
  }

  async fire(payload?: T, handler?: (event: TriggerEvent<T>) => Promise<void>): Promise<void> {
    const target = handler ?? this.handler;
    if (!target) {
      throw new Error(`[CronTrigger] trigger "${this.name}" has not started`);
    }
    await target({
      type: "cron",
      name: this.name,
      payload: payload as T,
    });
  }

  async stop(): Promise<void> {
    await this.stopHandle?.();
    this.stopHandle = undefined;
  }
}

export interface CronScheduler<T = unknown> {
  schedule(
    name: string,
    schedule: string,
    handler: (event: TriggerEvent<T>) => Promise<void>,
  ): Promise<(() => Promise<void> | void) | undefined> | (() => Promise<void> | void) | undefined;
}
