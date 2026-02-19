# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Notiflo, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email **security@notiflo.dev** with:

1. Description of the vulnerability
2. Steps to reproduce
3. Affected versions
4. Any potential impact assessment

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation plan within 7 days.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security Considerations

### Rust Runtime

- The Rhai script sandbox has configurable execution timeouts to prevent resource exhaustion
- HTTP delivery uses TLS by default
- Redis connections support TLS via `rediss://` URLs
- No user-supplied input is passed to shell commands

### NestJS API

- API key authentication for organization-scoped endpoints
- Input validation via class-validator on all DTOs
- MongoDB injection protection through Mongoose schema validation
- CORS is configurable via `CORS_ORIGIN` environment variable

### Infrastructure

- MongoDB and Redis should be deployed with authentication enabled in production
- Use network policies to restrict access between services
- Rotate API keys regularly through the management API
