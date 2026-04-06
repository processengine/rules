import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  assert,
  deepCloneJsonSafe,
  deepFreeze,
  isObject,
  hasOwn,
  makeComparable,
  deepGet,
  flattenPayload,
  detectFlatNestedConflict,
  isWildcardField,
  expandWildcardKeys,
  normalizeWhenExpr,
  stepKind,
  isLibraryRef,
  scopeKeyFor,
  assertSafePath,
} from './internal/utils.js';

const require = createRequire(import.meta.url);
const { Operators: BuiltinOperators } = require('./internal/builtin-operators/index.cjs');

function freezeDiagnostics(diagnostics) {
  return Object.freeze(diagnostics.map((item) => Object.freeze({ ...item })));
}


function normalizeTransportSafeValue(value) {
  if (value === null) return null;
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return value;
  if (kind === 'undefined' || kind === 'function' || kind === 'symbol' || kind === 'bigint') return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeTransportSafeValue(item);
      return normalized === undefined ? null : normalized;
    });
  }
  if (value instanceof Date) return value.toISOString();
  if (!isObject(value)) return undefined;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeTransportSafeValue(item);
    if (normalized !== undefined) out[key] = normalized;
  }
  return out;
}

function toTransportSafeRuntimeResult(result) {
  return normalizeTransportSafeValue(result);
}


function makeDiagnostic({
  code,
  message,
  level = 'error',
  path = null,
  location = null,
  details = null,
  phase = null,
  artifactId = null,
  pipelineId = null,
  ruleId = null,
}) {
  return Object.freeze({
    code,
    level,
    message,
    path,
    location,
    details,
    phase,
    artifactId,
    pipelineId,
    ruleId,
  });
}

function hasDiagnosticErrors(diagnostics) {
  return diagnostics.some((item) => item.level === 'error');
}

export class RulesCompileError extends Error {
  constructor(diagnostics, message = null, cause = undefined) {
    const lines = (Array.isArray(diagnostics) ? diagnostics : []).map((d, i) => `  ${i + 1}. ${formatRulesDiagnostics([d])}`).join('\n');
    super(message || `Rules preparation failed with ${(diagnostics || []).length} diagnostic(s).${lines ? `\n${lines}` : ''}`, { cause });
    this.name = 'RulesCompileError';
    this.code = 'RULES_COMPILE_ERROR';
    this.diagnostics = freezeDiagnostics(Array.isArray(diagnostics) ? diagnostics : []);
    this.cause = cause;
  }
}

export class RulesRuntimeError extends Error {
  constructor({ code = 'RULES_RUNTIME_ERROR', message = 'Rules evaluation failed', details = null, cause = undefined } = {}) {
    super(message, { cause });
    this.name = 'RulesRuntimeError';
    this.code = code;
    this.details = details;
    this.cause = cause;
  }
}

export function formatRulesDiagnostics(diagnostics) {
  const list = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
  return list.map((d) => {
    const parts = [`[${String(d.level || 'error').toUpperCase()}]`, d.code];
    if (d.phase) parts.push(`phase=${d.phase}`);
    if (d.artifactId) parts.push(`artifact=${d.artifactId}`);
    if (d.ruleId) parts.push(`rule=${d.ruleId}`);
    if (d.pipelineId) parts.push(`pipeline=${d.pipelineId}`);
    if (d.path) parts.push(`path=${d.path}`);
    return `${parts.join(' ')} — ${d.message}`;
  }).join('\n');
}

export function formatRulesRuntimeError(error) {
  if (!error) return '';
  const parts = [error.code || 'RULES_RUNTIME_ERROR', error.message || 'Runtime error'];
  if (error.details) parts.push(JSON.stringify(error.details));
  return parts.join(' | ');
}

function normalizeOperatorPack(operators) {
  if (operators == null) return { check: {}, predicate: {} };
  if (!isObject(operators)) throw new Error('options.operators must be an object with check/predicate maps');
  return {
    check: isObject(operators.check) ? { ...operators.check } : {},
    predicate: isObject(operators.predicate) ? { ...operators.predicate } : {},
  };
}

function buildEffectiveOperatorRegistry(customOperators) {
  const builtin = {
    check: { ...BuiltinOperators.check },
    predicate: { ...BuiltinOperators.predicate },
  };
  const external = normalizeOperatorPack(customOperators);
  return Object.freeze({
    check: Object.freeze({ ...builtin.check, ...external.check }),
    predicate: Object.freeze({ ...builtin.predicate, ...external.predicate }),
  });
}

function cloneSourceArtifacts(source) {
  if (!isObject(source)) throw new Error('rules source must be an object');
  if (!Array.isArray(source.artifacts)) throw new Error('rules source.artifacts must be an array');
  return source.artifacts.map((artifact, index) => deepFreeze(deepCloneJsonSafe(artifact, `$source.artifacts[${index}]`)));
}

function inferPipelineFromId(id) {
  if (typeof id !== 'string' || !id.includes('.')) {
    throw new Error(`Condition id must contain pipeline scope: ${id}`);
  }
  return id.slice(0, id.lastIndexOf('.'));
}

function resolveRef(kind, ref, scopePipelineId) {
  assert(typeof ref === 'string' && ref.length > 0, `${kind} ref must be a non-empty string`);
  if (isLibraryRef(ref)) return ref;
  if (ref.includes('.')) return ref;
  assert(scopePipelineId, `Cannot resolve scoped ${kind} ref without pipeline scope`);
  return scopeKeyFor(scopePipelineId, ref);
}

function buildRegistry(artifacts) {
  const registry = new Map();
  const dictionaries = new Map();
  const entrypoints = new Map();
  const diagnostics = [];

  for (const artifact of artifacts) {
    if (!isObject(artifact)) {
      diagnostics.push(makeDiagnostic({ code: 'ARTIFACT_MUST_BE_OBJECT', message: 'Each artifact must be an object', phase: 'registry_build', path: null, level: 'error' }));
      continue;
    }
    if (typeof artifact.id !== 'string' || artifact.id.length === 0) {
      diagnostics.push(makeDiagnostic({ code: 'ARTIFACT_ID_REQUIRED', message: 'Artifact id is required', phase: 'registry_build', artifactId: null, path: 'id', level: 'error' }));
      continue;
    }
    if (registry.has(artifact.id)) {
      diagnostics.push(makeDiagnostic({ code: 'DUPLICATE_ARTIFACT_ID', message: `Duplicate artifact id: ${artifact.id}`, phase: 'registry_build', artifactId: artifact.id, path: 'id', level: 'error' }));
      continue;
    }
    registry.set(artifact.id, artifact);
    if (artifact.type === 'dictionary') dictionaries.set(artifact.id, artifact);
    if (artifact.type === 'pipeline' && artifact.entrypoint === true) entrypoints.set(artifact.id, artifact);
  }

  return { registry, dictionaries, entrypoints, diagnostics };
}

