import { ValidationError } from "../errors.js";
import type { McpCommandValidationOptions, McpServerConfig } from "./McpServerConfig.js";

export const ALLOWED_COMMANDS = ["npx", "node", "python", "docker"] as const;

export const DEFAULT_ALLOWED_NPX_PACKAGES = [
  "@playwright/mcp",
  "@modelcontextprotocol/server-filesystem",
  "@modelcontextprotocol/server-github",
] as const;

const UNSAFE_ARG_PATTERN = /[;&|<>`$()\r\n]/;

export function validateMcpCommand(
  config: McpServerConfig,
  options: McpCommandValidationOptions = {},
): McpServerConfig {
  const command = config.command?.trim();
  if (!command) {
    throw new ValidationError("[MCP] command cannot be empty");
  }

  const allowedCommands = options.allowedCommands ?? ALLOWED_COMMANDS;
  if (!allowedCommands.includes(command)) {
    throw new ValidationError(`[MCP] command "${command}" is not allowed`, {
      allowedCommands: [...allowedCommands],
    });
  }

  for (const arg of config.args ?? []) {
    if (!arg || UNSAFE_ARG_PATTERN.test(arg)) {
      throw new ValidationError("[MCP] command arguments cannot be empty or contain shell operators", { arg });
    }
  }

  validateEnv(config.env);
  if (command === "npx") validateNpxArgs(config.args ?? [], options);

  return {
    ...config,
    command,
    args: config.args ?? [],
    transport: config.transport ?? "stdio",
  };
}

function validateNpxArgs(args: string[], options: McpCommandValidationOptions): void {
  const packageSpec = findNpxPackageSpec(args);
  if (!packageSpec) {
    throw new ValidationError("[MCP] npx MCP servers must include a package name");
  }

  const packageName = normalizePackageName(packageSpec);
  const allowedPackages = options.allowedNpxPackages ?? DEFAULT_ALLOWED_NPX_PACKAGES;
  const allowedByList = allowedPackages.includes(packageName);
  const allowedByHook = options.isNpxPackageAllowed?.(packageName, packageSpec) ?? false;
  const looksLikeMcpPackage =
    packageName.startsWith("@modelcontextprotocol/server-") ||
    packageName === "@playwright/mcp" ||
    packageName.endsWith("/mcp") ||
    packageName.endsWith("-mcp") ||
    packageName.startsWith("mcp-");

  if (!allowedByList && !allowedByHook && !looksLikeMcpPackage) {
    throw new ValidationError(`[MCP] npx package "${packageName}" is not allowed`, {
      packageName,
      allowedPackages: [...allowedPackages],
    });
  }
}

function findNpxPackageSpec(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") return args[index + 1];
    if (arg === "-y" || arg === "--yes" || arg === "--quiet") continue;
    if (arg === "-p" || arg === "--package" || arg === "--package-name") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--package=")) continue;
    if (!arg.startsWith("-")) return arg;
  }
  return undefined;
}

export function normalizePackageName(packageSpec: string): string {
  if (packageSpec.startsWith("@")) {
    const slash = packageSpec.indexOf("/");
    const versionMarker = slash >= 0 ? packageSpec.indexOf("@", slash + 1) : -1;
    return versionMarker >= 0 ? packageSpec.slice(0, versionMarker) : packageSpec;
  }

  const versionMarker = packageSpec.indexOf("@");
  return versionMarker > 0 ? packageSpec.slice(0, versionMarker) : packageSpec;
}

function validateEnv(env?: Record<string, string>): void {
  for (const [key, value] of Object.entries(env ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new ValidationError(`[MCP] invalid environment variable name "${key}"`);
    }
    if (typeof value !== "string") {
      throw new ValidationError(`[MCP] environment variable "${key}" must be a string`);
    }
  }
}
