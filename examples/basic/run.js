const { createEngine, Operators } = require("../../index.js");
const engine = createEngine({ operators: Operators });
const compiled = engine.compile({
  artifacts: [
    {
      id: "library.r",
      type: "rule",
      description: "r",
      role: "check",
      operator: "not_empty",
      field: "name",
      level: "ERROR",
      code: "NAME.REQUIRED",
      message: "Name required",
    },
    {
      id: "p",
      type: "pipeline",
      description: "p",
      entrypoint: true,
      strict: false,
      flow: [{ rule: "library.r" }],
    },
  ],
});
console.log(
  JSON.stringify(engine.runPipeline(compiled, "p", { name: "" }), null, 2),
);