const LEVELS = new Set(['WARNING', 'ERROR', 'EXCEPTION']);
const CHECK_AGGREGATE_MODES = new Set(['EACH', 'ALL', 'COUNT', 'MIN', 'MAX']);
const PREDICATE_AGGREGATE_MODES = new Set(['ANY', 'ALL', 'COUNT']);
const FIELD_COMPARE_OPERATORS = new Set([
  'field_less_than_field',
  'field_greater_than_field',
  'field_equals_field',
  'field_not_equals_field',
  'field_less_or_equal_than_field',
  'field_greater_or_equal_than_field',
]);

function validateDictionarySchema(artifact) {
  const diagnostics = [];
  if (typeof artifact.description !== 'string' || artifact.description.length === 0) {
    diagnostics.push(makeDiagnostic({ code: 'DESCRIPTION_REQUIRED', message: 'Artifact description is required', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'description' }));
  }
  if (!Array.isArray(artifact.entries)) {
    diagnostics.push(makeDiagnostic({ code: 'DICTIONARY_ENTRIES_REQUIRED', message: 'Dictionary entries must be an array', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'entries' }));
  }
  return diagnostics;
}

function validatePipelineSchema(artifact) {
  const diagnostics = [];
  if (typeof artifact.description !== 'string' || artifact.description.length === 0) diagnostics.push(makeDiagnostic({ code: 'DESCRIPTION_REQUIRED', message: 'Artifact description is required', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'description' }));
  if (!Array.isArray(artifact.flow) || artifact.flow.length === 0) diagnostics.push(makeDiagnostic({ code: 'PIPELINE_FLOW_REQUIRED', message: 'Pipeline flow must be a non-empty array', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'flow' }));
  if (typeof artifact.entrypoint !== 'boolean') diagnostics.push(makeDiagnostic({ code: 'PIPELINE_ENTRYPOINT_REQUIRED', message: 'Pipeline entrypoint must be explicitly set to true or false', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'entrypoint' }));
  if (typeof artifact.strict !== 'boolean') diagnostics.push(makeDiagnostic({ code: 'PIPELINE_STRICT_REQUIRED', message: 'Pipeline strict must be explicitly set to true or false', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'strict' }));
  if (artifact.strict === true && (typeof artifact.message !== 'string' || artifact.message.length === 0)) diagnostics.push(makeDiagnostic({ code: 'PIPELINE_STRICT_MESSAGE_REQUIRED', message: 'Pipeline message is required when strict=true', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'message' }));
  if (artifact.strict === true && artifact.strictCode !== undefined && (typeof artifact.strictCode !== 'string' || artifact.strictCode.length === 0)) diagnostics.push(makeDiagnostic({ code: 'PIPELINE_STRICT_CODE_INVALID', message: 'Pipeline strictCode must be a non-empty string when provided', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'strictCode' }));
  if (artifact.required_context !== undefined && (!Array.isArray(artifact.required_context) || artifact.required_context.some((item) => typeof item !== 'string' || item.length === 0))) {
    diagnostics.push(makeDiagnostic({ code: 'PIPELINE_REQUIRED_CONTEXT_INVALID', message: 'Pipeline required_context must be an array of non-empty strings', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'required_context' }));
  }
  if (Array.isArray(artifact.flow)) {
    artifact.flow.forEach((step, index) => {
      if (!isObject(step)) diagnostics.push(makeDiagnostic({ code: 'STEP_MUST_BE_OBJECT', message: 'Each pipeline step must be an object', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: `flow.${index}` }));
      else {
        try { stepKind(step); } catch (error) { diagnostics.push(makeDiagnostic({ code: 'STEP_KIND_INVALID', message: error.message, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: `flow.${index}` })); }
      }
    });
  }
  return diagnostics;
}

function validateConditionSchema(artifact) {
  const diagnostics = [];
  if (typeof artifact.description !== 'string' || artifact.description.length === 0) diagnostics.push(makeDiagnostic({ code: 'DESCRIPTION_REQUIRED', message: 'Artifact description is required', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'description' }));
  if (!Array.isArray(artifact.steps) || artifact.steps.length === 0) diagnostics.push(makeDiagnostic({ code: 'CONDITION_STEPS_REQUIRED', message: 'Condition steps must be a non-empty array', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'steps' }));
  try { normalizeWhenExpr(artifact.when); } catch (error) { diagnostics.push(makeDiagnostic({ code: 'CONDITION_WHEN_INVALID', message: error.message, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'when' })); }
  if (Array.isArray(artifact.steps)) {
    artifact.steps.forEach((step, index) => {
      if (!isObject(step)) diagnostics.push(makeDiagnostic({ code: 'STEP_MUST_BE_OBJECT', message: 'Each condition step must be an object', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: `steps.${index}` }));
      else {
        try { stepKind(step); } catch (error) { diagnostics.push(makeDiagnostic({ code: 'STEP_KIND_INVALID', message: error.message, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: `steps.${index}` })); }
      }
    });
  }
  return diagnostics;
}

function validateOptionalAggregate(artifact) {
  const diagnostics = [];
  if (artifact.aggregate === undefined) return diagnostics;
  if (!isObject(artifact.aggregate)) {
    diagnostics.push(makeDiagnostic({ code: 'AGGREGATE_INVALID', message: 'aggregate must be an object', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'aggregate' }));
    return diagnostics;
  }
  const mode = artifact.aggregate.mode;
  if (mode !== undefined) {
    const allowed = artifact.role === 'check' ? CHECK_AGGREGATE_MODES : PREDICATE_AGGREGATE_MODES;
    if (!allowed.has(mode)) diagnostics.push(makeDiagnostic({ code: 'AGGREGATE_MODE_INVALID', message: `Unsupported aggregate.mode: ${mode}`, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'aggregate.mode' }));
  }
  if (artifact.aggregate.op !== undefined && !['==', '=', '!=', '>', '>=', '<', '<='].includes(artifact.aggregate.op)) diagnostics.push(makeDiagnostic({ code: 'AGGREGATE_OP_INVALID', message: 'aggregate.op must be one of ==, =, !=, >, >=, <, <=', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'aggregate.op' }));
  if (artifact.aggregate.summaryIssue !== undefined && typeof artifact.aggregate.summaryIssue !== 'boolean') diagnostics.push(makeDiagnostic({ code: 'AGGREGATE_SUMMARY_ISSUE_INVALID', message: 'aggregate.summaryIssue must be boolean', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'aggregate.summaryIssue' }));
  if (artifact.aggregate.value !== undefined && typeof artifact.aggregate.value !== 'number') diagnostics.push(makeDiagnostic({ code: 'AGGREGATE_VALUE_INVALID', message: 'aggregate.value must be a number', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'aggregate.value' }));
  return diagnostics;
}

