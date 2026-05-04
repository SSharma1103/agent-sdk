import { ValidationError } from "./errors.js";

export type SafeParseSuccess<T> = { success: true; data: T };
export type SafeParseFailure = { success: false; error: unknown };

export type ValidationSchema<T = unknown> = {
  parse?(input: unknown): T;
  safeParse?(input: unknown): SafeParseSuccess<T> | SafeParseFailure;
};

export type Validator<T = unknown> = (input: unknown) => T;

export function validateWithSchema<T>(schema: ValidationSchema<T>, input: unknown, label = "input"): T {
  try {
    if (schema.safeParse) {
      const result = schema.safeParse(input);
      if (result.success) return result.data;
      throw new ValidationError(`[Validation] invalid ${label}`, { label, issues: result.error }, result.error);
    }
    if (schema.parse) return schema.parse(input);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`[Validation] invalid ${label}`, { label }, error);
  }

  throw new ValidationError("[Validation] schema must provide parse or safeParse", { label });
}

export function createValidator<T>(schema: ValidationSchema<T>, label?: string): Validator<T> {
  return (input: unknown) => validateWithSchema(schema, input, label);
}

export function assertObject(input: unknown, label = "input"): asserts input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError(`[Validation] ${label} must be an object`, { label });
  }
}

export function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.length) {
    throw new ValidationError(`[Validation] ${label} must be a non-empty string`, { label });
  }
}
