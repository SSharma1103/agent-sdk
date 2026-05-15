import {
  AgentSDK,
  Brain,
  DeclarativePipeline,
  InMemorySessionStore,
  LocalToolConnector,
  MemoryStore,
  OpenAIProvider,
  ToolRegistry,
} from "../sdk/index.js";

declare const process: { env: { OPENAI_API_KEY?: string } };

type OnboardingField = { id: string; question: string };

type OnboardingInput =
  | {
      operation: "createSession";
      pipelineId: string;
      fields: OnboardingField[];
      context?: string;
    }
  | { operation: "answer"; sessionId: string; fieldId: string; value: unknown };

type OnboardingSession = {
  pipelineId: string;
  fields: OnboardingField[];
  answers: Record<string, unknown>;
  currentFieldId: string | null;
  status: "active" | "completed";
  context?: string;
};

const storage = new MemoryStore();
const memory = new InMemorySessionStore();
const tools = new ToolRegistry();

async function readState(sessionId: string) {
  const session = await memory.getSession<OnboardingSession>(sessionId);
  if (!session) throw new Error("[onboarding-api] session not found");
  const field = session.fields.find((item) => item.id === session.currentFieldId) ?? null;
  return {
    session_id: sessionId,
    status: session.status,
    field,
    answers: session.answers,
    ...(session.status === "completed" ? { data: session.answers } : {}),
  };
}

tools.register(
  new LocalToolConnector<OnboardingInput, { sessionId: string } | { sessionId: string; state: unknown }>(
    "write_onboarding_state",
    async (input) => {
      if (input.operation === "createSession") {
        const sessionId = `onb_${globalThis.crypto?.randomUUID?.().replaceAll("-", "") ?? Date.now().toString(36)}`;
        await memory.setSession<OnboardingSession>(sessionId, {
          pipelineId: input.pipelineId,
          fields: input.fields,
          answers: {},
          currentFieldId: input.fields[0]?.id ?? null,
          status: input.fields.length ? "active" : "completed",
          context: input.context,
        });
        return { sessionId };
      }

      const session = await memory.getSession<OnboardingSession>(input.sessionId);
      if (!session) throw new Error("[onboarding-api] session not found");
      const answers = { ...session.answers, [input.fieldId]: input.value };
      const next = session.fields.find((field) => answers[field.id] === undefined);
      await memory.setSession<OnboardingSession>(input.sessionId, {
        ...session,
        answers,
        currentFieldId: next?.id ?? null,
        status: next ? "active" : "completed",
      });
      return { sessionId: input.sessionId };
    },
  ),
);

tools.register(
  new LocalToolConnector<{ sessionId: string }, unknown>("read_onboarding_state", async (input) =>
    readState(input.sessionId),
  ),
);

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  defaultProvider: "openai",
  storage,
  tools,
});

const onboardingApiPipeline = new DeclarativePipeline(
  {
    name: "onboarding-api",
    steps: [
      {
        id: "write_state",
        type: "tool",
        name: "write_onboarding_state",
        mapInput: (state) => state.input,
      },
      {
        id: "read_state",
        type: "tool",
        name: "read_onboarding_state",
        mapInput: (state) => ({ sessionId: (state.steps.write_state as { sessionId: string }).sessionId }),
      },
    ],
  },
  { brain, tools },
);

const sdk = new AgentSDK({ brain, storage });
sdk.registerPipeline(onboardingApiPipeline);

await sdk.runPipeline("onboarding-api", {
  operation: "createSession",
  pipelineId: "demo-onboarding",
  fields: [
    { id: "company", question: "What is your company name?" },
    { id: "goal", question: "What should this automation accomplish?" },
  ],
} satisfies OnboardingInput);