function validateRuleSchema(artifact, dictionaries, operatorRegistry) {
  const diagnostics = [];
  if (typeof artifact.description !== 'string' || artifact.description.length === 0) diagnostics.push(makeDiagnostic({ code: 'DESCRIPTION_REQUIRED', message: 'Artifact description is required', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'description' }));
  if (artifact.role !== 'check' && artifact.role !== 'predicate') {
    diagnostics.push(makeDiagnostic({ code: 'RULE_ROLE_INVALID', message: 'Rule role must be check or predicate', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'role' }));
    return diagnostics;
  }
  if (typeof artifact.operator !== 'string' || artifact.operator.length === 0) {
    diagnostics.push(makeDiagnostic({ code: 'RULE_OPERATOR_REQUIRED', message: 'Rule operator is required', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'operator' }));
    return diagnostics;
  }
  if (typeof artifact.field === 'string') {
    try { assertSafePath(artifact.field); } catch (error) { diagnostics.push(makeDiagnostic({ code: 'DANGEROUS_PATH_SEGMENT', message: error.message, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'field' })); }
  }
  if (typeof artifact.value_field === 'string') {
    try { assertSafePath(artifact.value_field); } catch (error) { diagnostics.push(makeDiagnostic({ code: 'DANGEROUS_PATH_SEGMENT', message: error.message, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'value_field' })); }
  }
  if (artifact.role === 'check') {
    if (!LEVELS.has(artifact.level)) diagnostics.push(makeDiagnostic({ code: 'CHECK_LEVEL_INVALID', message: 'Check rule level must be WARNING, ERROR or EXCEPTION', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'level' }));
    if (typeof artifact.code !== 'string' || artifact.code.length === 0) diagnostics.push(makeDiagnostic({ code: 'CHECK_CODE_REQUIRED', message: 'Check rule code is required', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'code' }));
    if (typeof artifact.message !== 'string' || artifact.message.length === 0) diagnostics.push(makeDiagnostic({ code: 'CHECK_MESSAGE_REQUIRED', message: 'Check rule message is required', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'message' }));
    if (!operatorRegistry.check[artifact.operator]) diagnostics.push(makeDiagnostic({ code: 'UNKNOWN_CHECK_OPERATOR', message: `Unknown check operator: ${artifact.operator}`, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'operator' }));
  } else {
    if (artifact.level !== undefined || artifact.code !== undefined || artifact.message !== undefined) diagnostics.push(makeDiagnostic({ code: 'PREDICATE_FORBIDDEN_FIELDS', message: 'Predicate rule must not define level, code or message', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: null }));
    if (!operatorRegistry.predicate[artifact.operator]) diagnostics.push(makeDiagnostic({ code: 'UNKNOWN_PREDICATE_OPERATOR', message: `Unknown predicate operator: ${artifact.operator}`, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'operator' }));
  }
  if (artifact.operator === 'any_filled') {
    const fields = Array.isArray(artifact.fields) ? artifact.fields : Array.isArray(artifact.paths) ? artifact.paths : null;
    if (!Array.isArray(fields) || fields.length === 0) diagnostics.push(makeDiagnostic({ code: 'ANY_FILLED_FIELDS_REQUIRED', message: 'any_filled requires fields[]', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'fields' }));
  }
  if (artifact.operator === 'in_dictionary') {
    if (!artifact.dictionary || artifact.dictionary.type !== 'static' || typeof artifact.dictionary.id !== 'string') diagnostics.push(makeDiagnostic({ code: 'DICTIONARY_REF_INVALID', message: 'in_dictionary requires dictionary { type: static, id }', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'dictionary' }));
    else if (!dictionaries.has(artifact.dictionary.id)) diagnostics.push(makeDiagnostic({ code: 'DICTIONARY_NOT_FOUND', message: `Dictionary not found: ${artifact.dictionary.id}`, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'dictionary.id' }));
  }
  if (artifact.operator === 'matches_regex') {
    if (typeof artifact.value !== 'string' || artifact.value.length === 0) diagnostics.push(makeDiagnostic({ code: 'MATCHES_REGEX_VALUE_REQUIRED', message: 'matches_regex requires string value', level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'value' }));
    else {
      try { new RegExp(artifact.value, artifact.flags || ''); } catch (error) { diagnostics.push(makeDiagnostic({ code: 'MATCHES_REGEX_INVALID', message: error.message, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'value' })); }
    }
  }
  if (FIELD_COMPARE_OPERATORS.has(artifact.operator)) {
    if (typeof artifact.field !== 'string' || typeof artifact.value_field !== 'string') diagnostics.push(makeDiagnostic({ code: 'FIELD_COMPARE_REQUIRES_VALUE_FIELD', message: `${artifact.operator} requires field and value_field`, level: 'error', phase: 'schema_validation', artifactId: artifact.id, path: 'value_field' }));
  }
  diagnostics.push(...validateOptionalAggregate(artifact));
  return diagnostics;
}

function validateCodeUniqueness(artifacts) {
  const diagnostics = [];
  const seenCodes = new Map();
  for (const artifact of artifacts) {
    if (artifact.type !== 'rule' || artifact.role !== 'check' || typeof artifact.code !== 'string') continue;
    if (seenCodes.has(artifact.code)) {
      diagnostics.push(makeDiagnostic({ code: 'DUPLICATE_CHECK_CODE', message: `Duplicate check code: ${artifact.code}`, level: 'error', phase: 'uniqueness_validation', artifactId: artifact.id, path: 'code', details: { firstArtifactId: seenCodes.get(artifact.code) } }));
    } else {
      seenCodes.set(artifact.code, artifact.id);
    }
  }
  return diagnostics;
}

