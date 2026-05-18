# Specification: @processengine/rules

## 1. Purpose of this document

This document normatively defines the declarative artifact model and runtime semantics of `@processengine/rules`.

`@processengine/rules` is a ProcessEngine family library that validates input data against declarative rule artifacts and returns a structured validation result. This specification exists so that users can understand and apply the library without reconstructing behavior from the source code.

## 2. What this specification normatively defines

This document normatively defines:

- source artifact format
- artifact types and their field-level semantics
- reference semantics and visibility assumptions
- built-in operator participation in compile/runtime semantics
- compile path semantics for `validateRules(...)` and `prepareRules(...)`
- prepared artifact public contract
- runtime semantics of `evaluateRules(...)`
- runtime result contract
- diagnostics, errors, and trace contract on documented level
- compatibility-relevant public guarantees

This document does **not** normatively define internal helper structure, internal runtime caches, or hidden implementation details that are intentionally outside the public contract.

## 3. Role and boundaries

`@processengine/rules` is the validation layer of the ProcessEngine family.

Its role is to:

- validate input data against declarative validation artifacts
- accumulate structured issues
- return a runtime result suitable for downstream ProcessEngine layers

It does **not**:

- choose business outcomes instead of `decisions`
- normalize raw data into facts instead of `mappings`
- orchestrate long-running business processes instead of `flows`
- execute side effects or integrations

The natural family chain is:

`rules -> mappings -> decisions`

The public runtime result of `rules` is therefore designed to be transport-safe / JSON-safe and suitable for direct downstream use.

## 4. Canonical public API

The normative public API is:

- `validateRules(source, options?)`
- `prepareRules(source, options?)`
- `evaluateRules(artifact, input, options?)`
- `RulesCompileError`
- `RulesRuntimeError`
- `formatRulesDiagnostics(...)`
- `formatRulesRuntimeError(...)`

Rules of use:

- `validateRules(...)` validates source and never throws on invalid source
- `prepareRules(...)` prepares a runtime artifact and throws `RulesCompileError` if compile failure exists
- `evaluateRules(...)` only accepts a prepared artifact and never performs hidden compile

## 5. Source artifact model

The source artifact is a JSON-compatible object with the following top-level shape.

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `artifacts` | `array` | yes | List of declarative validation artifacts |

General source rules:

- `artifacts` must be an array
- every artifact must be a JSON-compatible object
- artifact ids must be unique inside source
- unsupported artifact `type` values are compile errors
- unresolved references are compile errors
- structurally invalid artifact shapes are compile diagnostics and block preparation

## 6. Common artifact fields

Every artifact uses the following common fields.

| Field | Type | Required | Meaning | Notes |
|---|---|---:|---|---|
| `id` | `string` | yes | Stable artifact identifier | Must be unique in source |
| `type` | `string` | yes | Artifact kind | One of `rule`, `condition`, `pipeline`, `dictionary` |
| `description` | `string` | yes | Human-readable description | Part of source contract, not execution control |

Additional fields depend on artifact type.

## 7. Artifact types

### 7.1. `rule`

A `rule` defines an atomic validation check or predicate-based validation step.

| Field | Type | Required | Meaning | Notes |
|---|---|---:|---|---|
| `id` | `string` | yes | Artifact id | Common field |
| `type` | `'rule'` | yes | Artifact type marker | Common field |
| `description` | `string` | yes | Human-readable description | Common field |
| `role` | `string` | yes | Rule role | Built-in roles are `check` and `predicate` |
| `operator` | `string` | yes | Operator id | Must exist in the effective operator registry |
| `field` | `string` | role/operator dependent | Primary payload path | Meaning depends on operator |
| `leftField` | `string` | operator dependent | Left-side path for field-to-field comparison | Optional unless required by operator |
| `rightField` | `string` | operator dependent | Right-side path for field-to-field comparison | Optional unless required by operator |
| `value` | JSON value | operator dependent | Constant comparison value | Optional unless required by operator |
| `dictionary` | `string` | operator dependent | Referenced dictionary id | Optional unless required by operator |
| `level` | `string` | check rules only | Issue severity | Typically `ERROR`, `WARNING`, or `EXCEPTION` |
| `code` | `string` | check rules only | Stable issue code | Required for issue-producing checks |
| `message` | `string` | check rules only | Human-readable issue message | Required for issue-producing checks |
| `onEmpty` | `string` | operator dependent | Empty-input policy | Semantics depend on operator |

