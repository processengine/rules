# Specification: @processengine/rules

## Role and boundaries

`@processengine/rules` is the ProcessEngine runtime for declarative validation artifacts. It validates input against rule, condition, pipeline and dictionary artifacts and returns structured validation results. The library does not choose process outcomes and does not replace facts or decisions.

## Source model

The source artifact is an object with `artifacts: []`. Each artifact must have `id`, `type`, and `description`. Supported artifact types are `rule`, `condition`, `pipeline`, and `dictionary`.

## Compile semantics

`validateRules(...)` validates structure and semantics and returns structured diagnostics. `prepareRules(...)` runs the same compile chain, builds a prepared artifact, binds the effective operator registry, and throws `RulesCompileError` if compile errors exist.

## Prepared artifact contract

Prepared artifact public shape is intentionally minimal:

- `kind = 'prepared-rules'`
- `artifactType = 'rules'`
- `version`
- `diagnostics`

Internal runtime-ready state is intentionally hidden. The artifact is immutable by public contract and is the only valid input for `evaluateRules(...)`.

## Effective operator registry

The effective operator registry is built during validate/prepare and merges built-in operators with external packs from `options.operators`. The same effective registry is used by compile-time semantics and runtime semantics.

## Runtime semantics

`evaluateRules(...)` accepts a prepared artifact and an input object shaped as:

- `pipelineId?`
- `payload`
- `context?`

If `pipelineId` is omitted, the runtime may use `input.context.pipelineId` or the only available entrypoint.

The runtime never performs hidden compile.

## Runtime result contract

Success-path result contains:

- `status`
- `control`
- `issues`
- `trace?`

`ABORT` additionally contains `error`.

## Diagnostics and errors

Diagnostics are machine-readable objects with at least:

- `code`
- `level`
- `message`
- `path`
- `details?`

`RulesCompileError` is used only on prepare phase. `RulesRuntimeError` is used for evaluation failures. Formatter helpers do not replace structured objects.

## Trace semantics

Supported trace modes: `false | 'basic' | 'verbose'`.

- `false`: no trace
- `basic`: compact execution events without raw input/output payload fragments
- `verbose`: extended events and optional event `input/output`

The host application may pass `traceRedactor(value, mode)` to redact verbose values.

## Limitations and non-goals

The library does not:

- orchestrate long-running processes
- execute side effects
- choose business outcomes
- replace the facts layer between validation and decisions

## Compatibility guarantees

Public compatibility is evaluated by:

- exported API names and signatures
- diagnostics shape
- runtime result shape
- trace contract on documented level
- documented public artifact fields
