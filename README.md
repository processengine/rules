# @processengine/rules

`@processengine/rules` is the ProcessEngine runtime for declarative validation artifacts.

It sits between data preparation and decision making:

- `mappings` normalize and interpret data
- `rules` validate data and produce structured issues
- `decisions` choose an outcome from facts
- `flows` orchestrate long-running process behavior

## Canonical API

```js
import {
  validateRules,
  prepareRules,
  evaluateRules,
  RulesCompileError,
  RulesRuntimeError,
  formatRulesDiagnostics,
  formatRulesRuntimeError,
} from '@processengine/rules';
```

## Quick start

```js
import { prepareRules, evaluateRules } from '@processengine/rules';

const source = {
  artifacts: [
    {
      id: 'library.person.first_name_required',
      type: 'rule',
      description: 'First name must be filled',
      role: 'check',
      operator: 'not_empty',
      field: 'person.firstName',
      level: 'ERROR',
      code: 'PERSON.FIRST_NAME.REQUIRED',
      message: 'First name is required',
    },
    {
      id: 'entry.registration',
      type: 'pipeline',
      description: 'Registration validation',
      entrypoint: true,
      strict: false,
      flow: [{ rule: 'library.person.first_name_required' }],
    },
  ],
};

const artifact = prepareRules(source);
const result = evaluateRules(artifact, {
  pipelineId: 'entry.registration',
  payload: { person: { firstName: '' } },
});
```

## Validate / prepare / evaluate

- `validateRules(source, options?)` returns `{ ok, diagnostics }` and never throws on invalid source.
- `prepareRules(source, options?)` returns a prepared artifact or throws `RulesCompileError`.
- `evaluateRules(artifact, input, options?)` works only with a prepared artifact and never performs hidden compile.

## Runtime contract

`evaluateRules(...)` returns a validation result with domain-oriented fields. The public runtime result is transport-safe / JSON-safe by normative shape and is suitable for direct downstream use inside the ProcessEngine family without host-side cleanup.


- `status`: `OK | OK_WITH_WARNINGS | ERROR | EXCEPTION | ABORT`
- `control`: `CONTINUE | STOP`
- `issues`: structured validation issues
- `trace?`: optional structured trace when trace is enabled
- `error`: runtime error payload only for `ABORT`

Fields that are logically absent are omitted or normalized to contract-safe values. The runtime result does not expose `undefined` in its public shape.

## Trace

Supported trace modes:

- `false`
- `'basic'`
- `'verbose'`

Trace is disabled by default. `basic` gives compact execution events. `verbose` additionally includes event input/output payload fragments after optional redaction.

## Custom operators

Custom operator packs are part of the canonical path and participate in the whole chain:

```js
import { validateRules, prepareRules, evaluateRules } from '@processengine/rules';

const operators = {
  check: {
    always_fail() {
      return { status: 'FAIL' };
    },
  },
};

const validation = validateRules(source, { operators });
const artifact = prepareRules(source, { operators });
const result = evaluateRules(artifact, input);
```

## Boundaries and non-goals

`@processengine/rules` validates and reports issues. It does not:

- choose business outcomes instead of `decisions`
- orchestrate long-running processes instead of `flows`
- execute side effects or external integrations
- replace the facts layer between validation and decisions

## Documentation

- `README.ru.md`
- `docs/SPEC.md` — normative artifact/runtime specification
- `docs/SPEC_RU.md` — русская нормативная спецификация
- `docs/COMPATIBILITY.md`
- `docs/MIGRATION.md`
- `CHANGELOG.md`
- `examples/`

## Interop inside ProcessEngine

The natural `rules -> mappings -> decisions` chain must work without `JSON.parse(JSON.stringify(...))` or any other host-side cleanup. `evaluateRules(...)` therefore returns a transport-safe runtime result that can be serialized and passed to the next layer directly.
