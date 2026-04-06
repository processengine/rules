# Migration to 2.0.0

## Old shape

Previous package revisions exposed engine-style API such as `createEngine(...).compile(...).runPipeline(...)`.

## New canonical path

Use:

- `validateRules(source, options?)`
- `prepareRules(source, options?)`
- `evaluateRules(artifact, input, options?)`

## Main changes

- engine-style entrypoint removed from public API
- prepared artifact is now the normative runtime unit
- trace uses `false | 'basic' | 'verbose'`
- package is ESM-first and published from `dist/`
- custom operators are part of the full validate / prepare / evaluate chain
