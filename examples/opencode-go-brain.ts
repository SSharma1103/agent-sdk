import { Brain, OpenAIProvider, OpenCodeGoProvider } from "../sdk/index.js";

const brain = new Brain({
  providers: [new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY }), new OpenCodeGoProvider()],
  defaultProvider: "openai",
});

const result = await brain.run({
  provider: "opencode-go",
  model: "opencode-go-default",
  messages: [{ role: "user", content: "Say hello in one short sentence." }],
});

console.log(result.text);
