const test = require("node:test");
const assert = require("node:assert/strict");
const { createEngine, Operators, CompilationError } = require("..");

const engine = createEngine({ operators: Operators });

function rule(id, operator, field, level = "ERROR", code = "ERR.CODE", extra = {}) {
  return Object.assign({ id, type: "rule", description: id, role: "check", operator, field, level, code, message: code }, extra);
}
function predicate(id, operator, field, extra = {}) {
  return Object.assign({ id, type: "rule", description: id, role: "predicate", operator, field }, extra);
}
function condition(id, when, steps) {
  return { id, type: "condition", description: id, when, steps };
}
function pipeline(id, flow, extra = {}) {
  return Object.assign({ id, type: "pipeline", description: id, entrypoint: true, strict: false, flow }, extra);
}
function compile(artifacts) { return engine.compile({ artifacts }); }

test("compiled artifact exposes only stable public fields", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  assert.deepEqual(Object.keys(compiled).sort(), ["diagnostics", "kind", "version"]);
  assert.equal(compiled.kind, "compiled-rules");
  assert.equal(compiled.version, 1);
  assert.ok(Array.isArray(compiled.diagnostics));
});

test("OK result contract shape is stable", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  const result = engine.runPipeline(compiled, "p", { name: "Ivan" });
  assert.deepEqual(Object.keys(result).sort(), ["control", "issues", "status", "trace"]);
  assert.equal(result.status, "OK");
  assert.equal(result.control, "CONTINUE");
  assert.ok(Array.isArray(result.issues));
  assert.ok(Array.isArray(result.trace));
});

test("OK_WITH_WARNINGS result contract shape is stable", () => {
  const compiled = compile([rule("library.r", "not_empty", "name", "WARNING", "NAME.WARNING"), pipeline("p", [{ rule: "library.r" }])]);
  const result = engine.runPipeline(compiled, "p", { name: "" });
  assert.equal(result.status, "OK_WITH_WARNINGS");
  assert.equal(result.control, "CONTINUE");
  assert.equal(result.issues[0].kind, "ISSUE");
  assert.equal(result.issues[0].level, "WARNING");
  assert.equal(result.issues[0].code, "NAME.WARNING");
});

test("ERROR result contract shape is stable", () => {
  const compiled = compile([rule("library.r", "not_empty", "name", "ERROR", "NAME.REQUIRED"), pipeline("p", [{ rule: "library.r" }])]);
  const result = engine.runPipeline(compiled, "p", { name: "" });
  assert.equal(result.status, "ERROR");
  assert.equal(result.control, "STOP");
  assert.equal(result.issues[0].field, "name");
});

test("EXCEPTION result contract shape is stable", () => {
  const compiled = compile([rule("library.r", "not_empty", "name", "ERROR", "NAME.REQUIRED"), pipeline("p", [{ rule: "library.r" }], { strict: true, message: "Strict failed", strictCode: "STRICT.FAIL" })]);
  const result = engine.runPipeline(compiled, "p", { name: "" });
  assert.equal(result.status, "EXCEPTION");
  assert.equal(result.control, "STOP");
  assert.equal(result.issues.at(-1).code, "STRICT.FAIL");
});

test("ABORT result contract shape is stable", () => {
  const result = engine.runPipeline({}, "p", {});
  assert.equal(result.status, "ABORT");
  assert.equal(result.control, "STOP");
  assert.deepEqual(Object.keys(result.error).sort(), ["code", "details", "message", "phase", "pipelineId"]);
  assert.equal(result.error.code, "INVALID_COMPILED_ARTIFACT");
  assert.equal(result.error.phase, "input_validation");
});

test("trace entry contract shape is stable", () => {
  const compiled = compile([rule("library.r", "not_empty", "name", "ERROR", "NAME.REQUIRED"), pipeline("p", [{ rule: "library.r" }])]);
  const result = engine.runPipeline(compiled, "p", { name: "" });
  assert.ok(result.trace.length > 0);
  const entry = result.trace[0];
  assert.deepEqual(Object.keys(entry).sort(), ["data", "kind", "message", "ts"]);
  assert.equal(entry.kind, "TRACE");
  assert.equal(typeof entry.message, "string");
  assert.equal(typeof entry.ts, "string");
});

test("compile diagnostics contract shape is stable", () => {
  assert.throws(() => compile([pipeline("p", [])]), (error) => {
    assert.equal(error instanceof CompilationError, true);
    const diagnostic = error.errors.find((d) => d.code === "PIPELINE_FLOW_REQUIRED");
    assert.ok(diagnostic);
    assert.deepEqual(Object.keys(diagnostic).sort(), ["artifactId", "code", "conditionIndex", "details", "message", "path", "phase", "pipelineId", "ruleId", "severity", "stepIndex"]);
    assert.equal(diagnostic.phase, "schema_validation");
    assert.equal(diagnostic.artifactId, "p");
    assert.equal(diagnostic.path, "flow");
    return true;
  });
});

test("compile warnings are exposed on successful compile", () => {
  const compiled = compile([
    predicate("library.pred", "equals", "items[*].kind", { aggregate: { mode: "ANY", onEmpty: "TRUE" } }),
    pipeline("p", [{ rule: "library.pred" }]),
  ]);
  assert.ok(compiled.diagnostics.some((d) => d.severity === "warning" && d.code === "PREDICATE_ON_EMPTY_TRUE"));
});

test("compile warnings remain visible when compile throws with errors", () => {
  assert.throws(() => compile([
    predicate("library.pred", "equals", "items[*].kind", { aggregate: { mode: "ANY", onEmpty: "TRUE" } }),
    pipeline("p", []),
  ]), (error) => {
    assert.equal(error instanceof CompilationError, true);
    assert.ok(error.errors.some((d) => d.code === "PIPELINE_FLOW_REQUIRED"));
    assert.ok(error.warnings.some((d) => d.code === "PREDICATE_ON_EMPTY_TRUE"));
    return true;
  });
});
