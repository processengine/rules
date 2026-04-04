# Changelog

## 1.0.0 — 2026-04-04

First stable external release under the ProcessEngine identity.

### Changed
- renamed package from `jsonspecs` to `@processengine/rules`
- formalized compile-once contract around `engine.compile({ artifacts })`
- introduced structured compile diagnostics and `CompilationError.diagnostics`
- introduced structured runtime `ABORT.error` contract
- added canonical JSON Schema and `@processengine/rules/schema` subpath
- tightened runtime safety for dangerous keys, non-JSON-safe payloads and cycles
- added compatibility policy, migration guide, benchmarks and smoke-install workflow
