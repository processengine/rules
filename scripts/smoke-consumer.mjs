import pkg from '../index.js';
import schema from '../src/schema/rules.schema.json' with { type: 'json' };
const { createEngine, Operators, CompilationError } = pkg;

const engine = createEngine({ operators: Operators });
const compiled = engine.compile({
  artifacts: [
    { id: 'library.warn', type: 'rule', description: 'warn', role: 'check', operator: 'not_empty', field: 'name', level: 'WARNING', code: 'NAME.WARNING', message: 'Name warning' },
    { id: 'p', type: 'pipeline', description: 'p', entrypoint: true, strict: false, flow: [{ rule: 'library.warn' }] }
  ]
});
const result = engine.runPipeline(compiled, 'p', { name: '' });
if (result.status !== 'OK_WITH_WARNINGS') throw new Error('Expected OK_WITH_WARNINGS');
if (!schema || schema.type !== 'object') throw new Error('Schema import failed');
let failed = false;
try {
  engine.compile({ artifacts: [{ id: 'bad', type: 'pipeline', description: 'bad', entrypoint: true, strict: false, flow: [] }] });
} catch (error) {
  failed = error instanceof CompilationError;
}
if (!failed) throw new Error('Expected CompilationError for invalid pipeline');
console.log('smoke consumer ok');