Normative notes:

- `check` rules produce validation issues when they fail
- `predicate` rules produce boolean-like execution meaning and are typically used inside conditions or flow control
- operator-specific required fields are part of compile semantics
- a rule that references an unknown operator is invalid

### 7.2. `condition`

A `condition` defines a reusable boolean condition based on one or more rule or condition references.

| Field | Type | Required | Meaning | Notes |
|---|---|---:|---|---|
| `id` | `string` | yes | Artifact id | Common field |
| `type` | `'condition'` | yes | Artifact type marker | Common field |
| `description` | `string` | yes | Human-readable description | Common field |
| `all` / `any` / `not` | array/object | condition-shape dependent | Declarative condition body | Actual operator-free condition structure |

Normative notes:

- a condition may reference rules and other conditions according to the supported condition shape
- invalid nesting or unresolved references are compile errors
- conditions do not directly emit issues; they influence execution semantics

### 7.3. `pipeline`

A `pipeline` defines an executable validation entry or reusable validation sequence.

| Field | Type | Required | Meaning | Notes |
|---|---|---:|---|---|
| `id` | `string` | yes | Artifact id | Common field |
| `type` | `'pipeline'` | yes | Artifact type marker | Common field |
| `description` | `string` | yes | Human-readable description | Common field |
| `entrypoint` | `boolean` | no | Declares a callable top-level pipeline | Optional; relevant for runtime selection |
| `strict` | `boolean` | no | Strict escalation mode | Defaults to library runtime behavior when omitted |
| `flow` | `array` | yes | Ordered executable steps | Required |

`flow` is an ordered list of step objects. Step shapes are declarative and refer to other artifacts.

Common step kinds include references such as:

| Step field | Meaning |
|---|---|
| `rule` | Execute referenced rule |
| `condition` | Evaluate referenced condition |
| `pipeline` | Execute referenced nested pipeline |

Normative notes:

- `flow` order is part of runtime semantics
- invalid step shapes are compile diagnostics
- unresolved flow references are compile errors
- `strict` affects how accumulated issues influence control/status semantics

### 7.4. `dictionary`

A `dictionary` defines a lookup set used by dictionary-aware operators.

| Field | Type | Required | Meaning | Notes |
|---|---|---:|---|---|
| `id` | `string` | yes | Artifact id | Common field |
| `type` | `'dictionary'` | yes | Artifact type marker | Common field |
| `description` | `string` | yes | Human-readable description | Common field |
| `values` | `array` | yes | Dictionary values | Must be JSON-compatible |

Normative notes:

- dictionary content is compile-visible and runtime-usable through operators such as dictionary membership checks
- referenced dictionary ids must exist in source

## 8. Reference semantics

References are resolved during compile/prepare.

Normative rules:

- artifact ids are the source of truth for references
- unresolved references are compile errors
- duplicate ids are compile errors
- runtime does not perform late reference resolution as a substitute for compile failure
- prepared artifact contains the result of successful reference binding and runtime-ready assumptions

This library does not expose a separate public ref-resolution API. The public guarantee is behavioral: valid source prepares successfully, invalid references produce compile diagnostics or `RulesCompileError` during prepare.

## 9. Effective operator registry

The effective operator registry is built during validate/prepare.

It consists of:

- built-in operators provided by the library
- optional external operators from `options.operators`

Normative rules:

