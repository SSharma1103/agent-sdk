import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "examples/dev-ui/web/dist/**", "coverage/**", "*.log"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        Response: "readonly",
        URL: "readonly",
        console: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        process: "readonly",
        queueMicrotask: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.mjs"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
