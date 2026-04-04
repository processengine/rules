"use strict";

const { isObject, normalizeWhenExpr, stepKind, assertSafePath } = require("../utils");
const { makeDiagnostic } = require("../diagnostics");

const LEVELS = new Set(["WARNING", "ERROR", "EXCEPTION"]);
const VALID_CHECK_AGGREGATE_MODES = new Set(["EACH", "ALL", "COUNT", "MIN", "MAX"]);
const VALID_PREDICATE_AGGREGATE_MODES = new Set(["ANY", "ALL", "COUNT"]);
const FIELD_COMPARE_OPERATORS = new Set([
  "field_less_than_field",
  "field_greater_than_field",
  "field_equals_field",
  "field_not_equals_field",
  "field_less_or_equal_than_field",
  "field_greater_or_equal_than_field",
]);

function err(code, message, artifactId, path, details) {
  return makeDiagnostic({ severity: "error", code, message, phase: "schema_validation", artifactId, path, details });
}

function warn(code, message, artifactId, path, details) {
  return makeDiagnostic({ severity: "warning", code, message, phase: "schema_validation", artifactId, path, details });
}

function validateSchema(artifacts, dictionaries, operators) {
  const diagnostics = [];
  for (const a of artifacts) {
    if (a.type === "pipeline") diagnostics.push(...validatePipelineSchema(a));
    else if (a.type === "condition") diagnostics.push(...validateConditionSchema(a));
    else if (a.type === "rule") diagnostics.push(...validateRuleSchema(a, dictionaries, operators));
    else if (a.type === "dictionary") diagnostics.push(...validateDictionarySchema(a));
    else diagnostics.push(err("UNKNOWN_ARTIFACT_TYPE", `Unknown artifact type: ${a.type}`, a.id || null, "type"));
  }
  return diagnostics;
}

function validateDictionarySchema(a) {
  const diagnostics = [];
  if (!Array.isArray(a.entries)) diagnostics.push(err("DICTIONARY_ENTRIES_REQUIRED", "Dictionary entries must be an array", a.id, "entries"));
  return diagnostics;
}

function validatePipelineSchema(a) {
  const diagnostics = [];
  if (!Array.isArray(a.flow) || a.flow.length === 0) diagnostics.push(err("PIPELINE_FLOW_REQUIRED", "Pipeline flow must be a non-empty array", a.id, "flow"));
  if (typeof a.strict !== "boolean") diagnostics.push(err("PIPELINE_STRICT_REQUIRED", "Pipeline strict must be explicitly set to true or false", a.id, "strict"));
  if (typeof a.entrypoint !== "boolean") diagnostics.push(err("PIPELINE_ENTRYPOINT_REQUIRED", "Pipeline entrypoint must be explicitly set to true or false", a.id, "entrypoint"));
  if (a.required_context !== undefined) {
    if (!Array.isArray(a.required_context) || a.required_context.some((x) => typeof x !== "string" || x.length === 0)) {
      diagnostics.push(err("PIPELINE_REQUIRED_CONTEXT_INVALID", "Pipeline required_context must be an array of non-empty strings", a.id, "required_context"));
    }
  }
  if (a.strict === true && (typeof a.message !== "string" || a.message.length === 0)) diagnostics.push(err("PIPELINE_STRICT_MESSAGE_REQUIRED", "Pipeline message is required when strict=true", a.id, "message"));
  if (a.strict === true && a.strictCode !== undefined && (typeof a.strictCode !== "string" || a.strictCode.length === 0)) diagnostics.push(err("PIPELINE_STRICT_CODE_INVALID", "Pipeline strictCode must be a non-empty string if provided", a.id, "strictCode"));
  if (Array.isArray(a.flow)) {
    a.flow.forEach((step, index) => {
      if (!isObject(step)) diagnostics.push(err("STEP_MUST_BE_OBJECT", "Each pipeline step must be an object", a.id, `flow.${index}`));
      else {
        try { stepKind(step); } catch (e) { diagnostics.push(err("STEP_KIND_INVALID", e.message, a.id, `flow.${index}`)); }
      }
    });
  }
  return diagnostics;
}