function validateSchema(artifacts, dictionaries, operatorRegistry) {
  const diagnostics = [];
  for (const artifact of artifacts) {
    if (!isObject(artifact)) continue;
    if (artifact.type === 'pipeline') diagnostics.push(...validatePipelineSchema(artifact));
    else if (artifact.type === 'condition') diagnostics.push(...validateConditionSchema(artifact));
    else if (artifact.type === 'rule') diagnostics.push(...validateRuleSchema(artifact, dictionaries, operatorRegistry));
    else if (artifact.type === 'dictionary') diagnostics.push(...validateDictionarySchema(artifact));
    else diagnostics.push(makeDiagnostic({ code: 'UNKNOWN_ARTIFACT_TYPE', message: `Unknown artifact type: ${artifact.type}`, level: 'error', phase: 'schema_validation', artifactId: artifact.id || null, path: 'type' }));
  }
  return diagnostics;
}

function validateRefs(artifacts, registry) {
  const diagnostics = [];
  for (const artifact of artifacts) {
    if (!isObject(artifact)) continue;
    if (artifact.type === 'pipeline') {
      for (let index = 0; index < (artifact.flow || []).length; index += 1) {
        const step = artifact.flow[index];
        if (!isObject(step)) continue;
        const kind = stepKind(step);
        if (kind === 'pipeline') {
          if (!registry.has(step.pipeline) || registry.get(step.pipeline).type !== 'pipeline') diagnostics.push(makeDiagnostic({ code: 'PIPELINE_REF_NOT_FOUND', message: `Pipeline not found: ${step.pipeline}`, level: 'error', phase: 'reference_validation', artifactId: artifact.id, path: `flow.${index}.pipeline`, pipelineId: artifact.id }));
          continue;
        }
        const target = kind === 'rule' ? resolveRef('rule', step.rule, artifact.id) : resolveRef('condition', step.condition, artifact.id);
        if (!registry.has(target)) diagnostics.push(makeDiagnostic({ code: kind === 'rule' ? 'RULE_REF_NOT_FOUND' : 'CONDITION_REF_NOT_FOUND', message: `${kind === 'rule' ? 'Rule' : 'Condition'} not found: ${target}`, level: 'error', phase: 'reference_validation', artifactId: artifact.id, path: `flow.${index}.${kind}`, pipelineId: artifact.id }));
      }
    }
    if (artifact.type === 'condition') {
      let scopePipelineId;
      try { scopePipelineId = inferPipelineFromId(artifact.id); } catch (error) { diagnostics.push(makeDiagnostic({ code: 'CONDITION_SCOPE_INVALID', message: error.message, level: 'error', phase: 'reference_validation', artifactId: artifact.id, path: 'id' })); continue; }
      const checkWhen = (expr, path) => {
        if (expr.mode === 'single') {
          const resolved = resolveRef('rule', expr.pred, scopePipelineId);
          const target = registry.get(resolved);
          if (!target) diagnostics.push(makeDiagnostic({ code: 'WHEN_RULE_REF_NOT_FOUND', message: `Predicate rule not found: ${resolved}`, level: 'error', phase: 'reference_validation', artifactId: artifact.id, path }));
          else if (target.type !== 'rule' || target.role !== 'predicate') diagnostics.push(makeDiagnostic({ code: 'WHEN_RULE_MUST_BE_PREDICATE', message: `Condition when ref must point to predicate rule: ${resolved}`, level: 'error', phase: 'reference_validation', artifactId: artifact.id, path }));
          return;
        }
        expr.items.forEach((item, index) => checkWhen(item, `${path}.${expr.mode}.${index}`));
      };
      checkWhen(normalizeWhenExpr(artifact.when), 'when');
      for (let index = 0; index < (artifact.steps || []).length; index += 1) {
        const step = artifact.steps[index];
        if (!isObject(step)) continue;
        const kind = stepKind(step);
        if (kind === 'pipeline') {
          if (!registry.has(step.pipeline) || registry.get(step.pipeline).type !== 'pipeline') diagnostics.push(makeDiagnostic({ code: 'PIPELINE_REF_NOT_FOUND', message: `Pipeline not found: ${step.pipeline}`, level: 'error', phase: 'reference_validation', artifactId: artifact.id, path: `steps.${index}.pipeline` }));
          continue;
        }
        const targetId = kind === 'rule' ? resolveRef('rule', step.rule, scopePipelineId) : resolveRef('condition', step.condition, scopePipelineId);
        if (!registry.has(targetId)) diagnostics.push(makeDiagnostic({ code: kind === 'rule' ? 'RULE_REF_NOT_FOUND' : 'CONDITION_REF_NOT_FOUND', message: `${kind === 'rule' ? 'Rule' : 'Condition'} not found: ${targetId}`, level: 'error', phase: 'reference_validation', artifactId: artifact.id, path: `steps.${index}.${kind}` }));
      }
    }
  }
  return diagnostics;
}

function compileWhenExpr(expr, scopePipelineId) {
  if (expr.mode === 'single') return { mode: 'single', predId: resolveRef('rule', expr.pred, scopePipelineId) };
  return { mode: expr.mode, items: expr.items.map((item) => compileWhenExpr(item, scopePipelineId)) };
}

function compileSteps(steps, scopePipelineId) {
  return steps.map((step) => {
    const kind = stepKind(step);
    const stepId = step.stepId;
    if (kind === 'rule') return { kind: 'rule', stepId, ruleId: resolveRef('rule', step.rule, scopePipelineId), ref: step.rule };
    if (kind === 'condition') return { kind: 'condition', stepId, conditionId: resolveRef('condition', step.condition, scopePipelineId), ref: step.condition };
    return { kind: 'pipeline', stepId, pipelineId: step.pipeline };
  });
}

function buildConditions(artifacts) {
  const compiledConditions = new Map();
  for (const artifact of artifacts) {
    if (artifact.type !== 'condition') continue;
    const scopePipelineId = inferPipelineFromId(artifact.id);
    const when = normalizeWhenExpr(artifact.when);
    compiledConditions.set(artifact.id, {
      when: compileWhenExpr(when, scopePipelineId),
      steps: compileSteps(artifact.steps, scopePipelineId),
      scopePipelineId,
    });
  }
  return compiledConditions;
}

function buildPipelines(artifacts) {
  const compiledPipelines = new Map();
  for (const artifact of artifacts) {
    if (artifact.type !== 'pipeline') continue;
    compiledPipelines.set(artifact.id, { steps: compileSteps(artifact.flow, artifact.id), scopePipelineId: artifact.id });
  }
  return compiledPipelines;
}

