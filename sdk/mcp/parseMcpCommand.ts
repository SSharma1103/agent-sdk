import { ValidationError } from "../errors.js";
import type { McpCommandInput, McpServerConfig } from "./McpServerConfig.js";

const SHELL_OPERATOR_PATTERN = /[;&|<>`$()]/;

export function parseMcpCommand(input: McpCommandInput): McpServerConfig {
  const tokens = tokenizeMcpCommand(input.command);
  if (!tokens.length) {
    throw new ValidationError("[MCP] command cannot be empty");
  }

  const [command, ...args] = tokens;
  return {
    name: input.name,
    transport: "stdio",
    command,
    args,
    env: input.env,
  };
}

export function tokenizeMcpCommand(command: string): string[] {
  const source = command.trim();
  if (!source) return [];
  if (/[\r\n]/.test(source)) {
    throw new ValidationError("[MCP] command must be a single line");
  }
  if (SHELL_OPERATOR_PATTERN.test(source)) {
    throw new ValidationError("[MCP] shell operators and substitutions are not allowed");
  }

  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new ValidationError("[MCP] command contains an unterminated quoted string");
  }
  if (current) tokens.push(current);
  return tokens;
}
