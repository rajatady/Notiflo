# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-02-20

### Added

- Rust runtime (`notiflo-runtime`) with full hot-path pipeline: ingest, evaluate, template render, HTTP deliver, Redis Streams event log
- Drift Sentinel algorithm for O(1) amortized threshold crossing evaluation (~75ns per tick)
- Three pluggable evaluation strategies: `threshold_crossing`, `expression` DSL, `script` (Rhai sandbox)
- Multi-channel delivery: email (SendGrid/SMTP), SMS (Twilio), push (FCM/APNs), webhook, Slack, WhatsApp, in-app
- NestJS control plane API for managing organizations, subscribers, alerts, templates, and channels
- Redis Streams consumer for delivery event tracking and notification status updates
- Dashboard API endpoints for analytics and monitoring
- MCP (Model Context Protocol) stdio server for AI-native alert management
- Next.js dashboard UI with real-time metrics
- Docker Compose setup (MongoDB 7 + Redis 7 + API + Runtime)
- Criterion benchmarks for pipeline throughput, template rendering, and HTTP delivery
- Built-in Rust load test binary (`load-test`) for sustained hot-path testing
- NestJS E2E tests against real MongoDB (MongoMemoryServer) and Redis
- Rust integration tests against real MongoDB and Redis
- CI pipeline: Rust tests + clippy, integration tests, NestJS unit/E2E tests, load test smoke run