function validatePipelineDAG(registry, compiledPipelines, compiledConditions) {
  const diagnostics = [];
  const visiting = new Set();
  const visited = new Set();

  function visitPipeline(pipelineId, stack = []) {
    if (visited.has(pipelineId)) return;
    if (visiting.has(pipelineId)) {
      diagnostics.push(makeDiagnostic({ code: 'PIPELINE_CYCLE', message: `Pipeline cycle detected: ${[...stack, pipelineId].join(' -> ')}`, level: 'error', phase: 'dag_validation', artifactId: pipelineId, pipelineId }));
      return;
    }
    visiting.add(pipelineId);
    const compiledPipeline = compiledPipelines.get(pipelineId);
    if (compiledPipeline) {
      for (const step of compiledPipeline.steps) {
        if (step.kind === 'pipeline') visitPipeline(step.pipelineId, [...stack, pipelineId]);
        if (step.kind === 'condition') visitCondition(step.conditionId, [...stack, pipelineId]);
      }
    }
    visiting.delete(pipelineId);
    visited.add(pipelineId);
  }

  function visitCondition(conditionId, stack = []) {
    const compiledCondition = compiledConditions.get(conditionId);
    if (!compiledCondition) return;
    for (const step of compiledCondition.steps) {
      if (step.kind === 'pipeline') visitPipeline(step.pipelineId, [...stack, conditionId]);
    }
  }

  for (const [pipelineId] of compiledPipelines) visitPipeline(pipelineId, []);
  return diagnostics;
}

function createPreparedArtifact({ artifacts, registry, dictionaries, entrypoints, compiledPipelines, compiledConditions, operatorRegistry, diagnostics }) {
  const publicArtifact = {
    kind: 'prepared-rules',
    artifactType: 'rules',
    version: '2.0.0',
    diagnostics: freezeDiagnostics(diagnostics),
  };
  Object.defineProperties(publicArtifact, {
    __artifacts: { value: artifacts, enumerable: false },
    __registry: { value: registry, enumerable: false },
    __dictionaries: { value: dictionaries, enumerable: false },
    __entrypoints: { value: entrypoints, enumerable: false },
    __pipelines: { value: compiledPipelines, enumerable: false },
    __conditions: { value: compiledConditions, enumerable: false },
    __operators: { value: operatorRegistry, enumerable: false },
    __sourceHash: { value: createHash('sha256').update(JSON.stringify({ artifacts })).digest('hex'), enumerable: false },
  });
  return deepFreeze(publicArtifact);
}

function analyzeSource(source, options = {}) {
  const operatorRegistry = buildEffectiveOperatorRegistry(options.operators);
  const diagnostics = [];
  let artifacts = [];
  try {
    artifacts = cloneSourceArtifacts(source);
  } catch (error) {
    diagnostics.push(makeDiagnostic({ code: 'INVALID_RULES_SOURCE', message: error.message, level: 'error', phase: 'source_validation', path: null, details: { reason: error.code || 'INVALID_SOURCE' } }));
    return { ok: false, diagnostics: freezeDiagnostics(diagnostics), artifacts: [], operatorRegistry };
  }
  const build = buildRegistry(artifacts);
  diagnostics.push(...build.diagnostics);
  diagnostics.push(...validateSchema(artifacts, build.dictionaries, operatorRegistry));
  diagnostics.push(...validateCodeUniqueness(artifacts));
  if (!hasDiagnosticErrors(diagnostics)) {
    diagnostics.push(...validateRefs(artifacts, build.registry));
  }
  let compiledConditions = new Map();
  let compiledPipelines = new Map();
  if (!hasDiagnosticErrors(diagnostics)) {
    compiledConditions = buildConditions(artifacts);
    compiledPipelines = buildPipelines(artifacts);
    diagnostics.push(...validatePipelineDAG(build.registry, compiledPipelines, compiledConditions));
  }
  return {
    ok: !hasDiagnosticErrors(diagnostics),
    diagnostics: freezeDiagnostics(diagnostics),
    artifacts,
    registry: build.registry,
    dictionaries: build.dictionaries,
    entrypoints: build.entrypoints,
    compiledConditions,
    compiledPipelines,
    operatorRegistry,
  };
}

export function validateRules(source, options = {}) {
  const analysis = analyzeSource(source, options);
  return { ok: analysis.ok, diagnostics: analysis.diagnostics };
}

export function prepareRules(source, options = {}) {
  const analysis = analyzeSource(source, options);
  if (!analysis.ok) throw new RulesCompileError(analysis.diagnostics);
  return createPreparedArtifact({
    artifacts: analysis.artifacts,
    registry: analysis.registry,
    dictionaries: analysis.dictionaries,
    entrypoints: analysis.entrypoints,
    compiledPipelines: analysis.compiledPipelines,
    compiledConditions: analysis.compiledConditions,
    operatorRegistry: analysis.operatorRegistry,
    diagnostics: analysis.diagnostics,
  });
}

function normalizeEvaluationInput(artifact, input) {
  if (!artifact || artifact.kind !== 'prepared-rules') throw new RulesRuntimeError({ code: 'INVALID_RULES_ARTIFACT', message: 'evaluateRules expects a prepared rules artifact produced by prepareRules' });
  if (!isObject(input)) throw new RulesRuntimeError({ code: 'INVALID_EVALUATION_INPUT', message: 'evaluateRules input must be an object' });
  const pipelineId = input.pipelineId || (isObject(input.context) ? input.context.pipelineId : null) || (artifact.__entrypoints.size === 1 ? [...artifact.__entrypoints.keys()][0] : null);
  if (!pipelineId) throw new RulesRuntimeError({ code: 'PIPELINE_ID_REQUIRED', message: 'Unable to resolve pipelineId from input or prepared artifact', details: { entrypointCount: artifact.__entrypoints.size } });
  const payload = isObject(input.payload) ? input.payload : hasOwn(input, 'payload') ? input.payload : input;
  const context = isObject(input.context) ? input.context : null;
  return { pipelineId, payload, context };
}

function shouldIncludeTrace(mode) {
  return mode !== false;
}

function traceRecorder(mode, redactor) {
  const trace = [];
  const include = shouldIncludeTrace(mode);
  const redact = typeof redactor === 'function' ? redactor : (value) => value;
  function push(event) {
    if (!include) return;
    const entry = {
      kind: event.kind || 'TRACE',
      artifactType: 'rules',
      artifactId: event.artifactId || null,
      step: event.step,
      at: new Date().toISOString(),
      outcome: event.outcome,
    };
    if (event.details !== undefined) entry.details = redact(event.details, mode);
    if (mode === 'verbose') {
      if (event.input !== undefined) entry.input = redact(event.input, mode);
      if (event.output !== undefined) entry.output = redact(event.output, mode);
    }
    trace.push(Object.freeze(entry));
  }
  return { trace, push };
}

