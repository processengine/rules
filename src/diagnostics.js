"use strict";

function makeDiagnostic({ severity = "error", code, message, phase, artifactId = null, path = null, pipelineId = null, ruleId = null, stepIndex = null, conditionIndex = null, details = null }) {
  return Object.freeze({
    severity,
    code,
    message,
    phase,
    artifactId,
    path,
    pipelineId,
    ruleId,
    stepIndex,
    conditionIndex,
    details,
  });
}

function formatDiagnostic(diagnostic) {
  const parts = [];
  parts.push(`[${diagnostic.severity.toUpperCase()}]`);
  parts.push(diagnostic.code);
  if (diagnostic.phase) parts.push(`phase=${diagnostic.phase}`);
  if (diagnostic.artifactId) parts.push(`artifact=${diagnostic.artifactId}`);
  if (diagnostic.pipelineId) parts.push(`pipeline=${diagnostic.pipelineId}`);
  if (diagnostic.ruleId) parts.push(`rule=${diagnostic.ruleId}`);
  if (diagnostic.path) parts.push(`path=${diagnostic.path}`);
  return `${parts.join(" ")} — ${diagnostic.message}`;
}

class CompilationError extends Error {
  constructor(diagnostics) {
    const list = Array.isArray(diagnostics) ? diagnostics : [];
    const lines = list.map((d, i) => `  ${i + 1}. ${formatDiagnostic(d)}`).join("\n");
    super(`@processengine/rules compilation failed with ${list.length} diagnostic(s):\n${lines}`);
    this.name = "CompilationError";
    this.diagnostics = Object.freeze(list.slice());
    this.errors = Object.freeze(list.filter((d) => d.severity === "error"));
    this.warnings = Object.freeze(list.filter((d) => d.severity === "warning"));
  }
}

module.exports = {
  makeDiagnostic,
  formatDiagnostic,
  CompilationError,
};