- compile-time operator validation uses the same effective registry as runtime execution
- runtime does not rebind a different registry than the one prepared into the artifact
- unknown operators are compile failures
- external packs extend the effective registry; they do not replace the canonical prepare/evaluate model

## 10. Built-in operator semantics

The library includes built-in operators for emptiness checks, equality/inequality checks, field-to-field comparison, length checks, regex matching, numeric comparison, collection membership and dictionary membership.

Examples of built-in operator ids include:

- `not_empty`
- `is_empty`
- `equals`
- `not_equals`
- `contains`
- `matches_regex`
- `greater_than`
- `less_than`
- `field_equals_field`
- `field_not_equals_field`
- `field_greater_or_equal_than_field`
- `field_less_or_equal_than_field`
- `in_dictionary`
- `any_filled`

Normative operator rules:

- operator id is part of the artifact contract
- operator-specific required fields are compile-validated
- dictionary-aware operators require a resolvable dictionary reference
- field-to-field operators require the relevant field references
- mismatch between operator semantics and artifact shape is a compile failure
- runtime behavior for missing fields or empty values is determined by operator semantics and optional operator-specific flags such as `onEmpty`

This specification does not promise every internal implementation detail of each operator, but it does treat built-in operator ids, their role in compile/runtime semantics, and their configuration requirements as public, compatibility-relevant behavior.


### 10.1. Wildcard fields and aggregate semantics

A rule `field` may use the array wildcard segment `[*]` to apply one rule to every matching element of an array-shaped payload. Wildcard matching is performed against the flattened runtime payload. For example:

```json
{
  "field": "beneficiary.tax.foreignResidencies[*].countryCode"
}
```

matches concrete payload fields such as:

```text
beneficiary.tax.foreignResidencies[0].countryCode
beneficiary.tax.foreignResidencies[1].countryCode
```

Wildcard fields are supported for check rules and predicate rules through `aggregate`. They are not a separate operator and do not require custom operator packs.

For check rules, supported `aggregate.mode` values are:

- `EACH` — run the check on every matched field and emit one issue per failing concrete field; this is the default for wildcard check rules.
- `ALL` — equivalent to `EACH` by default; when `aggregate.summaryIssue: true`, emit one summary issue on the wildcard field instead of per-field issues.
- `COUNT` — count successful concrete checks and compare the count with `aggregate.op` and `aggregate.value`.
- `MIN` — pick the minimum comparable matched value and run the check against that value.
- `MAX` — pick the maximum comparable matched value and run the check against that value.

For predicate rules, supported `aggregate.mode` values are:

- `ANY` — predicate is true if at least one matched field evaluates to true; this is the default for wildcard predicate rules.
- `ALL` — predicate is true only if every matched field evaluates to true.
- `COUNT` — count true predicate evaluations and compare the count with `aggregate.op` and `aggregate.value`.

Supported `aggregate.op` values for `COUNT` are `==`, `=`, `!=`, `>`, `>=`, `<`, `<=`.

When a wildcard pattern matches no concrete payload fields, behavior is controlled by `aggregate.onEmpty`.

For check rules:

- `PASS` — treat empty match set as successful; this is the default.
- `FAIL` — emit a failed check on the wildcard field with `meta.reason = "WILDCARD_EMPTY"`.
- `ERROR` — abort runtime evaluation with a runtime error.

For predicate rules:

- `FALSE` — treat empty match set as false.
- `TRUE` — treat empty match set as true.
- `UNDEFINED` — treat empty match set as undefined, which is false in condition evaluation; this is the default.
- `ERROR` — abort runtime evaluation with a runtime error.

Canonical example:

```json
{
  "id": "library.tax.foreign_country_required",
  "type": "rule",
  "description": "Every foreign tax residency must contain country code",
  "role": "check",
  "operator": "not_empty",
  "field": "beneficiary.tax.foreignResidencies[*].countryCode",
  "aggregate": {
    "mode": "EACH",
    "onEmpty": "FAIL"
  },
  "level": "EXCEPTION",
  "code": "BEN.TAX.FOREIGN_COUNTRY.REQUIRED",
  "message": "Foreign tax residency country code is required"
}
```