function compareCount(op, left, right) {
  switch (op) {
    case '==':
    case '=': return left === right;
    case '!=': return left !== right;
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    default: throw new Error(`Unsupported COUNT operator: ${op}`);
  }
}

function onEmptyBehavior(rule, fallback) {
  return rule && isObject(rule.aggregate) && typeof rule.aggregate.onEmpty === 'string' ? rule.aggregate.onEmpty : fallback;
}

function checkRequiredContext(pipeline, ctxBase, issues, tracer, stepId = null) {
  const required = Array.isArray(pipeline?.required_context) ? pipeline.required_context : [];
  if (required.length === 0) return false;
  const missing = required.filter((key) => !deepGet(ctxBase.payload, `$context.${key}`).ok);
  if (missing.length === 0) return false;
  for (const key of missing) {
    issues.push({
      kind: 'ISSUE',
      level: 'EXCEPTION',
      code: `CTX.${String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}.REQUIRED`,
      message: `Missing required runtime context field: ${key}`,
      field: `$context.${key}`,
      ruleId: `pipeline:${pipeline.id}`,
      pipelineId: pipeline.id,
      stepId,
    });
  }
  tracer.push({ step: 'context.required', artifactId: pipeline.id, outcome: 'missing_context', details: { missing, stepId } });
  return true;
}

function applyStrictBoundary(pipeline, issues, issuesStart, stepId, tracer) {
  if (!pipeline || pipeline.strict !== true) return false;
  const localIssues = issues.slice(issuesStart);
  const hasErrors = localIssues.some((item) => item && (item.level === 'ERROR' || item.level === 'EXCEPTION'));
  if (!hasErrors) return false;
  const code = pipeline.strictCode || 'STRICT_PIPELINE_FAILED';
  issues.push({ kind: 'ISSUE', level: 'EXCEPTION', code, message: pipeline.message, field: null, ruleId: `pipeline:${pipeline.id}`, pipelineId: pipeline.id, stepId: stepId || undefined });
  tracer.push({ step: 'pipeline.strict', artifactId: pipeline.id, outcome: 'stop', details: { code, stepId } });
  return true;
}

function makeAbortResult(code, message, details, trace) {
  return { status: 'ABORT', control: 'STOP', issues: [], ...(trace ? { trace } : {}), error: { code, message, details: details || null } };
}

function evaluatePredicate(artifact, rule, ctxBase, tracer, scope) {
  const operator = artifact.__operators.predicate[rule.operator];
  const mode = tracer.trace ? true : false;
  const ctx = { ...ctxBase };
  if (isWildcardField(rule.field)) {
    const cacheKey = `pred:${rule.field}`;
    let keys = ctxBase.wildcardCache.get(cacheKey);
    if (!keys) {
      keys = expandWildcardKeys(rule.field, ctxBase.payloadKeys || []);
      ctxBase.wildcardCache.set(cacheKey, keys);
    }
    const aggregateMode = rule.aggregate?.mode || 'ANY';
    if (keys.length === 0) {
      const behavior = onEmptyBehavior(rule, 'UNDEFINED');
      const result = behavior === 'TRUE' ? 'TRUE' : behavior === 'FALSE' ? 'FALSE' : behavior === 'ERROR' ? 'EXCEPTION' : 'FALSE';
      if (behavior === 'ERROR') return { status: 'EXCEPTION', error: new Error(`Wildcard pattern matched 0 fields: ${rule.field}`) };
      tracer.push({ step: 'predicate.aggregate', artifactId: rule.id, outcome: result.toLowerCase(), details: { scope, aggregateMode, matchedCount: 0, onEmpty: behavior } });
      return { status: result };
    }
    const results = [];
    for (const key of keys) {
      const response = operator({ ...rule, field: key, _patternField: rule.field }, ctx);
      if (response.status === 'EXCEPTION') return response;
      results.push(response.status === 'TRUE');
    }
    let finalStatus = 'FALSE';
    let passCount;
    let op;
    let target;
    if (aggregateMode === 'ANY') finalStatus = results.some(Boolean) ? 'TRUE' : 'FALSE';
    else if (aggregateMode === 'ALL') finalStatus = results.every(Boolean) ? 'TRUE' : 'FALSE';
    else if (aggregateMode === 'COUNT') {
      passCount = results.filter(Boolean).length;
      op = rule.aggregate?.op || '>=';
      target = Number(rule.aggregate?.value);
      if (!Number.isFinite(target)) throw new Error('COUNT aggregate requires numeric aggregate.value');
      finalStatus = compareCount(op, passCount, target) ? 'TRUE' : 'FALSE';
    } else throw new Error(`Unsupported predicate aggregate.mode: ${aggregateMode}`);
    tracer.push({ step: 'predicate.aggregate', artifactId: rule.id, outcome: finalStatus.toLowerCase(), details: { scope, aggregateMode, matchedCount: keys.length, passCount, op, target } });
    return { status: finalStatus };
  }
  const result = operator(rule, ctx);
  if (result.status === 'UNDEFINED') return { status: 'FALSE' };
  tracer.push({ step: 'predicate.evaluate', artifactId: rule.id, outcome: String(result.status).toLowerCase(), details: { scope, operator: rule.operator, field: rule.field || null } });
  return result;
}

