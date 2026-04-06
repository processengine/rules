# Changelog

## 2.0.0

- moved `rules` to canonical ProcessEngine API: `validateRules / prepareRules / evaluateRules`
- removed engine-style public API from package exports
- introduced first-class prepared artifact for runtime execution
- introduced typed `RulesCompileError` and `RulesRuntimeError`
- introduced canonical trace modes `false | 'basic' | 'verbose'`
- aligned package shape to ESM-first, dist-only publishing model
- verified runtime semantics against a self-contained ecommerce regression fixture
