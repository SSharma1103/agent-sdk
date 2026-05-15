import {
  AgentSDK,
  Brain,
  DeclarativePipeline,
  LocalToolConnector,
  MemoryStore,
  OpenAIProvider,
  ToolRegistry,
  type BrainGenerateOutput,
  type WorkflowRule,
} from "../sdk/index.js";

declare const process: { env: { OPENAI_API_KEY?: string } };

type IncomingEmail = {
  threadId: string;
  from: string;
  subject: string;
  body: string;
  rules: WorkflowRule[];
};

type RuleCheck = {
  action: "reply" | "skip" | "none";
  staticReply?: string;
};

const storage = new MemoryStore();
const tools = new ToolRegistry();

tools.register(
  new LocalToolConnector<IncomingEmail, RuleCheck>(
    "check_rules",
    (email) => {
      const matched = email.rules.find((rule) => {
        const haystack =
          rule.match.field === "subject" ? email.subject : rule.match.field === "from" ? email.from : email.body;
        const lower = haystack.toLowerCase();
        const needle = rule.match.value.toLowerCase();
        if (rule.match.op === "contains") return lower.includes(needle);
        if (rule.match.op === "equals") return lower === needle;
        return lower.startsWith(needle);
      });

      if (!matched) return { action: "none" };
      if (matched.action.kind === "skip") return { action: "skip" };
      if (matched.action.kind === "reply") return { action: "reply", staticReply: matched.action.text };
      return { action: "none" };
    },
    "Evaluate host-defined email workflow rules.",
  ),
);

tools.register(
  new LocalToolConnector<{ threadId: string; text: string }, { sent: true }>(
    "send_reply",
    async (input) => {
      console.info("sending reply", input.threadId);
      return { sent: true };
    },
    "Send a reply to an email thread.",
  ),
);

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })],
  defaultProvider: "openai",
  storage,
  tools,
});

const emailAutomationPipeline = new DeclarativePipeline(
  {
    name: "email-automation",
    steps: [
      {
        id: "classify_email",
        type: "llm",
        model: "gpt-4o-mini",
        system: "Classify the email intent and urgency. Return concise JSON.",
        prompt: (state) => {
          const email = state.input as IncomingEmail;
          return `From: ${email.from}\nSubject: ${email.subject}\n\n${email.body}`;
        },
      },
      {
        id: "check_rules",
        type: "tool",
        name: "check_rules",
        mapInput: (state) => state.input,
      },
      {
        id: "draft_reply",
        type: "llm",
        model: "gpt-4o-mini",
        when: (state) => (state.steps.check_rules as RuleCheck).action !== "skip",
        system: "Draft a concise, helpful email reply.",
        prompt: (state) => {
          const email = state.input as IncomingEmail;
          const rule = state.steps.check_rules as RuleCheck;
          const classification = state.steps.classify_email as BrainGenerateOutput;
          return [
            rule.staticReply ? `Use this approved reply as source material: ${rule.staticReply}` : undefined,
            `Classification: ${classification.text}`,
            `Subject: ${email.subject}`,
            email.body,
          ]
            .filter(Boolean)
            .join("\n\n");
        },
      },
      {
        id: "send_reply",
        type: "tool",
        name: "send_reply",
        when: (state) => (state.steps.check_rules as RuleCheck).action === "reply",
        mapInput: (state) => ({
          threadId: (state.input as IncomingEmail).threadId,
          text: (state.steps.draft_reply as BrainGenerateOutput).text,
        }),
      },
    ],
  },
  { brain, tools },
);

const sdk = new AgentSDK({ brain, storage });
sdk.registerPipeline(emailAutomationPipeline);

await sdk.runPipeline("email-automation", {
  threadId: "thread_123",
  from: "customer@example.com",
  subject: "Pricing question",
  body: "Can you send details about the team plan?",
  rules: [
    {
      id: "rule_pricing",
      match: { field: "subject", op: "contains", value: "pricing" },
      action: { kind: "reply", text: "Share the current team plan details and offer a demo." },
    },
  ],
} satisfies IncomingEmail);
