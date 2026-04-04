"use strict";

const { assert, isObject, deepCloneJsonSafe, deepFreeze } = require("../utils");
const { CompilationError, makeDiagnostic } = require("../diagnostics");
const { validateSchema, validateCodeUniqueness } = require("./validate-schema");
const { validateRefs } = require("./validate-refs");
const { validatePipelineDAG } = require("./validate-dag");
const { buildConditions, buildPipelines } = require("./build-steps");

function compile(definition, options = {}) {
  assert(isObject(definition), "compile: definition must be an object");
  assert(Array.isArray(definition.artifacts), "compile: definition.artifacts must be an array");

  const operators = options.operators;
  assert(isObject(operators) && isObject(operators.check) && isObject(operators.predicate), "compile: options.operators with { check, predicate } is required");

  const sources = options.sources instanceof Map ? options.sources : null;
  const detachedArtifacts = definition.artifacts.map((artifact, index) => deepFreeze(deepCloneJsonSafe(artifact, `$definition.artifacts[${index}]`)));

  {
    const diagnostics = [];
    const build = buildRegistry(detachedArtifacts);
    diagnostics.push(...build.diagnostics);
    throwIfErrors(diagnostics);

    diagnostics.push(...validateSchema(detachedArtifacts, build.dictionaries, operators));
    diagnostics.push(...validateCodeUniqueness(detachedArtifacts));
    throwIfErrors(diagnostics);

    diagnostics.push(...validateRefs(detachedArtifacts, build.registry));
    throwIfErrors(diagnostics);

    const compiledConditions = buildConditions(detachedArtifacts);
    const compiledPipelines = buildPipelines(detachedArtifacts);

    diagnostics.push(...validatePipelineDAG(build.registry, compiledPipelines, compiledConditions));
    throwIfErrors(diagnostics);

    const compiled = { kind: "compiled-rules", version: 1, diagnostics: Object.freeze(diagnostics.slice()) };
    Object.defineProperties(compiled, {
      __registry: { value: build.registry, enumerable: false },
      __dictionaries: { value: build.dictionaries, enumerable: false },
      __operators: { value: operators, enumerable: false },
      __pipelines: { value: compiledPipelines, enumerable: false },
      __conditions: { value: compiledConditions, enumerable: false },
    });
    return deepFreeze(compiled);
  }
}

function throwIfErrors(diagnostics) {
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) throw new CompilationError(diagnostics);
}

function buildRegistry(artifacts) {
  const registry = new Map();
  const dictionaries = new Map();
  const diagnostics = [];

  for (const a of artifacts) {
    if (!a || typeof a.id !== "string" || a.id.length === 0) {
      diagnostics.push(makeDiagnostic({ severity: "error", code: "ARTIFACT_ID_REQUIRED", message: "Artifact must have a non-empty id", phase: "registry_build", artifactId: null, path: "id" }));
      continue;
    }
    if (typeof a.type !== "string" || a.type.length === 0) {
      diagnostics.push(makeDiagnostic({ severity: "error", code: "ARTIFACT_TYPE_REQUIRED", message: "Artifact must have a non-empty type", phase: "registry_build", artifactId: a.id, path: "type" }));
      continue;
    }
    if (typeof a.description !== "string" || a.description.length === 0) {
      diagnostics.push(makeDiagnostic({ severity: "error", code: "ARTIFACT_DESCRIPTION_REQUIRED", message: "Artifact must have a non-empty description", phase: "registry_build", artifactId: a.id, path: "description" }));
      continue;
    }
    if (registry.has(a.id)) {
      diagnostics.push(makeDiagnostic({ severity: "error", code: "DUPLICATE_ARTIFACT_ID", message: `Duplicate artifact id: ${a.id}`, phase: "registry_build", artifactId: a.id, path: "id" }));
      continue;
    }
    registry.set(a.id, a);
    if (a.type === "dictionary") dictionaries.set(a.id, a);
  }

  return { registry, dictionaries, diagnostics };
}

module.exports = { compile };