For the payload:

```json
{
  "beneficiary": {
    "tax": {
      "foreignResidencies": [
        { "countryCode": "TJ" }
      ]
    }
  }
}
```

the rule evaluates the concrete field `beneficiary.tax.foreignResidencies[0].countryCode` and passes.

If the array is empty or no concrete `countryCode` fields exist, the same rule fails with `WILDCARD_EMPTY` because `onEmpty` is `FAIL`.

#### `any_filled` with wildcard `fields[]`

`any_filled` is a built-in check operator over a `fields[]` list. It supports two normative modes:

1. Explicit fields without wildcard — the rule passes when at least one listed field is present and non-empty.
2. Wildcard fields with the same array base — the rule groups listed sibling fields by concrete array element and applies `any_filled` inside each group.

Canonical grouped wildcard example:

```json
{
  "id": "library.tax.foreign_tin_or_reason",
  "type": "rule",
  "description": "Every foreign tax residency must contain TIN or absence reason",
  "role": "check",
  "operator": "any_filled",
  "fields": [
    "beneficiary.tax.foreignResidencies[*].tin",
    "beneficiary.tax.foreignResidencies[*].tinAbsenceReason"
  ],
  "aggregate": {
    "mode": "EACH",
    "onEmpty": "FAIL"
  },
  "level": "EXCEPTION",
  "code": "BEN.TAX.FOREIGN_TIN_OR_REASON.REQUIRED",
  "message": "Foreign tax residency TIN or absence reason is required"
}
```

This means:

```text
for each beneficiary.tax.foreignResidencies[i]:
  tin OR tinAbsenceReason must be filled
```

For payload:

```json
{
  "beneficiary": {
    "tax": {
      "foreignResidencies": [
        { "countryCode": "TJ", "tin": "123" },
        { "countryCode": "KZ", "tinAbsenceReason": "NOT_ASSIGNED" },
        { "countryCode": "UZ" }
      ]
    }
  }
}
```

the first two groups pass and the third group fails. The emitted issue points to the concrete array element:

```json
{
  "field": "beneficiary.tax.foreignResidencies[2]",
  "meta": {
    "reason": "ANY_FILLED_GROUP_EMPTY",
    "patterns": [
      "beneficiary.tax.foreignResidencies[*].tin",
      "beneficiary.tax.foreignResidencies[*].tinAbsenceReason"
    ],
    "indexes": [2]
  }
}
```

Rules for wildcard `any_filled`:

- all `fields[]` entries must contain wildcard segments; mixing wildcard and non-wildcard fields in one rule is a compile-time error;
- all wildcard fields must share the same wildcard base pattern, for example `beneficiary.tax.foreignResidencies[*]`;
- supported `aggregate.mode` values are `EACH` and `ALL`;
- if no array groups are found, `aggregate.onEmpty` follows the check wildcard policy (`PASS` by default, `FAIL` emits `WILDCARD_EMPTY`, `ERROR` aborts runtime evaluation);
- nested wildcard bases are supported when all fields share the same nested base, for example `accounts[*].transactions[*]`.

## 11. Compile semantics

### 11.1. `validateRules(source, options?)`

`validateRules(...)` performs compile-time validation and returns:

- `ok`
- `diagnostics`

Normative behavior:

- it never throws only because source is invalid
- it validates structural assumptions of source and artifacts
- it validates semantic assumptions such as ids, refs, artifact types, step shapes, and operator availability
- it returns machine-readable diagnostics
- `ok = true` means no compile-blocking diagnostics were found

### 11.2. `prepareRules(source, options?)`

`prepareRules(...)` performs the same validation path and additionally:

- binds the effective operator registry
- resolves references needed for runtime execution
- constructs the prepared artifact