function evaluateCheck(artifact, rule, ctxBase, tracer, scope) {
  const operator = artifact.__operators.check[rule.operator];
  const ctx = { ...ctxBase };
  if (isWildcardField(rule.field)) {
    const cacheKey = `check:${rule.field}`;
    let keys = ctxBase.wildcardCache.get(cacheKey);
    if (!keys) {
      keys = expandWildcardKeys(rule.field, ctxBase.payloadKeys || []);
      ctxBase.wildcardCache.set(cacheKey, keys);
    }
    const aggregateMode = rule.aggregate?.mode || 'EACH';
    if (keys.length === 0) {
      const behavior = onEmptyBehavior(rule, 'PASS');
      if (behavior === 'FAIL') return { status: 'FAIL', field: rule.field, actual: undefined, meta: { reason: 'WILDCARD_EMPTY' } };
      if (behavior === 'ERROR') throw new Error(`Wildcard pattern matched 0 fields: ${rule.field}`);
      return { status: 'OK' };
    }
    if (aggregateMode === 'EACH' || aggregateMode === 'ALL') {
      const failures = [];
      for (const key of keys) {
        const result = operator({ ...rule, field: key, _patternField: rule.field }, ctx);
        if (result.status === 'EXCEPTION') return result;
        if (result.status === 'FAIL') {
          const got = deepGet(ctx.payload, key);
          failures.push({ status: 'FAIL', field: key, actual: got.ok ? got.value : undefined, meta: { pattern: rule.field } });
        }
      }
      if (failures.length === 0) return { status: 'OK' };
      if (aggregateMode === 'ALL' && rule.aggregate?.summaryIssue === true) return { status: 'FAIL', field: rule.field, actual: failures.length, meta: { pattern: rule.field, failedCount: failures.length, mode: 'ALL' } };
      return { status: 'FAIL', failures };
    }
    if (aggregateMode === 'COUNT') {
      let passCount = 0;
      for (const key of keys) {
        const result = operator({ ...rule, field: key, _patternField: rule.field }, ctx);
        if (result.status === 'EXCEPTION') return result;
        if (result.status === 'OK') passCount += 1;
      }
      const op = rule.aggregate?.op || '>=';
      const target = Number(rule.aggregate?.value);
      if (!Number.isFinite(target)) throw new Error('COUNT aggregate requires numeric aggregate.value');
      return compareCount(op, passCount, target) ? { status: 'OK' } : { status: 'FAIL', field: rule.field, actual: passCount, meta: { mode: 'COUNT', op, value: target, matched: keys.length } };
    }
    if (aggregateMode === 'MIN' || aggregateMode === 'MAX') {
      const values = [];
      for (const key of keys) {
        const got = deepGet(ctx.payload, key);
        if (!got.ok) continue;
        const comparable = makeComparable(got.value);
        if (comparable) values.push({ key, comparable });
      }
      if (values.length === 0) {
        const behavior = onEmptyBehavior(rule, 'PASS');
        if (behavior === 'FAIL') return { status: 'FAIL', field: rule.field, actual: undefined, meta: { reason: 'NO_COMPARABLE_VALUES' } };
        if (behavior === 'ERROR') throw new Error(`Wildcard pattern produced 0 comparable values: ${rule.field}`);
        return { status: 'OK' };
      }
      const kind = values[0].comparable.kind;
      if (!values.every((item) => item.comparable.kind === kind)) return { status: 'FAIL', field: rule.field, actual: null, meta: { reason: 'MIXED_TYPES_IN_MINMAX' } };
      const picked = values.reduce((best, current) => {
        if (!best) return current;
        return aggregateMode === 'MIN' ? (current.comparable.value < best.comparable.value ? current : best) : (current.comparable.value > best.comparable.value ? current : best);
      }, null);
      const aggKey = '__agg__';
      const pickedValue = deepGet(ctx.payload, picked.key).value;
      const syntheticContext = { ...ctx, payload: { [aggKey]: pickedValue } };
      const result = operator({ ...rule, field: aggKey, _patternField: rule.field }, syntheticContext);
      if (result.status === 'EXCEPTION') return result;
      if (result.status === 'OK') return { status: 'OK' };
      return { status: 'FAIL', field: rule.field, actual: pickedValue, meta: { mode: aggregateMode, pickedField: picked.key, kind, matched: keys.length } };
    }
    throw new Error(`Unsupported check aggregate.mode: ${aggregateMode}`);
  }
  return operator(rule, ctx);
}

function evaluateCondition(artifact, condition, compiledCondition, ctxBase, issues, tracer) {
  const evaluateWhen = (expr) => {
    if (expr.mode === 'single') {
      const predicateRule = artifact.__registry.get(expr.predId);
      if (!predicateRule || predicateRule.type !== 'rule' || predicateRule.role !== 'predicate') throw new Error(`when predicate must be predicate-rule: ${expr.predId}`);
      const result = evaluatePredicate(artifact, predicateRule, ctxBase, tracer, `condition:${condition.id}`);
      if (result.status === 'EXCEPTION') throw result.error;
      return result.status === 'TRUE';
    }
    if (expr.mode === 'all') return expr.items.every((item) => evaluateWhen(item));
    if (expr.mode === 'any') return expr.items.some((item) => evaluateWhen(item));
    throw new Error(`Unsupported compiled when mode: ${expr.mode}`);
  };
  const ok = evaluateWhen(compiledCondition.when);
  tracer.push({ step: 'condition.evaluate', artifactId: condition.id, outcome: ok ? 'true' : 'false', details: { whenMode: compiledCondition.when.mode } });
  if (!ok) return 'CONTINUE';
  return executeSteps(artifact, compiledCondition.steps, compiledCondition.scopePipelineId, ctxBase, issues, tracer, `condition:${condition.id}`);
}

