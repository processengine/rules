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

## jsonspecs [1.1.0] - 2026-03-29

### Added

- Official runtime operator context helpers: `ctx.get(path)` and `ctx.has(path)`.
- Public type definitions for the richer operator context, including `getDictionary()` and `payloadKeys`.
- Regression test covering custom operators that use `ctx.get()` or `ctx.has()` without importing `deepGet`.

### Changed

- Built-in check and predicate operators now use `ctx.get()` internally instead of calling `deepGet(ctx.payload, ...)` directly.
- Documentation now recommends `ctx.get()` / `ctx.has()` as the preferred contract for new custom operators.

### Compatibility

- `deepGet()` remains exported and supported for backward compatibility and advanced use cases.

Format: [Semantic Versioning](https://semver.org/)

## jsonspecs [1.0.1] — 2026-03-29

### Fixed

- `compile()` now deep-clones and deep-freezes source artifacts before building the compiled bundle. Mutating the original artifact objects after compilation no longer changes runtime behavior.
- `runPipeline()` now applies `strict: true` semantics at the top-level pipeline boundary, not only for nested pipeline steps.

### Tests

- Added contract tests for top-level strict escalation.
- Added contract tests proving compiled bundles are detached from source artifacts.

## jsonspecs [1.0.0] — 2026

### Initial release

**Core engine**

- `createEngine({ operators })` — creates engine instance bound to operator pack
- `engine.compile(artifacts, options?)` — compiles artifact array, returns `compiled` object
- `engine.runPipeline(compiled, pipelineId, payload)` — runs a named entrypoint pipeline

**Compiler (7 phases)**

- Phase 1: artifact registry with duplicate detection
- Phase 2: schema validation per artifact type
- Phase 3: error code uniqueness across check rules
- Phase 4: cross-artifact reference validation
- Phase 5–6: compile-time normalization of conditions and pipelines
- Phase 7: DAG validation (cycle detection)

**Runtime**

- Accumulates all issues in a single pass (does not stop on ERROR)
- EXCEPTION level stops the pipeline immediately
- Strict pipeline groups escalate to EXCEPTION if any check fails
- `OK_WITH_WARNINGS` status for passes with WARNING-level issues
- Full execution trace always included in result
- Accepts both flat (`{ "a.b": 1 }`) and nested (`{ a: { b: 1 } }`) payloads
- Wildcard field patterns (`items[*].qty`)
- `$context.*` field references for runtime context injection

**Built-in operators**

- 17 check operators: `not_empty`, `is_empty`, `equals`, `not_equals`, `contains`,
  `matches_regex`, `in_dictionary`, `greater_than`, `less_than`, `length_equals`,
  `length_max`, `any_filled`, `field_equals_field`, `field_not_equals_field`,
  `field_less_than_field`, `field_greater_than_field`, `field_less_or_equal_than_field`,
  `field_greater_or_equal_than_field`
- 13 predicate operators (same names, predicate semantics)

**Fixed in 1.0.0**

- `matches_regex`: invalid regex pattern now caught at compile time with `CompilationError`
- `matches_regex`: added optional `flags` field (e.g. `"flags": "i"` for case-insensitive)
- `runPipeline`: added optional `{ trace: false }` option to suppress trace collection
- `ABORT` result status documented as part of the public result contract
