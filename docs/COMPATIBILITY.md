# Compatibility policy for @processengine/rules

Public API:

- package name `@processengine/rules`
- `createEngine`, `Operators`, `CompilationError`, `deepGet`, `formatDiagnostic`
- compile-once contract: `engine.compile({ artifacts }) -> compiled artifact`
- runtime result shape of `runPipeline`
- issue shape
- trace entry shape
- compile diagnostic shape and codes
- runtime abort error shape and codes
- schema subpath `@processengine/rules/schema`
- exported TypeScript types in `index.d.ts`

Not public:

- internal maps and normalized step structures stored inside compiled artifact
- internal helper modules under `src/**`
- exact trace messages text, except stable shape and ordering semantics

Major-only changes:

- result shape
- issue shape
- trace shape
- compile diagnostic codes
- runtime error codes
- DSL schema
- exported types
- compile-once contract

Minor changes may add new optional fields, warnings, operators or documentation without breaking existing stable shapes.


## Additional compatibility guarantees

- Trace entries are stable by shape and ordering, but not by the exact human-readable wording of `message`.
- `CompiledRules` is public and stable only by `kind`, `version`, and `diagnostics`. Internal non-enumerable `__*` fields are implementation details and are not part of the compatibility contract.
- Built-in operators may be extended in minor releases, but the semantics of existing operators must not change in a breaking way outside a major release.
