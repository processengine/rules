export type IssueLevel = "WARNING" | "ERROR" | "EXCEPTION";
export type PipelineStatus = "OK" | "OK_WITH_WARNINGS" | "ERROR" | "EXCEPTION" | "ABORT";
export type PipelineControl = "CONTINUE" | "STOP";
export type DiagnosticSeverity = "error" | "warning";
export type CompilePhase = "registry_build" | "schema_validation" | "uniqueness_validation" | "reference_validation" | "dag_validation";
export type RuntimePhase = "input_validation" | "entrypoint_lookup" | "pipeline_execution";

export interface Issue {
  kind: "ISSUE";
  level: IssueLevel;
  code: string;
  message: string;
  field: string | null | undefined;
  ruleId: string;
  expected?: unknown;
  actual?: unknown;
  stepId?: string;
  pipelineId?: string;
  meta?: Record<string, unknown>;
}

export interface TraceEntry {
  kind: "TRACE";
  message: string;
  data: Record<string, unknown>;
  ts: string;
}

export interface RuntimeErrorShape {
  code: string;
  message: string;
  phase: RuntimePhase | string;
  pipelineId: string | null;
  details: Record<string, unknown> | null;
}

export type PipelineResult =
  | { status: "OK"; control: "CONTINUE"; issues: Issue[]; trace: TraceEntry[] }
  | { status: "OK_WITH_WARNINGS"; control: "CONTINUE"; issues: Issue[]; trace: TraceEntry[] }
  | { status: "ERROR"; control: "STOP"; issues: Issue[]; trace: TraceEntry[] }
  | { status: "EXCEPTION"; control: "STOP"; issues: Issue[]; trace: TraceEntry[] }
  | { status: "ABORT"; control: "STOP"; issues: Issue[]; trace: TraceEntry[]; error: RuntimeErrorShape };

export interface CompileDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  phase: CompilePhase | string;
  artifactId: string | null;
  path: string | null;
  pipelineId: string | null;
  ruleId: string | null;
  stepIndex: number | null;
  conditionIndex: number | null;
  details: Record<string, unknown> | null;
}

export class CompilationError extends Error {
  readonly diagnostics: ReadonlyArray<CompileDiagnostic>;
  readonly errors: ReadonlyArray<CompileDiagnostic>;
  readonly warnings: ReadonlyArray<CompileDiagnostic>;
}

export interface OperatorContext {
  payload: Record<string, unknown>;
  get(path: string): { ok: true; value: unknown } | { ok: false; value: undefined };
  has(path: string): boolean;
  getDictionary(id: string): Record<string, unknown> | null;
  payloadKeys?: string[];
}

export interface CheckResult {
  status: "OK" | "FAIL" | "EXCEPTION";
  error?: Error;
  field?: string;
  actual?: unknown;
  failures?: Array<{ field: string; actual?: unknown; meta?: Record<string, unknown> }>;
  meta?: Record<string, unknown>;
}

export interface PredicateResult {
  status: "TRUE" | "FALSE" | "UNDEFINED" | "EXCEPTION";
  error?: Error;
}

export type CheckOperator = (rule: RuleArtifact, ctx: OperatorContext) => CheckResult;
export type PredicateOperator = (rule: RuleArtifact, ctx: OperatorContext) => PredicateResult;

export interface OperatorPack {
  check: Record<string, CheckOperator>;
  predicate: Record<string, PredicateOperator>;
}

export interface StepRefRule { stepId?: string; rule: string; }
export interface StepRefPipeline { stepId?: string; pipeline: string; }
export interface StepRefCondition { stepId?: string; condition: string; }
export type StepRef = StepRefRule | StepRefPipeline | StepRefCondition;

export interface DictionaryArtifact {
  id: string;
  type: "dictionary";
  description: string;
  entries: unknown[];
}

export interface AggregateOptions {
  mode?: string;
  onEmpty?: string;
  op?: string;
  value?: number;
  summaryIssue?: boolean;
}

export interface RuleArtifact {
  id: string;
  type: "rule";
  description: string;
  role: "check" | "predicate";
  operator: string;
  field?: string;
  value?: unknown;
  value_field?: string;
  fields?: string[];
  paths?: string[];
  level?: IssueLevel;
  code?: string;
  message?: string;
  flags?: string;
  aggregate?: AggregateOptions;
  meta?: Record<string, unknown>;
  dictionary?: { type: "static"; id: string };
}

export interface ConditionArtifact {
  id: string;
  type: "condition";
  description: string;
  when: string | { all: Array<string | { all: unknown[] } | { any: unknown[] }> } | { any: Array<string | { all: unknown[] } | { any: unknown[] }> };
  steps: StepRef[];
}

export interface PipelineArtifact {
  id: string;
  type: "pipeline";
  description: string;
  entrypoint: boolean;
  strict: boolean;
  required_context?: string[];
  flow: StepRef[];
  message?: string;
  strictCode?: string;
}

export type Artifact = RuleArtifact | ConditionArtifact | PipelineArtifact | DictionaryArtifact;

export interface RulesDefinition {
  artifacts: Artifact[];
}

export interface CompiledRules {
  readonly kind: "compiled-rules";
  readonly version: 1;
  readonly diagnostics: ReadonlyArray<CompileDiagnostic>;
}

export interface CompileOptions {}

export interface RunOptions {
  trace?: boolean;
}

export interface Engine {
  compile(definition: RulesDefinition, options?: CompileOptions): CompiledRules;
  runPipeline(compiled: CompiledRules, pipelineId: string, payload: Record<string, unknown>, options?: RunOptions): PipelineResult;
}

export function createEngine(options: { operators: OperatorPack }): Engine;
export const Operators: OperatorPack;
export function formatDiagnostic(diagnostic: CompileDiagnostic): string;
