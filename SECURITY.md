# Security Policy

## Supported Versions

Security fixes are currently handled on the `main` branch until the project publishes stable release lines.

## Reporting a Vulnerability

Please do not open a public issue for suspected vulnerabilities.

Report privately with:

- A clear description of the issue.
- Steps to reproduce or proof-of-concept code.
- Impact and affected versions or commits.
- Any suggested fix.

If the repository has GitHub Security Advisories enabled, use that flow. Otherwise contact the maintainers through the private contact listed on the repository profile.

## Scope

Security-sensitive areas include:

- API key and OAuth authentication.
- Tool execution and transport adapters.
- Webhook and cron trigger handling.
- Provider request construction.
- Persistence adapters and metadata handling.
