# Migration guide: jsonspecs -> @processengine/rules

## Package rename

```bash
npm uninstall jsonspecs
npm install @processengine/rules
```

## Imports

Before:

```js
const { createEngine, Operators } = require("jsonspecs");
```

Now:

```js
const { createEngine, Operators } = require("@processengine/rules");
```

## Compile contract

Before:

```js
engine.compile(artifacts);
```

Now:

```js
engine.compile({ artifacts });
```

## New external contract

- compile diagnostics are now structured and machine-readable
- runtime `ABORT` errors now contain `code`, `phase`, `pipelineId` and `details`
- schema subpath is available at `@processengine/rules/schema`
- hostile input is rejected more strictly than before

Re-compile all rule sets after upgrade. Re-validate them both through schema validation and `engine.compile()`.

## Additional cleanup in 1.0.0

- `deepGet` is no longer exported as a public helper. Access payload and context through operator context helpers such as `ctx.get()` and `ctx.has()`.
- `compile()` no longer exposes or documents internal source-mapping state as part of the public contract.
