# Changelog

## 2.0.1

- fixed the inter-library transport-safe contract of the public rules runtime result
- normalized `evaluateRules(...)` output to a JSON-safe public shape without `undefined` values
- verified the `rules -> mappings` handoff with a contract-style downstream runtime test and JSON round-trip checks
- added an official build path and aligned CI/publish flows with `src -> build -> dist`

## 2.0.0

- moved `rules` to canonical ProcessEngine API: `validateRules / prepareRules / evaluateRules`
- removed engine-style public API from package exports
- introduced first-class prepared artifact for runtime execution
- introduced typed `RulesCompileError` and `RulesRuntimeError`
- introduced canonical trace modes `false | 'basic' | 'verbose'`
- aligned package shape to ESM-first, dist-only publishing model
- verified runtime semantics against a self-contained ecommerce regression fixture
