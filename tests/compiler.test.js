const test = require("node:test");
const assert = require("node:assert/strict");
const pkg = require("..");

const engine = pkg.createEngine({ operators: pkg.Operators });

function rule(id, operator, field, level = "ERROR", code = "ERR.CODE", extra = {}) {
  return Object.assign({ id, type: "rule", description: id, role: "check", operator, field, level, code, message: code }, extra);
}
function pipeline(id, flow, extra = {}) {
  return Object.assign({ id, type: "pipeline", description: id, entrypoint: true, strict: false, flow }, extra);
}

test("compile returns immutable compiled artifact", () => {
  const definition = { artifacts: [rule("library.r", "not_empty", "name"), pipeline("p", [{ rule: "library.r" }])] };
  const compiled = engine.compile(definition);
  assert.equal(compiled.kind, "compiled-rules");
  assert.equal(Object.isFrozen(compiled), true);
});

test("source mutation after compile does not affect runtime", () => {
  const r = rule("library.r", "not_empty", "name");
  const p = pipeline("p", [{ rule: "library.r" }]);
  const definition = { artifacts: [r, p] };
  const compiled = engine.compile(definition);
  r.field = "other";
  const result = engine.runPipeline(compiled, "p", { name: "" });
  assert.equal(result.status, "ERROR");
  assert.equal(result.issues[0].field, "name");
});

test("dangerous path in rule is rejected at compile time", () => {
  assert.throws(() => engine.compile({ artifacts: [rule("library.r", "not_empty", "__proto__.x"), pipeline("p", [{ rule: "library.r" }])] }), (error) => {
    assert.ok(error.errors.some((d) => d.code === "DANGEROUS_PATH_SEGMENT"));
    return true;
  });
});

test("compile diagnostics cover duplicate artifact ids", () => {
  assert.throws(() => engine.compile({ artifacts: [
    rule("library.r", "not_empty", "name", "ERROR", "CODE.A"),
    rule("library.r", "not_empty", "name", "ERROR", "CODE.B"),
  ] }), (error) => {
    assert.ok(error.errors.some((d) => d.code === "DUPLICATE_ARTIFACT_ID"));
    return true;
  });
});

test("compile diagnostics cover unknown artifact type", () => {
  assert.throws(() => engine.compile({ artifacts: [{ id: "x", type: "weird", description: "x" }] }), (error) => {
    assert.ok(error.errors.some((d) => d.code === "UNKNOWN_ARTIFACT_TYPE"));
    return true;
  });
});

test("compile diagnostics cover duplicate check codes", () => {
  assert.throws(() => engine.compile({ artifacts: [
    rule("library.r1", "not_empty", "name", "ERROR", "NAME.REQUIRED"),
    rule("library.r2", "not_empty", "title", "ERROR", "NAME.REQUIRED"),
    pipeline("p", [{ rule: "library.r1" }]),
  ] }), (error) => {
    assert.ok(error.errors.some((d) => d.code === "DUPLICATE_CHECK_CODE"));
    return true;
  });
});

test("compile diagnostics cover missing refs", () => {
  assert.throws(() => engine.compile({ artifacts: [pipeline("p", [{ rule: "library.missing" }])] }), (error) => {
    assert.ok(error.errors.some((d) => d.code === "REF_NOT_FOUND"));
    return true;
  });
});

test("compile diagnostics cover pipeline cycles", () => {
  assert.throws(() => engine.compile({ artifacts: [
    pipeline("p1", [{ pipeline: "p2" }]),
    pipeline("p2", [{ pipeline: "p1" }]),
  ] }), (error) => {
    assert.ok(error.errors.some((d) => d.code === "PIPELINE_CYCLE_DETECTED"));
    return true;
  });
});

test("schema subpath is available to external consumer", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const path = require("node:path");
  const { execFileSync } = require("node:child_process");
  const cwd = process.cwd();
  execFileSync("npm", ["pack"], { cwd, stdio: "ignore" });
  const tgz = path.join(cwd, "processengine-rules-1.0.0.tgz");
  const dir = mkdtempSync(path.join(tmpdir(), "rules-schema-"));
  try {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true }, null, 2));
    execFileSync("npm", ["install", tgz], { cwd: dir, stdio: "ignore" });
    const output = execFileSync(process.execPath, ["-e", `const schema = require('@processengine/rules/schema'); if (!schema || schema.type !== 'object' || !schema.properties || !schema.properties.artifacts) process.exit(1); console.log('ok');`], { cwd: dir, encoding: "utf8" }).trim();
    assert.equal(output, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(tgz, { force: true });
  }
});
