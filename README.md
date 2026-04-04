# @processengine/rules

[![CI](https://github.com/processengine/rules/actions/workflows/ci.yml/badge.svg)](https://github.com/processengine/rules/actions/workflows/ci.yml)
[![Publish](https://github.com/processengine/rules/actions/workflows/publish.yml/badge.svg)](https://github.com/processengine/rules/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/%40processengine%2Frules)](https://www.npmjs.com/package/@processengine/rules)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 18+](https://img.shields.io/badge/Node-18%2B-green)](https://nodejs.org/)

Compile-once JSON DSL for declarative validation pipelines in ProcessEngine.

`@processengine/rules` sits between data preparation and decision making:

- `mappings` prepares data
- `rules` validates and produces issues
- `decisions` chooses a route or outcome
- `flows` manages process over time

## Install

```bash
npm install @processengine/rules
```

## Quick start

```js
const { createEngine, Operators } = require('@processengine/rules');

const engine = createEngine({ operators: Operators });

const definition = {
  artifacts: [
    {
      id: 'library.person.first_name_required',
      type: 'rule',
      description: 'First name must be filled',
      role: 'check',
      operator: 'not_empty',
      level: 'ERROR',
      code: 'PERSON.FIRST_NAME.REQUIRED',
      message: 'First name is required',
      field: 'person.firstName'
    },
    {
      id: 'registration.pipeline',
      type: 'pipeline',
      description: 'Registration validation',
      entrypoint: true,
      strict: false,
      flow: [{ rule: 'library.person.first_name_required' }]
    }
  ]
};

const compiled = engine.compile(definition);
const result = engine.runPipeline(compiled, 'registration.pipeline', {
  person: { firstName: '' }
});
```

## Compile once, run many times

`compile(definition)` is the normative contract. It validates artifacts, resolves references, normalizes steps, builds an immutable compiled artifact and detaches runtime behavior from source objects.

```js
const compiled = engine.compile(definition);
const a = engine.runPipeline(compiled, 'registration.pipeline', payloadA);
const b = engine.runPipeline(compiled, 'registration.pipeline', payloadB);
```

## Runtime result contract

```js
{
  status: 'OK' | 'OK_WITH_WARNINGS' | 'ERROR' | 'EXCEPTION' | 'ABORT',
  control: 'CONTINUE' | 'STOP',
  issues: [...],
  trace: [...],
  error: { code, message, phase, pipelineId, details } // only for ABORT
}
```

`ABORT` means engine/runtime failure or invalid runtime input. It is not a validation result.

## Compile diagnostics

`engine.compile()` throws `CompilationError` with structured diagnostics.

```js
try {
  engine.compile(definition);
} catch (error) {
  if (error instanceof require('@processengine/rules').CompilationError) {
    console.log(error.errors);
    console.log(error.warnings);
  }
}
```

Each diagnostic contains machine-readable fields such as `code`, `phase`, `artifactId`, `path` and `details`.

## JSON Schema

The package exports a canonical schema subpath:

```js
const schema = require('@processengine/rules/schema');
```

Use it in editors, offline validation or CI checks before runtime compilation.

## Runtime input model

The engine accepts either nested JSON payloads or flat maps.

```js
engine.runPipeline(compiled, 'registration.pipeline', {
  person: { firstName: 'Ivan' },
  __context: { currentDate: '2026-04-04' }
});

engine.runPipeline(compiled, 'registration.pipeline', {
  'person.firstName': 'Ivan',
  __context: { currentDate: '2026-04-04' }
});
```

## Hostile input limits

The package rejects dangerous keys and non-JSON-safe input:

- `__proto__`, `prototype`, `constructor`
- cyclic structures
- `Date`, `Map`, `Set`, `BigInt`, `NaN`, `Infinity`, functions, symbols
- conflicting flat and nested payload paths

These cases return `ABORT` with machine-readable runtime error codes.

## Trace

Trace is part of the public contract. It is enabled by default and can be disabled with `{ trace: false }`.

## Architecture boundary

`@processengine/rules` validates and reports issues. It does not:

- execute side effects
- call external systems
- make route decisions
- replace `@processengine/decisions`
- orchestrate long-running processes like `@processengine/flows`

## Documentation

- `docs/SPEC_RU.md` — Russian normative specification
- `docs/COMPATIBILITY.md` — compatibility policy
- `docs/MIGRATION_GUIDE.md` — migration from `jsonspecs`
- `docs/BENCHMARKS.md` — benchmark methodology


## ProcessEngine role

In the ProcessEngine stack, `mappings` prepares and normalizes data, `rules` validates and classifies payloads, `decisions` selects a normalized decision, and `flows` coordinates long-running process behavior over time.