Normative behavior:

- it throws `RulesCompileError` if compile failure exists
- it does not return a prepared artifact on invalid compile state
- it is the normative production path for building runtime-ready artifacts

### 11.3. Compile diagnostics

Diagnostics are machine-readable objects with at least:

| Field | Required | Meaning |
|---|---:|---|
| `code` | yes | Stable diagnostic code |
| `level` | yes | Severity level |
| `message` | yes | Human-readable message |
| `path` | yes | Source location path |
| `details` | no | Additional structured details |

Compile diagnostics may describe:

- invalid source shape
- duplicate ids
- unresolved references
- invalid artifact fields
- unknown operators
- invalid operator configuration
- invalid flow structure

## 12. Prepared artifact contract

A prepared artifact is the only valid input for `evaluateRules(...)`.

The documented public shape is intentionally minimal:

| Field | Meaning |
|---|---|
| `kind` | Constant marker: `'prepared-rules'` |
| `artifactType` | Constant marker: `'rules'` |
| `version` | Artifact/runtime version marker |
| `diagnostics` | Compile diagnostics attached to prepared artifact contract |

Normative rules:

- the public artifact behaves as immutable
- internal runtime-ready state is intentionally not part of the public contract
- runtime relies on preparation-time binding already captured by the artifact
- hidden compile inside `evaluateRules(...)` is forbidden

## 13. Runtime input model

`evaluateRules(...)` accepts:

- a prepared artifact
- an input object with the following shape

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `pipelineId` | `string` | no | Explicit pipeline/entrypoint selection |
| `payload` | `object` | yes | Runtime payload |
| `context` | `object` | no | Optional runtime context |

Runtime pipeline selection rules:

- if `pipelineId` is explicitly provided, runtime uses it
- otherwise runtime may use `input.context.pipelineId`
- if source has only one usable entrypoint, runtime may use that single entrypoint
- if runtime cannot determine a valid pipeline, this is a runtime failure or abort path according to the runtime contract

## 14. Runtime semantics

Normative runtime behavior:

- execution starts from the selected pipeline
- pipeline flow is processed in declared order
- nested pipeline or condition references are evaluated through the prepared runtime model
- issues accumulate into the runtime result according to executed checks
- strict or control-related pipeline settings may affect status/control escalation
- runtime does not mutate the prepared artifact
- runtime does not perform hidden compile, ref repair, or operator rebinding

Special-case rules:

- missing runtime payload fields are handled through operator and rule semantics, not through hidden payload rewriting
- absent optional context does not become a compile problem; it only matters if runtime selection or runtime logic needs it
- transport-safe normalization is part of the library result contract, not a host responsibility

## 15. Runtime result contract

The public runtime result is transport-safe / JSON-safe by normative shape.

This means:

- no public `undefined` values
- no functions, classes, symbols, bigint values or cyclic structures
- deterministic shape on documented fields
- semantic meaning survives JSON serialization and parsing
- result is suitable for direct downstream ProcessEngine use without host-side cleanup

Normative result fields:

| Field | Required | Meaning |
|---|---:|---|
| `status` | yes | Validation execution status |
| `control` | yes | Runtime control signal |
| `issues` | yes | Structured issue array |
| `trace` | no | Structured trace when trace is enabled |
| `error` | abort-only | Runtime abort payload |

Documented status values:

- `OK`
- `OK_WITH_WARNINGS`
- `ERROR`
- `EXCEPTION`
- `ABORT`

Documented control values:

- `CONTINUE`
- `STOP`

Normative rules:

- fields that are logically absent are omitted or normalized to contract-safe values
- `issues` is always part of the public result contract
- `error` appears only on abort-like runtime failure contract
- downstream libraries must not require `JSON.parse(JSON.stringify(...))` or similar cleanup before consuming this result

## 16. Issue shape

Each item in `issues` is a structured validation issue. The exact issue vocabulary depends on the source artifact, but the public issue model is expected to include fields such as:

