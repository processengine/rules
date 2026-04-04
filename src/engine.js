"use strict";

const { assert, isObject } = require("./utils");
const { compile } = require("./compiler/index.js");
const { runPipeline } = require("./runner");

function createEngine({ operators }) {
  assert(isObject(operators), "createEngine: operators must be provided");
  assert(isObject(operators.check), "createEngine: operators.check must be an object");
  assert(isObject(operators.predicate), "createEngine: operators.predicate must be an object");

  return {
    compile(definition, options = {}) {
      return compile(definition, { operators, sources: options.sources });
    },
    runPipeline(compiled, pipelineId, payload, options) {
      return runPipeline(compiled, pipelineId, payload, options);
    },
  };
}

module.exports = { createEngine };
