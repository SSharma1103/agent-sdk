export type AgentSDKErrorOptions = {
  code: string;
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class AgentSDKError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(options: AgentSDKErrorOptions) {
    super(options.message);
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class ValidationError extends AgentSDKError {
  constructor(message: string, details?: Record<string, unknown>, cause?: unknown) {
    super({ code: "VALIDATION_ERROR", message, details, cause });
  }
}

export class NotImplementedError extends AgentSDKError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ code: "NOT_IMPLEMENTED", message, details });
  }
}

export class ProviderNotFoundError extends AgentSDKError {
  constructor(provider: string) {
    super({
      code: "PROVIDER_NOT_FOUND",
      message: `[Brain] provider "${provider}" is not registered`,
      details: { provider },
    });
  }
}

export class ProviderCapabilityError extends AgentSDKError {
  constructor(provider: string, capability: string) {
    super({
      code: "PROVIDER_CAPABILITY_UNSUPPORTED",
      message: `[Brain] provider "${provider}" does not support ${capability}`,
      details: { provider, capability },
    });
  }
}

export class ProviderRequestError extends AgentSDKError {
  constructor(provider: string, status: number, body: string) {
    super({
      code: "PROVIDER_REQUEST_FAILED",
      message: `[${provider}] request failed with ${status}: ${body}`,
      details: { provider, status, body },
    });
  }
}

export class PipelineNotFoundError extends AgentSDKError {
  constructor(pipelineName: string) {
    super({
      code: "PIPELINE_NOT_FOUND",
      message: `[Orchestrator] pipeline "${pipelineName}" is not registered`,
      details: { pipelineName },
    });
  }
}

export class ToolNotFoundError extends AgentSDKError {
  constructor(toolName: string) {
    super({
      code: "TOOL_NOT_FOUND",
      message: `[ToolRegistry] tool "${toolName}" is not registered`,
      details: { toolName },
    });
  }
}

export class ToolExecutionError extends AgentSDKError {
  constructor(toolName: string, cause: unknown) {
    super({
      code: "TOOL_EXECUTION_FAILED",
      message: `[Brain] tool "${toolName}" failed`,
      details: { toolName },
      cause,
    });
  }
}
