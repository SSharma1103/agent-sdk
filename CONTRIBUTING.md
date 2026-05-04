# Contributing

Thanks for helping improve Agent SDK.

## Development

```sh
npm ci
npm run typecheck
npm run build
npm test
```

Before opening a pull request, make sure all checks pass locally.

## Pull Requests

- Keep changes focused and explain the user-facing behavior.
- Add or update tests for SDK contracts, providers, transports, triggers, and pipeline behavior.
- Preserve backward compatibility unless the pull request clearly documents a breaking change.
- Avoid adding required runtime dependencies for optional adapters. Prefer dependency injection.
- Update README examples when public APIs change.

## Issues

When reporting a bug, include:

- SDK version or commit.
- Node.js version.
- Minimal reproduction code.
- Expected behavior and actual behavior.

## Release Notes

For user-facing changes, include a short note covering:

- What changed.
- Why it changed.
- Any migration steps.
