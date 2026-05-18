# Changelog

## 2.1.0

- added grouped wildcard support for built-in `any_filled` over `fields[]` with shared wildcard array base
- added compile-time diagnostics for mixed wildcard/non-wildcard `any_filled` fields, mismatched wildcard bases and unsupported wildcard aggregate modes
- documented wildcard `any_filled` semantics in `SPEC.md` and `SPEC_RU.md`
- added regression coverage for `any_filled` grouped wildcard success, per-element failure, `WILDCARD_EMPTY`, invalid base patterns and invalid aggregate modes
- added GitHub Actions CI and tag-based release workflow for reproducible npm releases

## 2.0.2

- fixed wildcard field expansion for array paths like `items[*].code` and nested wildcard paths like `groups[*].documents[*].number`
- added regression coverage for wildcard check and predicate aggregation, `WILDCARD_EMPTY`, multiple wildcard segments and invalid `aggregate.onEmpty` diagnostics
- added normative wildcard documentation to `SPEC.md` and `SPEC_RU.md`
- fixed wildcard `MIN` / `MAX` aggregation so the selected aggregate value is passed to the base operator through the runtime `ctx.get(...)` boundary
- added compile-time validation for `aggregate.onEmpty` values
- added feature-review tests for all built-in check/predicate operators and wildcard `COUNT` / `MIN` / `MAX` aggregation

## 2.0.1

- fixed the inter-library transport-safe contract of the public rules runtime result
- normalized `evaluateRules(...)` output to a JSON-safe public shape without `undefined` values
- verified the `rules -> mappings` handoff with a contract-style downstream runtime test and JSON round-trip checks
- added an official build path and aligned CI/publish flows with `src -> build -> dist`
- expanded `SPEC.md` and `SPEC_RU.md` into normative artifact/runtime specifications with field-level artifact semantics, reference semantics, operator semantics, runtime contract and interop guidance

## 2.0.0

- moved `rules` to canonical ProcessEngine API: `validateRules / prepareRules / evaluateRules`
- removed engine-style public API from package exports
- introduced first-class prepared artifact for runtime execution
- introduced typed `RulesCompileError` and `RulesRuntimeError`
- introduced canonical trace modes `false | 'basic' | 'verbose'`
- aligned package shape to ESM-first, dist-only publishing model
- verified runtime semantics against a self-contained ecommerce regression fixture
