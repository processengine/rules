"use strict";

const { normalizeWhenExpr, stepKind } = require("../utils");
const { resolveRef } = require("../resolver");
const { makeDiagnostic } = require("../diagnostics");

function d(code, message, artifactId, path, pipelineId = null, details = null) {
  return makeDiagnostic({ severity: "error", code, message, phase: "reference_validation", artifactId, path, pipelineId, details });
}

function validateRefs(artifacts, registry) {
  const diagnostics = [];
  for (const a of artifacts) {
    if (a.type === "pipeline") diagnostics.push(...validatePipelineRefs(a, registry));
    else if (a.type === "condition") diagnostics.push(...validateConditionRefs(a, registry));
  }
  return diagnostics;
}

function validatePipelineRefs(a, registry) {
  const diagnostics = [];
  const scopePipelineId = a.id;
  for (let index = 0; index < (a.flow || []).length; index += 1) {
    diagnostics.push(...validateStepRef(a, a.flow[index], registry, `flow.${index}`, scopePipelineId));
  }
  return diagnostics;
}

function validateConditionRefs(a, registry) {
  const diagnostics = [];
  const scopePipelineId = inferPipelineFromId(a.id);
  if (!scopePipelineId) {
    diagnostics.push(d("CONDITION_SCOPE_UNRESOLVED", "Cannot infer pipeline scope from condition id", a.id, "id"));
    return diagnostics;
  }
  diagnostics.push(...validateConditionWhen(a, registry, scopePipelineId));
  for (let index = 0; index < (a.steps || []).length; index += 1) {
    diagnostics.push(...validateStepRef(a, a.steps[index], registry, `steps.${index}`, scopePipelineId));
  }
  return diagnostics;
}

function validateConditionWhen(a, registry, scopePipelineId) {
  const diagnostics = [];
  let expr;
  try { expr = normalizeWhenExpr(a.when); } catch (e) { diagnostics.push(d("CONDITION_WHEN_INVALID", e.message, a.id, "when", scopePipelineId)); return diagnostics; }
  function visit(node, path) {
    if (node.mode === "single") {
      const predId = resolveRef("rule", node.pred, scopePipelineId);
      const pred = registry.get(predId);
      if (!pred) diagnostics.push(d("WHEN_PREDICATE_NOT_FOUND", `Condition references missing predicate ${predId}`, a.id, path, scopePipelineId));
      else if (pred.type !== "rule" || pred.role !== "predicate") diagnostics.push(d("WHEN_PREDICATE_INVALID", `Condition when target ${predId} must be rule(role=predicate)`, a.id, path, scopePipelineId));
      return;
    }
    (node.items || []).forEach((item, index) => visit(item, `${path}.${node.mode}.${index}`));
  }
  visit(expr, "when");
  return diagnostics;
}

function validateStepRef(owner, step, registry, path, scopePipelineId) {
  const diagnostics = [];
  let kind;
  try { kind = stepKind(step); } catch (e) { diagnostics.push(d("STEP_KIND_INVALID", e.message, owner.id, path, scopePipelineId)); return diagnostics; }
  const ref = step[kind];
  if (kind === "pipeline") {
    const target = registry.get(ref);
    if (!target || target.type !== "pipeline") diagnostics.push(d("PIPELINE_REF_INVALID", `Referenced pipeline ${ref} not found`, owner.id, `${path}.pipeline`, scopePipelineId));
    return diagnostics;
  }
  const resolved = resolveRef(kind, ref, scopePipelineId);
  const artifact = registry.get(resolved);
  if (!artifact) {
    diagnostics.push(d("REF_NOT_FOUND", `Missing artifact referenced by ${kind}: ${resolved}`, owner.id, path, scopePipelineId, { rawRef: ref, resolvedRef: resolved }));
    return diagnostics;
  }
  if (kind === "rule" && artifact.type !== "rule") diagnostics.push(d("RULE_REF_INVALID", `Referenced artifact ${resolved} must be a rule`, owner.id, path, scopePipelineId));
  if (kind === "condition" && artifact.type !== "condition") diagnostics.push(d("CONDITION_REF_INVALID", `Referenced artifact ${resolved} must be a condition`, owner.id, path, scopePipelineId));
  if (!(typeof artifact.id === "string" && (artifact.id.startsWith("library.") || artifact.id.startsWith(`${scopePipelineId}.`)))) diagnostics.push(d("REF_NOT_VISIBLE", `${resolved} is not visible from pipeline ${scopePipelineId}`, owner.id, path, scopePipelineId));
  return diagnostics;
}

function inferPipelineFromId(id) {
  const index = id.lastIndexOf(".");
  return index > 0 ? id.slice(0, index) : null;
}

module.exports = { validateRefs, inferPipelineFromId };
