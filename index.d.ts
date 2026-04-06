export type RulesDiagnosticLevel = 'error' | 'warning';
export type RulesStatus = 'OK' | 'OK_WITH_WARNINGS' | 'ERROR' | 'EXCEPTION' | 'ABORT';
export type RulesControl = 'CONTINUE' | 'STOP';
export type TraceMode = false | 'basic' | 'verbose';

export interface RulesDiagnostic {
  code: string;
  level: RulesDiagnosticLevel;
  message: string;
  path: string | null;
  location: string | null;
  details?: Record<string, unknown> | null;
  phase?: string | null;
  artifactId?: string | null;
  pipelineId?: string | null;
  ruleId?: string | null;
}

export interface RulesCompileResult {
  ok: boolean;
  diagnostics: readonly RulesDiagnostic[];
}

export interface RulesIssue {
  kind: 'ISSUE';
  level: 'WARNING' | 'ERROR' | 'EXCEPTION';
  code: string;
  message: string;
  field?: string | null;
  ruleId: string;
  pipelineId?: string;
  stepId?: string;
  expected?: unknown;
  actual?: unknown;
  meta?: Record<string, unknown>;
}

export interface RulesTraceEvent {
  kind: 'TRACE';
  artifactType: 'rules';
  artifactId: string | null;
  step: string;
  at: string;
  outcome: string;
  details?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
}

export interface RulesRuntimeErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface PreparedRulesArtifact {
  kind: 'prepared-rules';
  artifactType: 'rules';
  version: string;
  diagnostics: readonly RulesDiagnostic[];
}

export interface OperatorContext {
  payload: Record<string, unknown>;
  get(path: string): { ok: true; value: unknown } | { ok: false; value: undefined };
  has(path: string): boolean;
  getDictionary(id: string): Record<string, unknown> | null;
  payloadKeys?: string[];
}

export type CheckResult = { status: 'OK' | 'FAIL' | 'EXCEPTION'; error?: Error; field?: string; actual?: unknown; failures?: Array<{ field: string; actual?: unknown; meta?: Record<string, unknown> }>; meta?: Record<string, unknown> };
export type PredicateResult = { status: 'TRUE' | 'FALSE' | 'UNDEFINED' | 'EXCEPTION'; error?: Error };
export type CheckOperator = (rule: Record<string, unknown>, ctx: OperatorContext) => CheckResult;
export type PredicateOperator = (rule: Record<string, unknown>, ctx: OperatorContext) => PredicateResult;
export interface OperatorPack { check?: Record<string, CheckOperator>; predicate?: Record<string, PredicateOperator>; }

export interface EvaluateRulesInput {
  pipelineId?: string;
  payload: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export type EvaluateRulesResult =
  | { status: 'OK' | 'OK_WITH_WARNINGS' | 'ERROR' | 'EXCEPTION'; control: RulesControl; issues: RulesIssue[]; trace?: RulesTraceEvent[] }
  | { status: 'ABORT'; control: 'STOP'; issues: RulesIssue[]; trace?: RulesTraceEvent[]; error: RulesRuntimeErrorShape };

export class RulesCompileError extends Error {
  readonly code: string;
  readonly diagnostics: readonly RulesDiagnostic[];
}

export class RulesRuntimeError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown> | null;
}

export function validateRules(source: Record<string, unknown>, options?: { operators?: OperatorPack }): RulesCompileResult;
export function prepareRules(source: Record<string, unknown>, options?: { operators?: OperatorPack }): PreparedRulesArtifact;
export function evaluateRules(artifact: PreparedRulesArtifact, input: EvaluateRulesInput, options?: { trace?: TraceMode; traceRedactor?: (value: unknown, mode: TraceMode) => unknown }): EvaluateRulesResult;
export function formatRulesDiagnostics(diagnostics: RulesDiagnostic[] | RulesDiagnostic): string;
export function formatRulesRuntimeError(error: RulesRuntimeErrorShape | RulesRuntimeError | Error): string;