function validateConditionSchema(a) {
  const diagnostics = [];
  if (!Array.isArray(a.steps) || a.steps.length === 0) diagnostics.push(err("CONDITION_STEPS_REQUIRED", "Condition steps must be a non-empty array", a.id, "steps"));
  try { normalizeWhenExpr(a.when); } catch (e) { diagnostics.push(err("CONDITION_WHEN_INVALID", e.message, a.id, "when")); }
  if (Array.isArray(a.steps)) {
    a.steps.forEach((step, index) => {
      if (!isObject(step)) diagnostics.push(err("STEP_MUST_BE_OBJECT", "Each condition step must be an object", a.id, `steps.${index}`));
      else {
        try { stepKind(step); } catch (e) { diagnostics.push(err("STEP_KIND_INVALID", e.message, a.id, `steps.${index}`)); }
      }
    });
  }
  return diagnostics;
}

function validateRuleSchema(a, dictionaries, operators) {
  const diagnostics = [];
  if (a.role !== "check" && a.role !== "predicate") {
    diagnostics.push(err("RULE_ROLE_INVALID", "Rule role must be check or predicate", a.id, "role"));
    return diagnostics;
  }
  if (typeof a.operator !== "string" || a.operator.length === 0) {
    diagnostics.push(err("RULE_OPERATOR_REQUIRED", "Rule operator is required", a.id, "operator"));
    return diagnostics;
  }
  if (typeof a.field === "string") {
    try { assertSafePath(a.field); } catch (e) { diagnostics.push(err("DANGEROUS_PATH_SEGMENT", e.message, a.id, "field")); }
  }
  if (typeof a.value_field === "string") {
    try { assertSafePath(a.value_field); } catch (e) { diagnostics.push(err("DANGEROUS_PATH_SEGMENT", e.message, a.id, "value_field")); }
  }

  if (a.role === "check") diagnostics.push(...validateCheckRuleSchema(a, operators));
  else diagnostics.push(...validatePredicateRuleSchema(a, operators));

  diagnostics.push(...validateOperatorParams(a, dictionaries));
  diagnostics.push(...validateOptionalMeta(a));
  diagnostics.push(...validateOptionalAggregate(a));
  diagnostics.push(...validateRuleWarnings(a));
  return diagnostics;
}

function validateCheckRuleSchema(a, operators) {
  const diagnostics = [];
  if (!LEVELS.has(a.level)) diagnostics.push(err("CHECK_LEVEL_INVALID", "Check rule level must be WARNING, ERROR or EXCEPTION", a.id, "level"));
  if (typeof a.code !== "string" || a.code.length === 0) diagnostics.push(err("CHECK_CODE_REQUIRED", "Check rule code is required", a.id, "code"));
  if (typeof a.message !== "string" || a.message.length === 0) diagnostics.push(err("CHECK_MESSAGE_REQUIRED", "Check rule message is required", a.id, "message"));
  if (!operators.check[a.operator]) diagnostics.push(err("UNKNOWN_CHECK_OPERATOR", `Unknown check operator: ${a.operator}`, a.id, "operator"));
  return diagnostics;
}

function validatePredicateRuleSchema(a, operators) {
  const diagnostics = [];
  if (a.level !== undefined || a.code !== undefined || a.message !== undefined) diagnostics.push(err("PREDICATE_FORBIDDEN_FIELDS", "Predicate rule must not define level, code or message", a.id, null));
  if (!operators.predicate[a.operator]) diagnostics.push(err("UNKNOWN_PREDICATE_OPERATOR", `Unknown predicate operator: ${a.operator}`, a.id, "operator"));
  return diagnostics;
}