- `level`
- `code`
- `message`
- `field` or equivalent target path when applicable
- `ruleId` or equivalent origin reference when applicable

Issue objects are part of the runtime result and must remain JSON-safe.

## 17. Errors

### 17.1. `RulesCompileError`

`RulesCompileError` is thrown only by `prepareRules(...)` when the source cannot be prepared.

It contains:

- `code`
- `message`
- `diagnostics`
- optional `cause`

### 17.2. `RulesRuntimeError`

`RulesRuntimeError` is used for runtime failures.

It contains:

- `code`
- `message`
- optional `details`
- optional `cause`

Normative rule:

- compile problems are not returned as success-path runtime results
- runtime failures are not a substitute for compile validation defects

## 18. Trace semantics

Supported trace modes:

- `false`
- `'basic'`
- `'verbose'`

| Mode | Meaning |
|---|---|
| `false` | Trace is omitted |
| `basic` | Compact execution events without raw payload fragments |
| `verbose` | Extended execution events and optional event `input/output` |

Trace events follow the documented family-level contract shape and may include:

- `kind`
- `artifactType`
- `artifactId`
- `step`
- `at`
- `outcome`
- optional `details`
- optional `input`
- optional `output`

The host may pass `traceRedactor(value, mode)` to redact values before they appear in verbose trace.

## 19. Special and boundary cases

This library explicitly cares about the following boundary cases:

- invalid or missing pipeline selection
- missing payload fields required by operator semantics
- empty values and empty collections
- unresolved references at compile time
- unknown operators
- invalid operator configuration
- absent optional context
- strict pipeline escalation behavior
- transport-safe normalization of the final public runtime result

If a behavior materially affects compile/runtime semantics, it must be documented here or in the relevant artifact/operator section and must not remain knowable only from source code.

## 20. Normative examples

### 20.1. Minimal valid source

```json
{
  "artifacts": [
    {
      "id": "library.person.first_name_required",
      "type": "rule",
      "description": "First name must be filled",
      "role": "check",
      "operator": "not_empty",
      "field": "person.firstName",
      "level": "ERROR",
      "code": "PERSON.FIRST_NAME.REQUIRED",
      "message": "First name is required"
    },
    {
      "id": "entry.registration",
      "type": "pipeline",
      "description": "Registration validation",
      "entrypoint": true,
      "strict": false,
      "flow": [
        { "rule": "library.person.first_name_required" }
      ]
    }
  ]
}
```

### 20.2. Minimal runtime call

```js
const artifact = prepareRules(source);
const result = evaluateRules(artifact, {
  pipelineId: 'entry.registration',
  payload: { person: { firstName: '' } },
});
```

### 20.3. Typical runtime result shape

```json
{
  "status": "ERROR",
  "control": "STOP",
  "issues": [
    {
      "level": "ERROR",
      "code": "PERSON.FIRST_NAME.REQUIRED",
      "message": "First name is required",
      "field": "person.firstName",
      "ruleId": "library.person.first_name_required"
    }
  ]
}
```

### 20.4. Direct downstream handoff

The following family path is normative and must not require host-side technical cleanup:

```js
const rulesResult = evaluateRules(rulesArtifact, input);
const factsOutput = executeMappings(mappingsArtifact, { payload: rulesResult });
```

The result of `evaluateRules(...)` is expected to be transport-safe for this direct handoff.

## 21. Limitations and non-goals

`@processengine/rules` does not:

- replace data normalization and fact construction
- choose final business outcomes
- orchestrate long-running process steps
- define all downstream meaning of issues beyond the documented result contract

## 22. Compatibility guarantees

The public compatibility surface includes:

- exported API names and signatures
- source artifact fields documented in this specification
- prepared artifact public contract
- runtime result shape
- diagnostics shape
- documented trace contract
- transport-safe / JSON-safe runtime-result behavior

Breaking change means incompatible change to any of the documented public guarantees above.