function executeSteps(artifact, steps, scopePipelineId, ctxBase, issues, tracer, scope) {
  for (const step of steps) {
    if (step.kind === 'rule') {
      const rule = artifact.__registry.get(step.ruleId);
      if (!rule) throw new Error(`Missing rule ${step.ruleId}`);
      tracer.push({ step: 'rule.start', artifactId: rule.id, outcome: 'start', details: { scope, stepId: step.stepId || null, operator: rule.operator, role: rule.role, field: rule.field || null } });
      if (rule.role === 'predicate') {
        const result = evaluatePredicate(artifact, rule, ctxBase, tracer, scope);
        if (result.status === 'EXCEPTION') throw result.error;
        continue;
      }
      const result = evaluateCheck(artifact, rule, ctxBase, tracer, scope);
      if (result.status === 'EXCEPTION') throw result.error;
      tracer.push({ step: 'rule.finish', artifactId: rule.id, outcome: String(result.status).toLowerCase(), details: { scope, stepId: step.stepId || null } });
      if (result.status === 'FAIL') {
        const failures = Array.isArray(result.failures) ? result.failures : [result];
        for (const failure of failures) {
          const expected = hasOwn(rule, 'value') ? rule.value : hasOwn(rule, 'dictionary') ? rule.dictionary : undefined;
          issues.push({
            kind: 'ISSUE',
            level: rule.level,
            code: rule.code,
            message: rule.message,
            field: failure.field || rule.field,
            ruleId: rule.id,
            expected,
            actual: hasOwn(failure, 'actual') ? failure.actual : deepGet(ctxBase.payload, failure.field || rule.field).ok ? deepGet(ctxBase.payload, failure.field || rule.field).value : undefined,
            stepId: step.stepId,
            pipelineId: scopePipelineId,
            meta: failure.meta || undefined,
          });
        }
        tracer.push({ step: 'issue.emit', artifactId: rule.id, outcome: String(rule.level).toLowerCase(), details: { count: failures.length, code: rule.code, scope } });
        if (rule.level === 'EXCEPTION') return 'STOP';
      }
      continue;
    }
    if (step.kind === 'pipeline') {
      const nested = artifact.__registry.get(step.pipelineId);
      const compiled = artifact.__pipelines.get(step.pipelineId);
      if (!nested || nested.type !== 'pipeline' || !compiled) throw new Error(`Missing pipeline ${step.pipelineId}`);
      tracer.push({ step: 'pipeline.nested.start', artifactId: nested.id, outcome: 'start', details: { scope, stepId: step.stepId || null } });
      const issuesStart = issues.length;
      if (checkRequiredContext(nested, ctxBase, issues, tracer, step.stepId || null)) return 'STOP';
      const control = executeSteps(artifact, compiled.steps, nested.id, ctxBase, issues, tracer, `pipeline:${nested.id}`);
      if (applyStrictBoundary(nested, issues, issuesStart, step.stepId || null, tracer)) return 'STOP';
      if (control === 'STOP') return 'STOP';
      tracer.push({ step: 'pipeline.nested.finish', artifactId: nested.id, outcome: 'continue', details: { scope, stepId: step.stepId || null } });
      continue;
    }
    if (step.kind === 'condition') {
      const condition = artifact.__registry.get(step.conditionId);
      const compiledCondition = artifact.__conditions.get(step.conditionId);
      if (!condition || condition.type !== 'condition' || !compiledCondition) throw new Error(`Missing condition ${step.conditionId}`);
      const control = evaluateCondition(artifact, condition, compiledCondition, ctxBase, issues, tracer);
      if (control === 'STOP') return 'STOP';
      continue;
    }
  }
  return 'CONTINUE';
}

export function evaluateRules(artifact, input, options = {}) {
  const { pipelineId, payload, context } = normalizeEvaluationInput(artifact, input);
  const traceMode = options.trace === undefined ? false : options.trace;
  const tracer = traceRecorder(traceMode, options.traceRedactor);
  const issues = [];
  let flat;
  try {
    flat = flattenPayload(payload || {});
    if (detectFlatNestedConflict(flat)) {
      const conflictKey = detectFlatNestedConflict(flat);
      return toTransportSafeRuntimeResult(makeAbortResult('CONFLICTING_PAYLOAD_PATHS', `Payload contains conflicting flat and nested paths around ${conflictKey}`, { conflictKey }, shouldIncludeTrace(traceMode) ? tracer.trace : undefined));
    }
  } catch (error) {
    const code = error.code === 'CYCLE_DETECTED' ? 'PAYLOAD_CYCLE_DETECTED' : error.code === 'DANGEROUS_KEY' ? 'DANGEROUS_PAYLOAD_KEY' : 'PAYLOAD_NOT_JSON_SAFE';
    return toTransportSafeRuntimeResult(makeAbortResult(code, error.message, { path: error.path || null }, shouldIncludeTrace(traceMode) ? tracer.trace : undefined));
  }
  const runtimeContext = context || (isObject(flat.__context) ? flat.__context : {});
  const enrichedPayload = Object.assign(Object.create(null), flat, { __context: runtimeContext });
  const ctxBase = {
    payload: enrichedPayload,
    payloadKeys: Object.keys(flat).filter((key) => key !== '__context'),
    wildcardCache: new Map(),
    getDictionary: (id) => artifact.__dictionaries.get(id) || null,
    get: (path) => deepGet(enrichedPayload, path),
    has: (path) => deepGet(enrichedPayload, path).ok,
  };
  const pipeline = artifact.__registry.get(pipelineId);
  const compiledPipeline = artifact.__pipelines.get(pipelineId);
  if (!pipeline || pipeline.type !== 'pipeline' || !compiledPipeline) return toTransportSafeRuntimeResult(makeAbortResult('PIPELINE_NOT_FOUND', `Pipeline not found: ${pipelineId}`, { availablePipelines: [...artifact.__pipelines.keys()].sort() }, shouldIncludeTrace(traceMode) ? tracer.trace : undefined));
  try {
    tracer.push({ step: 'pipeline.start', artifactId: pipelineId, outcome: 'start', details: { traceMode } });
    if (checkRequiredContext(pipeline, ctxBase, issues, tracer)) {
      const result = { status: 'EXCEPTION', control: 'STOP', issues, ...(shouldIncludeTrace(traceMode) ? { trace: tracer.trace } : {}) };
      return toTransportSafeRuntimeResult(result);
    }
    const control = executeSteps(artifact, compiledPipeline.steps, pipeline.id, ctxBase, issues, tracer, `pipeline:${pipelineId}`);
    if (applyStrictBoundary(pipeline, issues, 0, null, tracer)) {
      return toTransportSafeRuntimeResult({ status: 'EXCEPTION', control: 'STOP', issues, ...(shouldIncludeTrace(traceMode) ? { trace: tracer.trace } : {}) });
    }
    const hasErrors = issues.some((item) => item.level === 'ERROR' || item.level === 'EXCEPTION');
    const hasWarnings = issues.some((item) => item.level === 'WARNING');
    const status = control === 'STOP' ? 'EXCEPTION' : hasErrors ? 'ERROR' : hasWarnings ? 'OK_WITH_WARNINGS' : 'OK';
    tracer.push({ step: 'pipeline.finish', artifactId: pipelineId, outcome: status.toLowerCase(), details: { issueCount: issues.length } });
    const result = { status, control: control === 'STOP' || hasErrors ? 'STOP' : 'CONTINUE', issues };
    if (shouldIncludeTrace(traceMode)) result.trace = tracer.trace;
    return toTransportSafeRuntimeResult(result);
  } catch (error) {
    const runtimeError = error instanceof RulesRuntimeError ? error : new RulesRuntimeError({ code: error?.code === 'CUSTOM_OPERATOR_ERROR' ? 'CUSTOM_OPERATOR_ERROR' : 'RULES_RUNTIME_ABORT', message: error?.message || String(error), details: { pipelineId } });
    return toTransportSafeRuntimeResult({ status: 'ABORT', control: 'STOP', issues, ...(shouldIncludeTrace(traceMode) ? { trace: tracer.trace } : {}), error: { code: runtimeError.code, message: runtimeError.message, details: runtimeError.details || null } });
  }
}