function validateOperatorParams(a, dictionaries) {
  const diagnostics = [];
  if (a.operator === "any_filled") {
    const fields = Array.isArray(a.fields) ? a.fields : (Array.isArray(a.paths) ? a.paths : null);
    if (!Array.isArray(fields) || fields.length === 0) diagnostics.push(err("ANY_FILLED_FIELDS_REQUIRED", "any_filled requires fields[]", a.id, "fields"));
  }
  if (a.operator === "in_dictionary") {
    if (!a.dictionary || a.dictionary.type !== "static" || typeof a.dictionary.id !== "string") diagnostics.push(err("DICTIONARY_REF_INVALID", "in_dictionary requires dictionary { type: static, id }", a.id, "dictionary"));
    else if (!dictionaries.has(a.dictionary.id)) diagnostics.push(err("DICTIONARY_NOT_FOUND", `Dictionary not found: ${a.dictionary.id}`, a.id, "dictionary.id"));
  }
  if (FIELD_COMPARE_OPERATORS.has(a.operator) && (typeof a.value_field !== "string" || a.value_field.length === 0)) diagnostics.push(err("VALUE_FIELD_REQUIRED", `${a.operator} requires value_field`, a.id, "value_field"));
  if (a.operator === "matches_regex") {
    if (typeof a.value !== "string" || a.value.length === 0) diagnostics.push(err("REGEX_PATTERN_REQUIRED", "matches_regex requires value", a.id, "value"));
    else {
      try {
        const flags = typeof a.flags === "string" ? a.flags : "";
        const pattern = String(a.value).replace(/\\\\/g, "\\");
        new RegExp(pattern, flags);
      } catch (e) {
        diagnostics.push(err("REGEX_PATTERN_INVALID", `Invalid regex pattern: ${e.message}`, a.id, "value"));
      }
    }
  }
  return diagnostics;
}

function validateOptionalMeta(a) {
  if (a.meta !== undefined && !isObject(a.meta)) return [err("RULE_META_INVALID", "Rule meta must be an object if provided", a.id, "meta")];
  return [];
}

function validateOptionalAggregate(a) {
  const diagnostics = [];
  if (a.aggregate === undefined) return diagnostics;
  if (!isObject(a.aggregate)) {
    diagnostics.push(err("AGGREGATE_INVALID", "aggregate must be an object if provided", a.id, "aggregate"));
    return diagnostics;
  }
  if (a.aggregate.mode !== undefined) {
    if (typeof a.aggregate.mode !== "string" || a.aggregate.mode.length === 0) diagnostics.push(err("AGGREGATE_MODE_INVALID", "aggregate.mode must be a non-empty string", a.id, "aggregate.mode"));
    else {
      const validModes = a.role === "check" ? VALID_CHECK_AGGREGATE_MODES : VALID_PREDICATE_AGGREGATE_MODES;
      if (!validModes.has(a.aggregate.mode)) diagnostics.push(err("AGGREGATE_MODE_UNSUPPORTED", `aggregate.mode \"${a.aggregate.mode}\" is not valid for role=${a.role}`, a.id, "aggregate.mode", { allowed: [...validModes] }));
    }
  }
  if (a.aggregate.onEmpty !== undefined && (typeof a.aggregate.onEmpty !== "string" || a.aggregate.onEmpty.length === 0)) diagnostics.push(err("AGGREGATE_ON_EMPTY_INVALID", "aggregate.onEmpty must be a non-empty string", a.id, "aggregate.onEmpty"));
  return diagnostics;
}

function validateRuleWarnings(a) {
  const diagnostics = [];
  if (a.role === "check" && a.level === "EXCEPTION" && a.aggregate && a.aggregate.mode === "EACH") diagnostics.push(warn("EXCEPTION_WILDCARD_EACH", "EXCEPTION rule with wildcard EACH may stop after the first failed step boundary", a.id, "aggregate.mode"));
  if (a.role === "predicate" && a.aggregate && a.aggregate.mode === "ANY" && a.aggregate.onEmpty === "TRUE") diagnostics.push(warn("PREDICATE_ON_EMPTY_TRUE", "Wildcard predicate with onEmpty=TRUE may be broader than expected", a.id, "aggregate.onEmpty"));
  return diagnostics;
}

function validateCodeUniqueness(artifacts) {
  const diagnostics = [];
  const codes = new Map();
  for (const a of artifacts) {
    if (a.type !== "rule" || a.role !== "check") continue;
    if (codes.has(a.code)) diagnostics.push(makeDiagnostic({ severity: "error", code: "DUPLICATE_CHECK_CODE", message: `Duplicate check code \"${a.code}\"`, phase: "uniqueness_validation", artifactId: a.id, path: "code", details: { firstOwner: codes.get(a.code) } }));
    else codes.set(a.code, a.id);
  }
  return diagnostics;
}

module.exports = { validateSchema, validateCodeUniqueness };
