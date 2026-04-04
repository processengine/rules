const test = require("node:test");
const assert = require("node:assert/strict");
const pkg = require("..");

const engine = pkg.createEngine({ operators: pkg.Operators });

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

test("nested payload and flat payload both work", () => {
  const compiled = compile([rule("library.r", "not_empty", "person.name"), pipeline("p", [{ rule: "library.r" }])]);
  assert.equal(engine.runPipeline(compiled, "p", { person: { name: "Ivan" } }).status, "OK");
  assert.equal(engine.runPipeline(compiled, "p", { "person.name": "Ivan" }).status, "OK");
});

test("condition uses predicate and executes nested block", () => {
  const compiled = compile([
    predicate("library.pred", "equals", "isForeign", { value: true }),
    rule("library.r", "not_empty", "tin", "ERROR", "TIN.REQUIRED"),
    condition("library.cond", { all: ["library.pred"] }, [{ rule: "library.r" }]),
    pipeline("p", [{ condition: "library.cond" }])
  ]);
  assert.equal(engine.runPipeline(compiled, "p", { isForeign: false, tin: "" }).status, "OK");
  assert.equal(engine.runPipeline(compiled, "p", { isForeign: true, tin: "" }).status, "ERROR");
});

test("strict pipeline escalates to EXCEPTION", () => {
  const compiled = compile([
    rule("library.r", "not_empty", "name", "ERROR", "NAME.REQUIRED"),
    pipeline("p", [{ rule: "library.r" }], { strict: true, message: "Strict failed", strictCode: "STRICT.FAIL" })
  ]);
  const result = engine.runPipeline(compiled, "p", { name: "" });
  assert.equal(result.status, "EXCEPTION");
  assert.equal(result.issues.at(-1).code, "STRICT.FAIL");
});

test("unknown pipeline returns dedicated ABORT code", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  const result = engine.runPipeline(compiled, "missing", {});
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "PIPELINE_NOT_FOUND");
  assert.equal(result.error.phase, "entrypoint_lookup");
});

test("runtime dangerous payload returns ABORT with code for top-level __proto__", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  const bad = JSON.parse('{"__proto__": {"x": 1}}');
  const result = engine.runPipeline(compiled, "p", bad);
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "DANGEROUS_PAYLOAD_KEY");
});

test("runtime dangerous payload returns ABORT for prototype key", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  const bad = { outer: { prototype: 1 } };
  const result = engine.runPipeline(compiled, "p", bad);
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "DANGEROUS_PAYLOAD_KEY");
});

test("runtime dangerous payload returns ABORT for constructor key", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  const bad = { outer: { constructor: 1 } };
  const result = engine.runPipeline(compiled, "p", bad);
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "DANGEROUS_PAYLOAD_KEY");
});

test("runtime detects cycle in payload", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  const bad = {}; bad.self = bad;
  const result = engine.runPipeline(compiled, "p", bad);
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "PAYLOAD_CYCLE_DETECTED");
});

test("runtime rejects flat nested collision", () => {
  const compiled = compile([rule("library.r", "not_empty", "a"), pipeline("p", [{ rule: "library.r" }])]);
  const result = engine.runPipeline(compiled, "p", { a: 1, "a.b": 2 });
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "CONFLICTING_PAYLOAD_PATHS");
});

test("runtime rejects non-json-safe values", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  for (const value of [new Date(), new Map(), new Set(), BigInt(1), NaN, Infinity, function x() {}, Symbol("x")]) {
    const result = engine.runPipeline(compiled, "p", { bad: value });
    assert.equal(result.status, "ABORT");
    assert.equal(result.error.code, "PAYLOAD_NOT_JSON_SAFE");
  }
});

test("runtime dangerous payload in array item returns ABORT", () => {
  const compiled = compile([rule("library.r", "not_empty", "items[0].name"), pipeline("p", [{ rule: "library.r" }])]);
  const result = engine.runPipeline(compiled, "p", JSON.parse('{"items":[{"name":"ok"},{"__proto__":{"x":1}}]}'));
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "DANGEROUS_PAYLOAD_KEY");
});

test("runtime invalid compiled artifact is handled", () => {
  const result = engine.runPipeline({}, "p", {});
  assert.equal(result.status, "ABORT");
  assert.equal(result.error.code, "INVALID_COMPILED_ARTIFACT");
});

test("trace can be disabled without changing decision status", () => {
  const compiled = compile([rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])]);
  const a = engine.runPipeline(compiled, "p", { name: "" }, { trace: true });
  const b = engine.runPipeline(compiled, "p", { name: "" }, { trace: false });
  assert.equal(a.status, b.status);
  assert.ok(a.trace.length > 0);
  assert.equal(b.trace.length, 0);
});
